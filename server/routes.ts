import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scoreStocks } from "./scoring";
import { generateSeedData } from "./seedData";
import type { FactorWeights, StockData } from "@shared/schema";
import { spawn } from "child_process";
import path from "path";

// Default weights matching the SQGLP+ST system
const DEFAULT_WEIGHTS: FactorWeights = {
  quality: 10,
  longevity: 20,
  price: 40,
  timing: 20,
  sentiment: 10,
};

// Track fetch status
let fetchStatus: {
  state: "idle" | "fetching" | "done" | "error";
  message: string;
  progress: number;
  startedAt?: string;
} = { state: "idle", message: "", progress: 0 };

// Initialize with seed data on startup
function initializeWithSeedData() {
  const raw = generateSeedData();
  const scored = scoreStocks(raw, DEFAULT_WEIGHTS);
  storage.setStocks(scored);
  storage.setLastUpdated(new Date().toISOString());
  storage.setDataSource("simulated");
}

// Fetch live data from Yahoo Finance via Python script
function fetchLiveData(region: string = "ALL"): Promise<StockData[]> {
  return new Promise((resolve, reject) => {
    fetchStatus = {
      state: "fetching",
      message: `Fetching live data for ${region}...`,
      progress: 10,
      startedAt: new Date().toISOString(),
    };

    const pythonScript = path.join(__dirname, "..", "server", "fetch_data.py");
    const pythonPaths = ["python3", "python", "/usr/bin/python3"];

    function tryPython(index: number) {
      if (index >= pythonPaths.length) {
        fetchStatus = { state: "error", message: "Python not found. Install Python 3.", progress: 0 };
        return reject(new Error("Python not found"));
      }

      const pythonCmd = pythonPaths[index];
      const cwd = path.join(__dirname, "..");
      console.log(`[FETCH] Trying: ${pythonCmd} ${pythonScript} ${region}`);
      console.log(`[FETCH] cwd: ${cwd}`);

      const proc = spawn(pythonCmd, [pythonScript, region], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        // Stream each line to console in real time
        text.split("\n").filter(Boolean).forEach((line: string) => {
          console.log(`[PY] ${line}`);
          const clean = line.replace("[FETCH] ", "");
          fetchStatus.message = clean;
          if (line.includes("Discovering")) fetchStatus.progress = 20;
          else if (line.includes("Fetching data")) fetchStatus.progress = 40;
          else if (line.includes("processed")) fetchStatus.progress = 60;
          else if (line.includes("TOTAL")) fetchStatus.progress = 90;
        });
      });

      proc.on("error", (err: NodeJS.ErrnoException) => {
        console.log(`[FETCH] spawn error: ${err.message}`);
        if (err.code === "ENOENT") {
          return tryPython(index + 1);
        }
        fetchStatus = { state: "error", message: `Spawn error: ${err.message}`, progress: 0 };
        reject(err);
      });

      proc.on("close", (code: number | null) => {
        console.log(`[FETCH] Python exited with code ${code}`);
        console.log(`[FETCH] stdout length: ${stdout.length}`);
        console.log(`[FETCH] stderr (last 500): ${stderr.slice(-500)}`);

        if (code !== 0) {
          // Python crashed — include stderr in the error message
          const errMsg = stderr.slice(-300) || `Process exited with code ${code}`;
          fetchStatus = { state: "error", message: `Python error: ${errMsg}`, progress: 0 };
          return reject(new Error(errMsg));
        }

        try {
          const data = JSON.parse(stdout);
          const stocks: StockData[] = data.stocks || [];
          fetchStatus = {
            state: "done",
            message: `Fetched ${stocks.length} stocks`,
            progress: 100,
          };
          resolve(stocks);
        } catch (e) {
          const parseErr = `Failed to parse Python output. stdout[0:200]: ${stdout.slice(0, 200)}`;
          console.log(`[FETCH] ${parseErr}`);
          fetchStatus = { state: "error", message: parseErr, progress: 0 };
          reject(new Error(parseErr));
        }
      });

      // 5 minute timeout
      setTimeout(() => {
        try { proc.kill(); } catch {}
        fetchStatus = { state: "error", message: "Fetch timed out after 5 minutes", progress: 0 };
        reject(new Error("Timeout"));
      }, 300_000);
    }

    tryPython(0);
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Initialize with seed data immediately so the app is usable
  initializeWithSeedData();

  // Get ranked stocks with optional filters
  app.get("/api/stocks", (req, res) => {
    const region = (req.query.region as string) || "ALL";
    const stocks = storage.getStocks(region);
    res.json({
      stocks,
      totalCount: stocks.length,
      lastUpdated: storage.getLastUpdated(),
      dataSource: storage.getDataSource(),
    });
  });

  // Rescore with custom weights
  app.post("/api/rescore", (req, res) => {
    const weights: FactorWeights = {
      quality: Number(req.body.quality) || 10,
      longevity: Number(req.body.longevity) || 20,
      price: Number(req.body.price) || 40,
      timing: Number(req.body.timing) || 20,
      sentiment: Number(req.body.sentiment) || 10,
    };
    const region = (req.body.region as string) || "ALL";

    const allStocks = storage.getAllStocks();
    const raw = allStocks.map((s) => ({
      ...s,
      qualityScore: null,
      longevityScore: null,
      priceScore: null,
      timingScore: null,
      sentimentScore: null,
      compositeScore: null,
      rank: null,
      bucket: null,
    }));

    const scored = scoreStocks(raw, weights);
    storage.setStocks(scored);

    const filtered = region === "ALL" ? scored : scored.filter((s) => s.region === region);
    res.json({
      stocks: filtered,
      totalCount: filtered.length,
      lastUpdated: storage.getLastUpdated(),
      dataSource: storage.getDataSource(),
      weights,
    });
  });

  // Bucket distribution
  app.get("/api/stats/buckets", (req, res) => {
    const region = (req.query.region as string) || "ALL";
    const stocks = storage.getStocks(region);

    const buckets: Record<number, { count: number; avgScore: number; stocks: string[] }> = {};
    for (let i = 1; i <= 10; i++) {
      buckets[i] = { count: 0, avgScore: 0, stocks: [] };
    }

    stocks.forEach((s) => {
      if (s.bucket && s.compositeScore !== null) {
        buckets[s.bucket].count++;
        buckets[s.bucket].avgScore += s.compositeScore;
        buckets[s.bucket].stocks.push(s.ticker);
      }
    });

    Object.keys(buckets).forEach((k) => {
      const b = buckets[Number(k)];
      b.avgScore = b.count > 0 ? Math.round((b.avgScore / b.count) * 10) / 10 : 0;
    });

    res.json(buckets);
  });

  // Stock detail
  app.get("/api/stocks/:ticker", (req, res) => {
    const allStocks = storage.getAllStocks();
    const stock = allStocks.find(
      (s) => s.ticker.toLowerCase() === req.params.ticker.toLowerCase()
    );
    if (!stock) return res.status(404).json({ error: "Stock not found" });
    res.json(stock);
  });

  // Fetch status (for polling during refresh)
  app.get("/api/fetch-status", (_req, res) => {
    res.json(fetchStatus);
  });

  // Refresh: fetch live data from Yahoo Finance
  app.post("/api/refresh", async (req, res) => {
    const region = (req.body?.region as string) || "ALL";

    if (fetchStatus.state === "fetching") {
      return res.status(409).json({
        error: "Fetch already in progress",
        status: fetchStatus,
      });
    }

    // Return immediately, fetch runs in background
    res.json({ success: true, message: "Fetch started", status: fetchStatus });

    try {
      const rawStocks = await fetchLiveData(region);

      if (rawStocks.length > 0) {
        // Score the live data
        const scored = scoreStocks(rawStocks, DEFAULT_WEIGHTS);
        storage.setStocks(scored);
        storage.setLastUpdated(new Date().toISOString());
        storage.setDataSource("yahoo-finance");
        fetchStatus = {
          state: "done",
          message: `Live data loaded: ${scored.length} stocks scored`,
          progress: 100,
        };
      } else {
        fetchStatus = {
          state: "error",
          message: "No stocks returned from Yahoo Finance",
          progress: 0,
        };
      }
    } catch (e: any) {
      fetchStatus = {
        state: "error",
        message: e.message || "Unknown error",
        progress: 0,
      };
    }
  });

  // Backtest: compare historical returns by bucket tier
  app.get("/api/backtest", (_req, res) => {
    const stocks = storage.getAllStocks();

    // Define bucket tiers
    const tiers: Record<string, { label: string; buckets: number[]; color: string }> = {
      top: { label: "Top (8-10)", buckets: [8, 9, 10], color: "hsl(150, 50%, 42%)" },
      mid: { label: "Middle (4-7)", buckets: [4, 5, 6, 7], color: "hsl(40, 50%, 55%)" },
      bottom: { label: "Bottom (1-3)", buckets: [1, 2, 3], color: "hsl(0, 70%, 55%)" },
    };

    type TierStats = {
      label: string;
      color: string;
      count: number;
      avg13W: number | null;
      avg26W: number | null;
      avg52W: number | null;
      median13W: number | null;
      median26W: number | null;
      median52W: number | null;
      pctPositive13W: number | null;
      pctPositive26W: number | null;
      pctPositive52W: number | null;
      bestStock: { ticker: string; return52W: number } | null;
      worstStock: { ticker: string; return52W: number } | null;
      stocks: Array<{ ticker: string; name: string; bucket: number; ret13W: number | null; ret26W: number | null; ret52W: number | null }>;
    };

    function median(arr: number[]): number | null {
      if (arr.length === 0) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    function avg(arr: number[]): number | null {
      if (arr.length === 0) return null;
      return arr.reduce((s, v) => s + v, 0) / arr.length;
    }

    const result: Record<string, TierStats> = {};

    for (const [key, tier] of Object.entries(tiers)) {
      const tierStocks = stocks.filter((s) => s.bucket !== null && tier.buckets.includes(s.bucket));

      const vals13W = tierStocks.map((s) => s.priceChange13W).filter((v): v is number => v !== null);
      const vals26W = tierStocks.map((s) => s.priceChange26W).filter((v): v is number => v !== null);
      const vals52W = tierStocks.map((s) => s.priceChange52W).filter((v): v is number => v !== null);

      // Find best/worst by 52W return
      let bestStock: TierStats["bestStock"] = null;
      let worstStock: TierStats["worstStock"] = null;
      for (const s of tierStocks) {
        if (s.priceChange52W !== null) {
          if (!bestStock || s.priceChange52W > bestStock.return52W) {
            bestStock = { ticker: s.ticker, return52W: s.priceChange52W };
          }
          if (!worstStock || s.priceChange52W < worstStock.return52W) {
            worstStock = { ticker: s.ticker, return52W: s.priceChange52W };
          }
        }
      }

      result[key] = {
        label: tier.label,
        color: tier.color,
        count: tierStocks.length,
        avg13W: avg(vals13W),
        avg26W: avg(vals26W),
        avg52W: avg(vals52W),
        median13W: median(vals13W),
        median26W: median(vals26W),
        median52W: median(vals52W),
        pctPositive13W: vals13W.length > 0 ? (vals13W.filter((v) => v > 0).length / vals13W.length) * 100 : null,
        pctPositive26W: vals26W.length > 0 ? (vals26W.filter((v) => v > 0).length / vals26W.length) * 100 : null,
        pctPositive52W: vals52W.length > 0 ? (vals52W.filter((v) => v > 0).length / vals52W.length) * 100 : null,
        bestStock,
        worstStock,
        stocks: tierStocks.map((s) => ({
          ticker: s.ticker,
          name: s.name,
          bucket: s.bucket!,
          ret13W: s.priceChange13W,
          ret26W: s.priceChange26W,
          ret52W: s.priceChange52W,
        })),
      };
    }

    res.json(result);
  });

  return httpServer;
}
