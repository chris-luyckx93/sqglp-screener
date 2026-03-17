import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  Tooltip as RechartsTooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";
import {
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Search,
  ChevronUp,
  ChevronDown,
  BarChart3,
  Target,
  Shield,
  Clock,
  DollarSign,
  Activity,
  Sun,
  Moon,
  Info,
  Menu,
  X,
  SlidersHorizontal,
  History,
} from "lucide-react";
import type { StockData } from "@shared/schema";

interface FetchStatus {
  state: "idle" | "fetching" | "done" | "error";
  message: string;
  progress: number;
}

interface BacktestTier {
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
}

type BacktestData = Record<string, BacktestTier>;

type SortKey = keyof StockData;
type SortDir = "asc" | "desc";

const BUCKET_COLORS = [
  "hsl(0, 70%, 55%)",
  "hsl(10, 65%, 55%)",
  "hsl(20, 60%, 55%)",
  "hsl(30, 55%, 55%)",
  "hsl(40, 50%, 55%)",
  "hsl(50, 50%, 55%)",
  "hsl(75, 50%, 48%)",
  "hsl(120, 40%, 48%)",
  "hsl(150, 50%, 42%)",
  "hsl(160, 65%, 38%)",
];

function ScoreBar({ value, max = 100 }: { value: number | null; max?: number }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const hue = (pct / 100) * 120;
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: `hsl(${hue}, 60%, 50%)` }}
        />
      </div>
      <span className="text-xs font-mono w-8 text-right tabular-nums">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function BucketBadge({ bucket }: { bucket: number | null }) {
  if (!bucket) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge
      variant="outline"
      className="font-mono text-xs tabular-nums px-2"
      style={{
        borderColor: BUCKET_COLORS[bucket - 1],
        color: BUCKET_COLORS[bucket - 1],
        backgroundColor: `${BUCKET_COLORS[bucket - 1]}15`,
      }}
      data-testid={`badge-bucket-${bucket}`}
    >
      {bucket}
    </Badge>
  );
}

function formatMarketCap(val: number | null): string {
  if (!val) return "—";
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  return `$${val.toLocaleString()}`;
}

function formatPct(val: number | null): string {
  if (val === null || val === undefined) return "—";
  return `${val > 0 ? "+" : ""}${val.toFixed(1)}%`;
}

