#!/usr/bin/env python3
"""
SQGLP+ST Yahoo Finance Data Fetcher
Fetches live stock data and computes all metrics needed for the scoring engine.
Outputs JSON to stdout for the Node.js backend to consume.
"""

import yfinance as yf
from yfinance import EquityQuery
import json
import sys
import math
import time
import concurrent.futures
from datetime import datetime, timezone

# ──────────────────────────────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────────────────────────────
MAX_STOCKS_PER_REGION = 100
EXCLUDED_SECTORS = {"Utilities", "Financial Services", "Financial"}
MIN_MARKET_CAP = 1_000_000_000
MAX_MARKET_CAP = 50_000_000_000
MIN_PRICE = 0.10
MIN_AVG_VOLUME = 10_000

REGION_MAP = {
    "US": ["us"],
    "CA": ["ca"],
    "EU": ["gb", "de", "fr", "nl", "se", "ch", "it", "es", "be", "dk", "no", "fi"]
}


def log(msg):
    print(f"[FETCH] {msg}", file=sys.stderr, flush=True)


def safe_div(a, b):
    if a is None or b is None or b == 0:
        return None
    try:
        result = a / b
        return None if (math.isnan(result) or math.isinf(result)) else result
    except:
        return None


def _pct(val):
    if val is None:
        return None
    try:
        result = round(val * 100, 2)
        return None if (math.isnan(result) or math.isinf(result)) else result
    except:
        return None


def clean_val(val):
    """Ensure a value is JSON-safe (no NaN/Inf)."""
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val


# ──────────────────────────────────────────────────────────────────────
# STEP 1: Discover stock universe via Yahoo Finance screener
# ──────────────────────────────────────────────────────────────────────
def get_universe_tickers(country_codes, region_label):
    all_tickers = []

    for code in country_codes:
        try:
            q = EquityQuery('and', [
                EquityQuery('gt', ['intradaymarketcap', MIN_MARKET_CAP]),
                EquityQuery('lt', ['intradaymarketcap', MAX_MARKET_CAP]),
                EquityQuery('gt', ['intradayprice', MIN_PRICE]),
                EquityQuery('gt', ['avgdailyvol3m', MIN_AVG_VOLUME]),
                EquityQuery('eq', ['region', code]),
            ])

            tickers_for_country = []
            for offset in range(0, 500, 25):
                result = yf.screen(q, count=25, offset=offset)
                quotes = result.get('quotes', [])
                for item in quotes:
                    sym = item.get('symbol', '')
                    sector = item.get('sectorDisp', '') or item.get('sector', '')
                    if sym and sector not in EXCLUDED_SECTORS:
                        tickers_for_country.append(sym)
                if len(quotes) < 25:
                    break
                time.sleep(0.05)

            log(f"  {code.upper()}: {len(tickers_for_country)} tickers")
            all_tickers.extend(tickers_for_country)
        except Exception as e:
            log(f"  {code.upper()} error: {e}")

    # Deduplicate and cap
    seen = set()
    unique = []
    for t in all_tickers:
        if t not in seen:
            seen.add(t)
            unique.append(t)

    log(f"  {region_label} total: {len(unique)} unique tickers (capping at {MAX_STOCKS_PER_REGION})")
    return unique[:MAX_STOCKS_PER_REGION]


# ──────────────────────────────────────────────────────────────────────
# STEP 2: Compute Altman Z-Score from balance sheet
# ──────────────────────────────────────────────────────────────────────
def compute_altman_z(info, bs):
    try:
        if bs is None or bs.empty:
            return None
        col = bs.columns[0]

        total_assets = bs.at['Total Assets', col] if 'Total Assets' in bs.index else None
        if not total_assets or total_assets == 0:
            return None

        current_assets = bs.at['Current Assets', col] if 'Current Assets' in bs.index else None
        current_liabilities = bs.at['Current Liabilities', col] if 'Current Liabilities' in bs.index else None
        retained_earnings = bs.at['Retained Earnings', col] if 'Retained Earnings' in bs.index else None
        total_liabilities = bs.at['Total Liabilities Net Minority Interest', col] if 'Total Liabilities Net Minority Interest' in bs.index else None

        working_capital = (current_assets - current_liabilities) if (current_assets is not None and current_liabilities is not None) else None
        market_cap = info.get('marketCap')
        revenue = info.get('totalRevenue')
        ebit = info.get('ebitda')  # EBITDA as proxy

        A = safe_div(working_capital, total_assets)
        B = safe_div(retained_earnings, total_assets)
        C = safe_div(ebit, total_assets)
        D = safe_div(market_cap, total_liabilities)
        E = safe_div(revenue, total_assets)

        parts = [x for x in [
            1.2 * A if A is not None else None,
            1.4 * B if B is not None else None,
            3.3 * C if C is not None else None,
            0.6 * D if D is not None else None,
            1.0 * E if E is not None else None,
        ] if x is not None]

        return round(sum(parts), 2) if len(parts) >= 3 else None
    except:
        return None


