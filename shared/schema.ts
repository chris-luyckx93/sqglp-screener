import { z } from "zod";

// Factor weights for the SQGLP+ST ranking system
export const factorWeightsSchema = z.object({
  quality: z.number().min(0).max(100).default(10),
  longevity: z.number().min(0).max(100).default(20),
  price: z.number().min(0).max(100).default(40),
  timing: z.number().min(0).max(100).default(20),
  sentiment: z.number().min(0).max(100).default(10),
});

export type FactorWeights = z.infer<typeof factorWeightsSchema>;

// Individual stock with all raw metrics and computed scores
export const stockDataSchema = z.object({
  ticker: z.string(),
  name: z.string(),
  sector: z.string(),
  industry: z.string(),
  marketCap: z.number().nullable(),
  price: z.number().nullable(),
  avgVolume20d: z.number().nullable(),
  region: z.enum(["US", "CA", "EU"]),

  // Quality factors (Q)
  roeTTM: z.number().nullable(),
  roiTTM: z.number().nullable(),
  roaTTM: z.number().nullable(),

  // Longevity factors (L)
  altmanZOrig: z.number().nullable(),
  piotroskiFScore: z.number().nullable(),
  grossMarginTTM: z.number().nullable(),

  // Price factors (P) — lower is better
  evToEBITDA: z.number().nullable(),
  evToSales: z.number().nullable(),

  // Timing factors (T) — momentum
  priceChange13W: z.number().nullable(),
  priceChange26W: z.number().nullable(),
  priceChange52W: z.number().nullable(),

  // Sentiment factors (S)
  currentFYRevisionVs4WkAgo: z.number().nullable(),
  shortInterestPctFloat: z.number().nullable(),
  insiderPurchases: z.number().nullable(),

  // Computed scores (0-100 percentile rank within universe)
  qualityScore: z.number().nullable(),
  longevityScore: z.number().nullable(),
  priceScore: z.number().nullable(),
  timingScore: z.number().nullable(),
  sentimentScore: z.number().nullable(),
  compositeScore: z.number().nullable(),
  rank: z.number().nullable(),
  bucket: z.number().min(1).max(10).nullable(),
});

export type StockData = z.infer<typeof stockDataSchema>;

// Screen filters
export const screenFiltersSchema = z.object({
  region: z.enum(["US", "CA", "EU", "ALL"]).default("US"),
  maxMarketCap: z.number().default(300_000_000),
  minPrice: z.number().default(0.10),
  minAvgVolume: z.number().default(10000),
  excludeUtilities: z.boolean().default(true),
  excludeFinancials: z.boolean().default(true),
  minROE12M: z.boolean().default(true), // ROE > industry median
});

export type ScreenFilters = z.infer<typeof screenFiltersSchema>;

// API response
export const screenerResponseSchema = z.object({
  stocks: z.array(stockDataSchema),
  totalCount: z.number(),
  lastUpdated: z.string(),
  weights: factorWeightsSchema,
  filters: screenFiltersSchema,
});

export type ScreenerResponse = z.infer<typeof screenerResponseSchema>;