// Sidebar content extracted so it can be reused in both desktop aside and mobile sheet
function SidebarContent({
  region,
  setRegion,
  weights,
  handleWeightChange,
  applyWeights,
  rescorePending,
  isDark,
  toggleTheme,
}: {
  region: string;
  setRegion: (v: string) => void;
  weights: Record<string, number>;
  handleWeightChange: (factor: string, value: number[]) => void;
  applyWeights: () => void;
  rescorePending: boolean;
  isDark: boolean;
  toggleTheme: () => void;
}) {
  return (
    <>
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-1">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-label="SQGLP Screener">
            <rect x="2" y="2" width="28" height="28" rx="6" fill="currentColor" className="text-primary" />
            <path d="M8 22V14L12 10L16 16L20 8L24 14V22" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <h1 className="text-base font-semibold text-sidebar-foreground tracking-tight">
            SQGLP+ST
          </h1>
        </div>
        <p className="text-xs text-sidebar-foreground/60">Multibagger Screener</p>
      </div>

      <div className="p-4 border-b border-sidebar-border">
        <label className="text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider mb-2 block">
          Region
        </label>
        <Select value={region} onValueChange={(v) => setRegion(v)}>
          <SelectTrigger className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground" data-testid="select-region">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="US">US Stocks</SelectItem>
            <SelectItem value="CA">Canada Stocks</SelectItem>
            <SelectItem value="EU">Europe Stocks</SelectItem>
            <SelectItem value="ALL">All Regions</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="p-4 flex-1">
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider">
            Factor Weights
          </label>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3 w-3 text-sidebar-foreground/40" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[200px]">
              <p className="text-xs">Adjust weights to emphasize different factors. Total doesn't need to sum to 100.</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {[
          { key: "quality", label: "Q — Quality", icon: Shield, desc: "ROE, ROI, ROA" },
          { key: "longevity", label: "L — Longevity", icon: Clock, desc: "Altman Z, Piotroski, Margin" },
          { key: "price", label: "P — Price", icon: DollarSign, desc: "EV/EBITDA, EV/Sales" },
          { key: "timing", label: "T — Timing", icon: TrendingUp, desc: "13W, 26W, 52W momentum" },
          { key: "sentiment", label: "S — Sentiment", icon: Activity, desc: "Revisions, SI%, Insiders" },
        ].map(({ key, label, icon: Icon, desc }) => (
          <div key={key} className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Icon className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium text-sidebar-foreground">{label}</span>
              </div>
              <span className="text-xs font-mono text-primary tabular-nums" data-testid={`weight-value-${key}`}>
                {weights[key as keyof typeof weights]}%
              </span>
            </div>
            <Slider
              value={[weights[key as keyof typeof weights]]}
              onValueChange={(v) => handleWeightChange(key, v)}
              max={100}
              step={5}
              className="w-full"
              data-testid={`slider-${key}`}
            />
            <p className="text-[10px] text-sidebar-foreground/40 mt-0.5">{desc}</p>
          </div>
        ))}

        <Button
          onClick={applyWeights}
          disabled={rescorePending}
          className="w-full mt-2"
          size="sm"
          data-testid="button-apply-weights"
        >
          {rescorePending ? (
            <RefreshCw className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Target className="h-3 w-3 mr-1" />
          )}
          Apply Weights
        </Button>
      </div>

      <div className="p-4 border-t border-sidebar-border space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground text-xs"
          onClick={toggleTheme}
          data-testid="button-toggle-theme"
        >
          {isDark ? <Sun className="h-3 w-3 mr-2" /> : <Moon className="h-3 w-3 mr-2" />}
          {isDark ? "Light mode" : "Dark mode"}
        </Button>
        <a
          href="https://www.perplexity.ai/computer"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[10px] text-sidebar-foreground/30 hover:text-sidebar-foreground/50 transition-colors"
        >
          Created with Perplexity Computer
        </a>
      </div>
    </>
  );
}