# ──────────────────────────────────────────────────────────────────────
# STEP 3: Compute Piotroski F-Score
# ──────────────────────────────────────────────────────────────────────
def compute_piotroski(info, bs, inc, cf):
    try:
        if any(x is None or x.empty for x in [bs, inc, cf]):
            return None
        if len(bs.columns) < 2 or len(inc.columns) < 2:
            return None

        curr, prev = bs.columns[0], bs.columns[1]
        score = 0

        def get(df, row, col):
            try:
                return df.at[row, col] if row in df.index and col in df.columns else None
            except:
                return None

        # 1. ROA > 0
        ni = get(inc, 'Net Income', curr)
        ta = get(bs, 'Total Assets', curr)
        roa = safe_div(ni, ta)
        if roa and roa > 0: score += 1

        # 2. Operating cash flow > 0
        ocf = get(cf, 'Operating Cash Flow', curr)
        if ocf and ocf > 0: score += 1

        # 3. ROA improving
        prev_ni = get(inc, 'Net Income', prev)
        prev_ta = get(bs, 'Total Assets', prev)
        prev_roa = safe_div(prev_ni, prev_ta)
        if roa is not None and prev_roa is not None and roa > prev_roa: score += 1

        # 4. Accruals: OCF > Net Income
        if ocf is not None and ni is not None and ocf > ni: score += 1

        # 5. Leverage decreasing
        curr_debt = get(bs, 'Total Debt', curr)
        prev_debt = get(bs, 'Total Debt', prev)
        if curr_debt is not None and prev_debt is not None and curr_debt <= prev_debt: score += 1

        # 6. Current ratio improving
        cr_curr = safe_div(get(bs, 'Current Assets', curr), get(bs, 'Current Liabilities', curr))
        cr_prev = safe_div(get(bs, 'Current Assets', prev), get(bs, 'Current Liabilities', prev))
        if cr_curr is not None and cr_prev is not None and cr_curr > cr_prev: score += 1

        # 7. No dilution
        sh_curr = get(bs, 'Share Issued', curr)
        sh_prev = get(bs, 'Share Issued', prev)
        if sh_curr is not None and sh_prev is not None and sh_curr <= sh_prev: score += 1

        # 8. Gross margin improving
        gm_curr = safe_div(get(inc, 'Gross Profit', curr), get(inc, 'Total Revenue', curr))
        gm_prev = safe_div(get(inc, 'Gross Profit', prev), get(inc, 'Total Revenue', prev))
        if gm_curr is not None and gm_prev is not None and gm_curr > gm_prev: score += 1

        # 9. Asset turnover improving
        at_curr = safe_div(get(inc, 'Total Revenue', curr), ta)
        at_prev = safe_div(get(inc, 'Total Revenue', prev), prev_ta)
        if at_curr is not None and at_prev is not None and at_curr > at_prev: score += 1

        return score
    except:
        return None


