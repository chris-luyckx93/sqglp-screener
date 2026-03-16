import type { StockData, FactorWeights } from "@shared/schema";

/**
 * Percentile rank a list of values.
 * Returns 0-100 where 100 is the best rank.
 * For "lower is better" metrics, pass invert=true.
 */
function percentileRank(
  values: (number | null)[],
  invert: boolean = false
): (number | null)[] {
  const validIndices: number[] = [];
  const validValues: number[] = [];

  values.forEach((v, i) => {
    if (v !== null && v !== undefined && isFinite(v)) {
      validIndices.push(i);
      validValues.push(v);
    }
  });

  if (validValues.length === 0) {
    return values.map(() => null);
  }

  // Sort indices by value
  const sorted = validIndices
    .map((idx, i) => ({ idx, val: validValues[i] }))
    .sort((a, b) => a.val - b.val);

  const ranks: (number | null)[] = new Array(values.length).fill(null);
  const n = sorted.length;

  sorted.forEach((item, position) => {
    const pctile = (position / (n - 1 || 1)) * 100;
    ranks[item.idx] = invert ? 100 - pctile : pctile;
  });

  return ranks;
}

/**
 * Composite score for a single factor dimension.
 * Averages the sub-factor percentile ranks (equal-weighted within dimension).
 */
function compositeFactor(subFactorRanks: (number | null)[]): number | null {
  const valid = subFactorRanks.filter(
    (v) => v !== null && v !== undefined
  ) as number[];
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

/**
 * Score all stocks in a universe using the SQGLP+ST framework.
 */
export function scoreStocks(
  stocks: StockData[],
  weights: FactorWeights
): StockData[] {
  if (stocks.length === 0) return [];

  // --- Quality (Q) ---
  const roeRanks = percentileRank(stocks.map((s) => s.roeTTM));
  const roiRanks = percentileRank(stocks.map((s) => s.roiTTM));
  const roaRanks = percentileRank(stocks.map((s) => s.roaTTM));

  // --- Longevity (L) ---
  const altmanRanks = percentileRank(stocks.map((s) => s.altmanZOrig));
  const piotroskiRanks = percentileRank(stocks.map((s) => s.piotroskiFScore));
  const gmRanks = percentileRank(stocks.map((s) => s.grossMarginTTM));

  // --- Price (P) - lower is better ---
  const evEbitdaRanks = percentileRank(
    stocks.map((s) => s.evToEBITDA),
    true
  );
  const evSalesRanks = percentileRank(
    stocks.map((s) => s.evToSales),
    true
  );

  // --- Timing (T) ---
  const mom13wRanks = percentileRank(stocks.map((s) => s.priceChange13W));
  const mom26wRanks = percentileRank(stocks.map((s) => s.priceChange26W));
  const mom52wRanks = percentileRank(stocks.map((s) => s.priceChange52W));

  // --- Sentiment (S) ---
  const revisionRanks = percentileRank(
    stocks.map((s) => s.currentFYRevisionVs4WkAgo)
  );
  const siRanks = percentileRank(
    stocks.map((s) => s.shortInterestPctFloat),
    true
  ); // lower SI is better
  const insiderRanks = percentileRank(stocks.map((s) => s.insiderPurchases));

  // Compute dimension scores
  const scored = stocks.map((stock, i) => {
    const qualityScore = compositeFactor([
      roeRanks[i],
      roiRanks[i],
      roaRanks[i],
    ]);
    const longevityScore = compositeFactor([
      altmanRanks[i],
      piotroskiRanks[i],
      gmRanks[i],
    ]);
    const priceScore = compositeFactor([evEbitdaRanks[i], evSalesRanks[i]]);
    const timingScore = compositeFactor([
      mom13wRanks[i],
      mom26wRanks[i],
      mom52wRanks[i],
    ]);
    const sentimentScore = compositeFactor([
      revisionRanks[i],
      siRanks[i],
      insiderRanks[i],
    ]);

    // Weighted composite
    const totalWeight =
      weights.quality +
      weights.longevity +
      weights.price +
      weights.timing +
      weights.sentiment;

    let compositeScore: number | null = null;
    if (totalWeight > 0) {
      const parts: number[] = [];
      if (qualityScore !== null)
        parts.push(qualityScore * (weights.quality / totalWeight));
      if (longevityScore !== null)
        parts.push(longevityScore * (weights.longevity / totalWeight));
      if (priceScore !== null)
        parts.push(priceScore * (weights.price / totalWeight));
      if (timingScore !== null)
        parts.push(timingScore * (weights.timing / totalWeight));
      if (sentimentScore !== null)
        parts.push(sentimentScore * (weights.sentiment / totalWeight));
      compositeScore = parts.length > 0 ? parts.reduce((a, b) => a + b, 0) : null;
    }

    return {
      ...stock,
      qualityScore: qualityScore !== null ? Math.round(qualityScore * 10) / 10 : null,
      longevityScore: longevityScore !== null ? Math.round(longevityScore * 10) / 10 : null,
      priceScore: priceScore !== null ? Math.round(priceScore * 10) / 10 : null,
      timingScore: timingScore !== null ? Math.round(timingScore * 10) / 10 : null,
      sentimentScore: sentimentScore !== null ? Math.round(sentimentScore * 10) / 10 : null,
      compositeScore: compositeScore !== null ? Math.round(compositeScore * 10) / 10 : null,
      rank: null as number | null,
      bucket: null as number | null,
    };
  });

  // Sort by composite score descending and assign ranks + buckets
  const withComposite = scored.filter((s) => s.compositeScore !== null);
  const withoutComposite = scored.filter((s) => s.compositeScore === null);

  withComposite.sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));

  withComposite.forEach((s, i) => {
    s.rank = i + 1;
    // Bucket 10 = top decile, Bucket 1 = bottom decile
    const n = withComposite.length;
    const decile = Math.floor((i / n) * 10);
    s.bucket = Math.min(10, Math.max(1, 10 - decile));
  });

  withoutComposite.forEach((s) => {
    s.rank = withComposite.length + 1;
    s.bucket = null;
  });

  return [...withComposite, ...withoutComposite];
}
