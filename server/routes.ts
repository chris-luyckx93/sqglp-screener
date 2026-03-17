import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scoreStocks } from "./scoring";
import { generateSeedData } from "./seedData";
import type { FactorWeights, StockData } from "@shared/schema";
import { execFile } from "child_process";
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
    // Try multiple Python paths
    const pythonPaths = ["python3", "python", "/usr/bin/python3"];

    function tryPython(index: number) {
      if (index >= pythonPaths.length) {
        fetchStatus = { state: "error", message: "Python not found", progress: 0 };
        return reject(new Error("Python not found"));
      }

      console.log(`[FETCH] Trying ${pythonPaths[index]} ${pythonScript} ${region}`);
      console.log(`[FETCH] cwd: ${path.join(__dirname, "..")}`);
      const proc = execFile(
        pythonPaths[index],
        [pythonScript, region],
        {
          maxBuffer: 50 * 1024 * 1024, // 50MB buffer
          timeout: 300_000, // 5 min timeout
          cwd: path.join(__dirname, ".."),
        },
        (error, stdout, stderr) => {
          console.log(`[FETCH] stderr: ${stderr?.slice(0, 500)}`);
          console.log(`[FETCH] stdout length: ${stdout?.length}, error: ${error?.message}`);
          // Log progress from stderr
          if (stderr) {
            const lines = stderr.split("\n").filter(Boolean);
            const lastLine = lines[lines.length - 1] || "";
            fetchStatus.message = lastLine.replace("[FETCH] ", "");

            // Estimate progress from log messages
            if (lastLine.includes("Discovering")) fetchStatus.progress = 20;
            else if (lastLine.includes("Fetching data")) fetchStatus.progress = 40;
            else if (lastLine.includes("done")) fetchStatus.progress = 70;
            else if (lastLine.includes("TOTAL")) fetchStatus.progress = 90;
          }

          if (error) {
            // If python3 not found, try next
            if (error.message?.includes("ENOENT") || error.message?.includes("not found")) {
              return tryPython(index + 1);
            }
            fetchStatus = {
              state: "error",
              message: `Fetch failed: ${error.message}`,
              progress: 0,
            };
            return reject(error);
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
            fetchStatus = {
              state: "error",
              message: "Failed to parse response",
              progress: 0,
            };
            reject(new Error("Failed to parse Python output"));
          }
        }
      );
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

  return httpServer;
}