# ──────────────────────────────────────────────────────────────────────
# STEP 4: Fetch all data for one ticker
# ──────────────────────────────────────────────────────────────────────
def fetch_stock_data(ticker_sym, region_label):
    try:
        t = yf.Ticker(ticker_sym)
        info = t.info

        if not info or info.get('quoteType') != 'EQUITY':
            return None

        sector = info.get('sectorDisp', '') or info.get('sector', '')
        if sector in EXCLUDED_SECTORS:
            return None

        market_cap = info.get('marketCap')
        if not market_cap:
            return None

        # ── Basic fields ──
        stock = {
            "ticker": ticker_sym,
            "name": info.get('shortName') or info.get('longName') or ticker_sym,
            "sector": sector or "Unknown",
            "industry": info.get('industryDisp') or info.get('industry') or "Unknown",
            "marketCap": market_cap,
            "price": info.get('currentPrice') or info.get('regularMarketPrice'),
            "avgVolume20d": info.get('averageVolume'),
            "region": region_label,
        }

        # ── Quality (Q) ──
        stock["roeTTM"] = _pct(info.get('returnOnEquity'))
        stock["roaTTM"] = _pct(info.get('returnOnAssets'))
        stock["roiTTM"] = _pct(info.get('returnOnAssets'))  # Refined below with financials

        # ── Price (P) ──
        stock["evToEBITDA"] = clean_val(info.get('enterpriseToEbitda'))
        stock["evToSales"] = clean_val(info.get('enterpriseToRevenue'))

        # ── Longevity (L) - grossMargin ──
        stock["grossMarginTTM"] = _pct(info.get('grossMargins'))

        # ── Sentiment (S) ──
        stock["shortInterestPctFloat"] = _pct(info.get('shortPercentOfFloat'))

        # Insider purchases
        try:
            ip = t.insider_purchases
            if ip is not None and not ip.empty:
                row = ip[ip['Insider Purchases Last 6m'] == 'Purchases']
                val = row.iloc[0].get('Trans', 0) if not row.empty else 0
                stock["insiderPurchases"] = int(val) if val and str(val) != '<NA>' else 0
            else:
                stock["insiderPurchases"] = 0
        except:
            stock["insiderPurchases"] = 0

        # Analyst revision proxy
        eps_fwd = info.get('epsForward')
        eps_cur = info.get('epsCurrentYear')
        if eps_fwd and eps_cur and eps_cur != 0:
            stock["currentFYRevisionVs4WkAgo"] = round(((eps_fwd - eps_cur) / abs(eps_cur)) * 100, 2)
        else:
            eg = info.get('earningsGrowth')
            stock["currentFYRevisionVs4WkAgo"] = round(eg * 100, 2) if eg is not None else None

        # ── Timing (T) - momentum from price history ──
        try:
            hist = t.history(period='1y')
            if hist is not None and len(hist) > 20:
                cur = hist['Close'].iloc[-1]
                n = len(hist)
                p13 = hist['Close'].iloc[max(0, n - 65)]
                p26 = hist['Close'].iloc[max(0, n - 130)]
                p52 = hist['Close'].iloc[0]
                stock["priceChange13W"] = round(((cur / p13) - 1) * 100, 2) if p13 > 0 else None
                stock["priceChange26W"] = round(((cur / p26) - 1) * 100, 2) if p26 > 0 else None
                stock["priceChange52W"] = round(((cur / p52) - 1) * 100, 2) if p52 > 0 else None
            else:
                stock["priceChange13W"] = stock["priceChange26W"] = stock["priceChange52W"] = None
        except:
            stock["priceChange13W"] = stock["priceChange26W"] = stock["priceChange52W"] = None

        # ── Longevity (L) - Altman Z, Piotroski F ──
        try:
            bs = t.balance_sheet
            inc = t.financials
            cf = t.cashflow
            stock["altmanZOrig"] = compute_altman_z(info, bs)
            stock["piotroskiFScore"] = compute_piotroski(info, bs, inc, cf)

            # Refine ROIC
            if bs is not None and not bs.empty and inc is not None and not inc.empty:
                col = bs.columns[0]
                ebit = inc.at['EBIT', col] if 'EBIT' in inc.index and col in inc.columns else None
                invested = bs.at['Invested Capital', col] if 'Invested Capital' in bs.index else None
                roic = safe_div(ebit, invested)
                if roic is not None:
                    stock["roiTTM"] = round(roic * 100, 2)
        except:
            if "altmanZOrig" not in stock: stock["altmanZOrig"] = None
            if "piotroskiFScore" not in stock: stock["piotroskiFScore"] = None

        # ── Null score fields (computed by Node.js scoring engine) ──
        for f in ["qualityScore", "longevityScore", "priceScore", "timingScore", "sentimentScore", "compositeScore", "rank", "bucket"]:
            stock[f] = None

        # Clean all values
        return {k: clean_val(v) for k, v in stock.items()}
    except Exception as e:
        return None


# ──────────────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────────────
def main():
    region_arg = sys.argv[1] if len(sys.argv) > 1 else "ALL"

    regions = {}
    if region_arg in ("ALL", "US"): regions["US"] = REGION_MAP["US"]
    if region_arg in ("ALL", "CA"): regions["CA"] = REGION_MAP["CA"]
    if region_arg in ("ALL", "EU"): regions["EU"] = REGION_MAP["EU"]

    all_stocks = []

    for label, codes in regions.items():
        log(f"Discovering {label} universe...")
        tickers = get_universe_tickers(codes, label)
        if not tickers:
            continue

        log(f"Fetching data for {len(tickers)} {label} stocks...")
        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            futures = {pool.submit(fetch_stock_data, sym, label): sym for sym in tickers}
            done = 0
            for f in concurrent.futures.as_completed(futures):
                done += 1
                if done % 25 == 0:
                    log(f"  {label}: {done}/{len(tickers)} done")
                try:
                    r = f.result()
                    if r:
                        results.append(r)
                except:
                    pass

        log(f"  {label}: {len(results)} stocks fetched successfully")
        all_stocks.extend(results)

    log(f"TOTAL: {len(all_stocks)} stocks across all regions")

    output = {
        "stocks": all_stocks,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "regions": list(regions.keys()),
    }
    print(json.dumps(output))


if __name__ == "__main__":
    main()