export default function Dashboard() {
  const [region, setRegion] = useState<string>("US");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockData | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDark, setIsDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [weights, setWeights] = useState({
    quality: 10,
    longevity: 20,
    price: 40,
    timing: 20,
    sentiment: 10,
  });

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  useState(() => {
    document.documentElement.classList.toggle("dark", isDark);
  });

  const [fetchStatus, setFetchStatus] = useState<FetchStatus>({ state: "idle", message: "", progress: 0 });
  const [isFetchingLive, setIsFetchingLive] = useState(false);

  const { data: stocksData, isLoading } = useQuery<{
    stocks: StockData[];
    totalCount: number;
    lastUpdated: string;
    dataSource?: string;
  }>({
    queryKey: ["/api/stocks", `?region=${region}`],
  });

  const { data: bucketData } = useQuery<
    Record<string, { count: number; avgScore: number; stocks: string[] }>
  >({
    queryKey: ["/api/stats/buckets", `?region=${region}`],
  });

  const { data: backtestData } = useQuery<BacktestData>({
    queryKey: ["/api/backtest"],
  });

  const rescoreMutation = useMutation({
    mutationFn: async (newWeights: typeof weights) => {
      const res = await apiRequest("POST", "/api/rescore", {
        ...newWeights,
        region,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/buckets"] });
    },
  });

  // Poll fetch status when a live fetch is in progress
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/fetch-status");
      const status: FetchStatus = await res.json();
      setFetchStatus(status);

      if (status.state === "done") {
        setIsFetchingLive(false);
        queryClient.invalidateQueries({ queryKey: ["/api/stocks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stats/buckets"] });
      } else if (status.state === "error") {
        setIsFetchingLive(false);
      }
      return status;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!isFetchingLive) return;
    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [isFetchingLive, pollStatus]);

  const refreshMutation = useMutation({
    mutationFn: async () => {
      setIsFetchingLive(true);
      setFetchStatus({ state: "fetching", message: "Starting live data fetch...", progress: 5 });
      const res = await apiRequest("POST", "/api/refresh", { region });
      return res.json();
    },
    onError: () => {
      setIsFetchingLive(false);
      setFetchStatus({ state: "error", message: "Failed to start fetch", progress: 0 });
    },
  });

  const stocks = stocksData?.stocks ?? [];

  const filteredStocks = useMemo(() => {
    let result = [...stocks];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.ticker.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.sector.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [stocks, searchQuery, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "rank" ? "asc" : "desc");
    }
  };

  const handleWeightChange = (factor: string, value: number[]) => {
    const newWeights = { ...weights, [factor]: value[0] };
    setWeights(newWeights);
  };

  const applyWeights = () => {
    rescoreMutation.mutate(weights);
  };

  const bucketChartData = useMemo(() => {
    if (!bucketData) return [];
    return Array.from({ length: 10 }, (_, i) => {
      const b = bucketData[String(i + 1)];
      return {
        bucket: i + 1,
        avgScore: b?.avgScore ?? 0,
        count: b?.count ?? 0,
      };
    });
  }, [bucketData]);

  const topBucket = stocks.filter((s) => s.bucket === 10);
  const bottomBucket = stocks.filter((s) => s.bucket === 1);
  const avgTopScore =
    topBucket.length > 0
      ? topBucket.reduce((s, t) => s + (t.compositeScore ?? 0), 0) / topBucket.length
      : 0;
  const avgBottomScore =
    bottomBucket.length > 0
      ? bottomBucket.reduce((s, t) => s + (t.compositeScore ?? 0), 0) / bottomBucket.length
      : 0;

  const radarData = selectedStock
    ? [
        { factor: "Quality", value: selectedStock.qualityScore ?? 0, fullMark: 100 },
        { factor: "Longevity", value: selectedStock.longevityScore ?? 0, fullMark: 100 },
        { factor: "Price", value: selectedStock.priceScore ?? 0, fullMark: 100 },
        { factor: "Timing", value: selectedStock.timingScore ?? 0, fullMark: 100 },
        { factor: "Sentiment", value: selectedStock.sentimentScore ?? 0, fullMark: 100 },
      ]
    : [];

  const [showBacktest, setShowBacktest] = useState(false);

  const backtestChartData = useMemo(() => {
    if (!backtestData) return [];
    return ["13W", "26W", "52W"].map((period) => {
      const key = `avg${period}` as "avg13W" | "avg26W" | "avg52W";
      return {
        period,
        Top: backtestData.top?.[key] !== null ? Number((backtestData.top[key] ?? 0).toFixed(1)) : 0,
        Middle: backtestData.mid?.[key] !== null ? Number((backtestData.mid[key] ?? 0).toFixed(1)) : 0,
        Bottom: backtestData.bottom?.[key] !== null ? Number((backtestData.bottom[key] ?? 0).toFixed(1)) : 0,
      };
    });
  }, [backtestData]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  };

  const sidebarProps = {
    region,
    setRegion,
    weights,
    handleWeightChange,
    applyWeights,
    rescorePending: rescoreMutation.isPending,
    isDark,
    toggleTheme,
  };

  // Mobile card view for stock rows
  const MobileStockCard = ({ stock }: { stock: StockData }) => (
    <div
      className={`p-3 border-b border-border/50 cursor-pointer active:bg-muted/30 ${
        selectedStock?.ticker === stock.ticker ? "bg-primary/5" : ""
      }`}
      onClick={() => setSelectedStock(stock)}
      data-testid={`row-stock-${stock.ticker}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BucketBadge bucket={stock.bucket} />
          <span className="font-mono font-semibold text-sm">{stock.ticker}</span>
          <span className="text-xs text-muted-foreground">#{stock.rank}</span>
        </div>
        <span className="font-mono text-xs tabular-nums">{formatMarketCap(stock.marketCap)}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-2 truncate">{stock.name} · {stock.sector}</p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Composite</span>
        <ScoreBar value={stock.compositeScore} />
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background" data-testid="dashboard-root">
      {/* Desktop Sidebar — hidden below lg */}
      <aside className="hidden lg:flex w-72 shrink-0 bg-sidebar border-r border-sidebar-border flex-col overflow-y-auto overscroll-contain">
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto overscroll-contain">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Mobile hamburger */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="lg:hidden shrink-0 -ml-1" data-testid="button-mobile-menu">
                    <SlidersHorizontal className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border">
                  <SidebarContent {...sidebarProps} />
                </SheetContent>
              </Sheet>
              <div className="min-w-0">
                <h2 className="text-base lg:text-lg font-semibold truncate">
                  {region === "ALL" ? "All Regions" : region === "US" ? "United States" : region === "CA" ? "Canada" : "Europe"}
                </h2>
                <p className="text-xs text-muted-foreground truncate">
                  {stocks.length} stocks · Updated{" "}
                  {stocksData?.lastUpdated
                    ? new Date(stocksData.lastUpdated).toLocaleTimeString()
                    : "—"}
                  {stocksData?.dataSource && (
                    <span className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      stocksData.dataSource === "yahoo-finance"
                        ? "bg-green-500/10 text-green-600 dark:text-green-400"
                        : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                    }`}>
                      {stocksData.dataSource === "yahoo-finance" ? "Live" : "Simulated"}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative hidden sm:block">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-40 lg:w-56 rounded-md border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="input-search"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending || isFetchingLive}
                data-testid="button-refresh"
                className="hidden sm:flex"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${(refreshMutation.isPending || isFetchingLive) ? "animate-spin" : ""}`} />
                {isFetchingLive ? "Fetching..." : "Fetch Live"}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending || isFetchingLive}
                className="sm:hidden h-8 w-8"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${(refreshMutation.isPending || isFetchingLive) ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
          {/* Mobile search bar */}
          <div className="sm:hidden mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search ticker or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="input-search-mobile"
              />
            </div>
          </div>
        </header>

        {/* Live fetch progress banner */}
        {isFetchingLive && (
          <div className="mx-4 lg:mx-6 mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center gap-3 mb-2">
              <RefreshCw className="h-4 w-4 text-primary animate-spin shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Fetching live data from Yahoo Finance</p>
                <p className="text-xs text-muted-foreground truncate">{fetchStatus.message}</p>
              </div>
              <span className="text-xs font-mono text-primary tabular-nums shrink-0">{fetchStatus.progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${fetchStatus.progress}%` }}
              />
            </div>
          </div>
        )}

        {fetchStatus.state === "error" && !isFetchingLive && fetchStatus.message && (
          <div className="mx-4 lg:mx-6 mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-sm text-destructive">Fetch error: {fetchStatus.message}</p>
            <p className="text-xs text-muted-foreground mt-1">Using cached data. Try refreshing again.</p>
          </div>
        )}

        <div className="p-4 lg:p-6 space-y-4 lg:space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <Card>
              <CardContent className="p-3 lg:p-4">
                <p className="text-[10px] lg:text-xs text-muted-foreground mb-1">Total Stocks</p>
                <p className="text-xl lg:text-2xl font-semibold tabular-nums" data-testid="text-total-stocks">{stocks.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 lg:p-4">
                <p className="text-[10px] lg:text-xs text-muted-foreground mb-1">Top Bucket Avg</p>
                <div className="flex items-baseline gap-1">
                  <p className="text-xl lg:text-2xl font-semibold tabular-nums text-primary" data-testid="text-top-score">
                    {avgTopScore.toFixed(1)}
                  </p>
                  <TrendingUp className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 lg:p-4">
                <p className="text-[10px] lg:text-xs text-muted-foreground mb-1">Bottom Bucket Avg</p>
                <div className="flex items-baseline gap-1">
                  <p className="text-xl lg:text-2xl font-semibold tabular-nums text-destructive" data-testid="text-bottom-score">
                    {avgBottomScore.toFixed(1)}
                  </p>
                  <TrendingDown className="h-3 w-3 lg:h-4 lg:w-4 text-destructive" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 lg:p-4">
                <p className="text-[10px] lg:text-xs text-muted-foreground mb-1">Score Spread</p>
                <p className="text-xl lg:text-2xl font-semibold tabular-nums" data-testid="text-spread">
                  {(avgTopScore - avgBottomScore).toFixed(1)}
                </p>
                <p className="text-[10px] text-muted-foreground">B10 vs B1</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 px-3 lg:px-6">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Score by Quantile Bucket
                </CardTitle>
              </CardHeader>
              <CardContent className="px-1 lg:px-6">
                <div className="h-48 lg:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bucketChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "6px",
                          fontSize: 12,
                        }}
                        formatter={(value: number) => [value.toFixed(1), "Avg Score"]}
                        labelFormatter={(label: number) => `Bucket ${label}`}
                      />
                      <Bar dataKey="avgScore" radius={[4, 4, 0, 0]}>
                        {bucketChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={BUCKET_COLORS[index]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 px-3 lg:px-6">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  Factor Breakdown
                  {selectedStock && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {selectedStock.ticker}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-1 lg:px-6">
                <div className="h-48 lg:h-64">
                  {selectedStock ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
                        <PolarGrid className="opacity-30" />
                        <PolarAngleAxis dataKey="factor" tick={{ fontSize: 10 }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Radar
                          name={selectedStock.ticker}
                          dataKey="value"
                          stroke="hsl(var(--primary))"
                          fill="hsl(var(--primary))"
                          fillOpacity={0.2}
                          strokeWidth={2}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
                      Tap a stock to see its factor breakdown
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Backtest: Bucket Performance Comparison */}
          <Card>
            <CardHeader className="pb-2 px-3 lg:px-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Backtest — Bucket Performance
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowBacktest(!showBacktest)}
                  data-testid="button-toggle-backtest"
                  className="text-xs"
                >
                  {showBacktest ? (
                    <><ChevronUp className="h-3 w-3 mr-1" />Hide</>
                  ) : (
                    <><ChevronDown className="h-3 w-3 mr-1" />Show</>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                How stocks currently in each bucket tier performed over the past 13, 26, and 52 weeks
              </p>
            </CardHeader>
            {showBacktest && backtestData && (
              <CardContent className="px-3 lg:px-6 space-y-6">
                {/* Grouped Bar Chart — Avg Returns by Tier */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Average Return by Tier (%)</h4>
                  <div className="h-56 lg:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={backtestChartData} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "6px",
                            fontSize: 12,
                          }}
                          formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, `${name} Buckets`]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Top" fill="hsl(150, 50%, 42%)" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Middle" fill="hsl(40, 50%, 55%)" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Bottom" fill="hsl(0, 70%, 55%)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Stats Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" data-testid="table-backtest">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-2 px-2 font-medium">Tier</th>
                        <th className="text-left py-2 px-2 font-medium">Stocks</th>
                        <th className="text-right py-2 px-2 font-medium">Avg 13W</th>
                        <th className="text-right py-2 px-2 font-medium">Avg 26W</th>
                        <th className="text-right py-2 px-2 font-medium">Avg 52W</th>
                        <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">Med 52W</th>
                        <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">% Positive 52W</th>
                        <th className="text-right py-2 px-2 font-medium hidden lg:table-cell">Best (52W)</th>
                        <th className="text-right py-2 px-2 font-medium hidden lg:table-cell">Worst (52W)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["top", "mid", "bottom"] as const).map((key) => {
                        const tier = backtestData[key];
                        if (!tier) return null;
                        return (
                          <tr key={key} className="border-b border-border/50">
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-1.5">
                                <div
                                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                                  style={{ backgroundColor: tier.color }}
                                />
                                <span className="font-medium">{tier.label}</span>
                              </div>
                            </td>
                            <td className="py-2 px-2 font-mono tabular-nums">{tier.count}</td>
                            <td className={`py-2 px-2 text-right font-mono tabular-nums ${(tier.avg13W ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {tier.avg13W !== null ? `${tier.avg13W > 0 ? "+" : ""}${tier.avg13W.toFixed(1)}%` : "—"}
                            </td>
                            <td className={`py-2 px-2 text-right font-mono tabular-nums ${(tier.avg26W ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {tier.avg26W !== null ? `${tier.avg26W > 0 ? "+" : ""}${tier.avg26W.toFixed(1)}%` : "—"}
                            </td>
                            <td className={`py-2 px-2 text-right font-mono tabular-nums ${(tier.avg52W ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {tier.avg52W !== null ? `${tier.avg52W > 0 ? "+" : ""}${tier.avg52W.toFixed(1)}%` : "—"}
                            </td>
                            <td className={`py-2 px-2 text-right font-mono tabular-nums hidden sm:table-cell ${(tier.median52W ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {tier.median52W !== null ? `${tier.median52W > 0 ? "+" : ""}${tier.median52W.toFixed(1)}%` : "—"}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums hidden sm:table-cell">
                              {tier.pctPositive52W !== null ? `${tier.pctPositive52W.toFixed(0)}%` : "—"}
                            </td>
                            <td className="py-2 px-2 text-right hidden lg:table-cell">
                              {tier.bestStock ? (
                                <span className="text-green-500 font-mono tabular-nums">
                                  {tier.bestStock.ticker} +{tier.bestStock.return52W.toFixed(1)}%
                                </span>
                              ) : "—"}
                            </td>
                            <td className="py-2 px-2 text-right hidden lg:table-cell">
                              {tier.worstStock ? (
                                <span className="text-red-500 font-mono tabular-nums">
                                  {tier.worstStock.ticker} {tier.worstStock.return52W.toFixed(1)}%
                                </span>
                              ) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Spread summary */}
                {backtestData.top && backtestData.bottom && (
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <p className="text-xs font-medium mb-1">Top vs Bottom Spread (52W avg return)</p>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold font-mono tabular-nums text-primary">
                          {backtestData.top.avg52W !== null && backtestData.bottom.avg52W !== null
                            ? `${((backtestData.top.avg52W ?? 0) - (backtestData.bottom.avg52W ?? 0) > 0 ? "+" : "")}${((backtestData.top.avg52W ?? 0) - (backtestData.bottom.avg52W ?? 0)).toFixed(1)}pp`
                            : "—"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Top {backtestData.top.avg52W !== null ? `${backtestData.top.avg52W > 0 ? "+" : ""}${backtestData.top.avg52W.toFixed(1)}%` : "—"}
                          {" vs "}
                          Bottom {backtestData.bottom.avg52W !== null ? `${backtestData.bottom.avg52W > 0 ? "+" : ""}${backtestData.bottom.avg52W.toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground max-w-xs">
                      Based on historical price changes of stocks currently in each bucket. This is not a true backtest — it shows how today's bucket members performed over past periods, not how bucket assignments predicted future returns.
                    </p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Rankings — Desktop Table */}
          <Card className="hidden lg:block">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Rankings</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {filteredStocks.length} of {stocks.length} stocks
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-rankings">
                  <thead className="sticky top-0 bg-card z-[1]">
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      {[
                        { key: "rank" as SortKey, label: "#" },
                        { key: "bucket" as SortKey, label: "Bucket" },
                        { key: "ticker" as SortKey, label: "Ticker" },
                        { key: "name" as SortKey, label: "Name" },
                        { key: "sector" as SortKey, label: "Sector" },
                        { key: "marketCap" as SortKey, label: "Mkt Cap" },
                        { key: "compositeScore" as SortKey, label: "Composite" },
                        { key: "qualityScore" as SortKey, label: "Quality" },
                        { key: "longevityScore" as SortKey, label: "Longevity" },
                        { key: "priceScore" as SortKey, label: "Price" },
                        { key: "timingScore" as SortKey, label: "Timing" },
                        { key: "sentimentScore" as SortKey, label: "Sentiment" },
                      ].map(({ key, label }) => (
                        <th
                          key={key}
                          className="px-3 py-2.5 text-left font-medium cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                          onClick={() => handleSort(key)}
                          data-testid={`th-${key}`}
                        >
                          <div className="flex items-center gap-1">
                            {label}
                            <SortIcon column={key} />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 10 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/50">
                          {Array.from({ length: 12 }).map((_, j) => (
                            <td key={j} className="px-3 py-2">
                              <div className="h-4 rounded bg-muted animate-pulse" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : filteredStocks.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                          No stocks match your search.
                        </td>
                      </tr>
                    ) : (
                      filteredStocks.map((stock) => (
                        <tr
                          key={stock.ticker}
                          className={`border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors ${
                            selectedStock?.ticker === stock.ticker ? "bg-primary/5" : ""
                          }`}
                          onClick={() => setSelectedStock(stock)}
                          data-testid={`row-stock-${stock.ticker}`}
                        >
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground tabular-nums">{stock.rank}</td>
                          <td className="px-3 py-2"><BucketBadge bucket={stock.bucket} /></td>
                          <td className="px-3 py-2 font-mono font-semibold text-xs">{stock.ticker}</td>
                          <td className="px-3 py-2 text-xs truncate max-w-[160px]">{stock.name}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[120px]">{stock.sector}</td>
                          <td className="px-3 py-2 font-mono text-xs tabular-nums">{formatMarketCap(stock.marketCap)}</td>
                          <td className="px-3 py-2"><ScoreBar value={stock.compositeScore} /></td>
                          <td className="px-3 py-2"><ScoreBar value={stock.qualityScore} /></td>
                          <td className="px-3 py-2"><ScoreBar value={stock.longevityScore} /></td>
                          <td className="px-3 py-2"><ScoreBar value={stock.priceScore} /></td>
                          <td className="px-3 py-2"><ScoreBar value={stock.timingScore} /></td>
                          <td className="px-3 py-2"><ScoreBar value={stock.sentimentScore} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Rankings — Mobile Card List */}
          <Card className="lg:hidden">
            <CardHeader className="pb-2 px-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Rankings</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {filteredStocks.length} stocks
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3 border-b border-border/50">
                    <div className="h-4 rounded bg-muted animate-pulse mb-2 w-1/2" />
                    <div className="h-3 rounded bg-muted animate-pulse w-3/4" />
                  </div>
                ))
              ) : filteredStocks.length === 0 ? (
                <div className="px-3 py-8 text-center text-muted-foreground text-sm">
                  No stocks match your search.
                </div>
              ) : (
                filteredStocks.map((stock) => (
                  <MobileStockCard key={stock.ticker} stock={stock} />
                ))
              )}
            </CardContent>
          </Card>

          {/* Selected Stock Detail */}
          {selectedStock && (
            <Card>
              <CardHeader className="pb-2 px-3 lg:px-6">
                <CardTitle className="text-sm font-medium">
                  {selectedStock.ticker} — {selectedStock.name}
                  <Badge variant="outline" className="ml-2 text-xs">{selectedStock.region}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 lg:px-6">
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Shield className="h-3 w-3" /> Quality
                    </p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">ROE TTM</span><span className="font-mono tabular-nums">{formatPct(selectedStock.roeTTM)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">ROI TTM</span><span className="font-mono tabular-nums">{formatPct(selectedStock.roiTTM)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">ROA TTM</span><span className="font-mono tabular-nums">{formatPct(selectedStock.roaTTM)}</span></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Longevity
                    </p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Altman Z</span><span className="font-mono tabular-nums">{selectedStock.altmanZOrig?.toFixed(2) ?? "—"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Piotroski F</span><span className="font-mono tabular-nums">{selectedStock.piotroskiFScore ?? "—"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Gross Margin</span><span className="font-mono tabular-nums">{formatPct(selectedStock.grossMarginTTM)}</span></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> Price
                    </p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">EV/EBITDA</span><span className="font-mono tabular-nums">{selectedStock.evToEBITDA?.toFixed(1) ?? "—"}x</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">EV/Sales</span><span className="font-mono tabular-nums">{selectedStock.evToSales?.toFixed(1) ?? "—"}x</span></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Timing
                    </p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">13W</span><span className={`font-mono tabular-nums ${(selectedStock.priceChange13W ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>{formatPct(selectedStock.priceChange13W)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">26W</span><span className={`font-mono tabular-nums ${(selectedStock.priceChange26W ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>{formatPct(selectedStock.priceChange26W)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">52W</span><span className={`font-mono tabular-nums ${(selectedStock.priceChange52W ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>{formatPct(selectedStock.priceChange52W)}</span></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Activity className="h-3 w-3" /> Sentiment
                    </p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">FY Rev</span><span className="font-mono tabular-nums">{formatPct(selectedStock.currentFYRevisionVs4WkAgo)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">SI%</span><span className="font-mono tabular-nums">{formatPct(selectedStock.shortInterestPctFloat)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Ins. Buys</span><span className="font-mono tabular-nums">{selectedStock.insiderPurchases ?? "—"}</span></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
