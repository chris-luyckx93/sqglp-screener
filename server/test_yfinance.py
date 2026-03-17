#!/usr/bin/env python3
"""Quick diagnostic: does yfinance screener work in this environment?"""
import sys
print(f"Python: {sys.version}")

try:
    import yfinance as yf
    print(f"yfinance: {yf.__version__}")
except ImportError:
    print("ERROR: yfinance not installed. Run: pip install yfinance pandas")
    sys.exit(1)

try:
    from yfinance import EquityQuery
    print("EquityQuery: imported OK")
except ImportError:
    print("ERROR: EquityQuery not available in this yfinance version")
    sys.exit(1)

# Simple screener test: market cap > $1B, US stocks, limit 5
print("\n--- Testing screener (5 US stocks, market cap > $1B) ---")
try:
    q = EquityQuery('and', [
        EquityQuery('gt', ['intradaymarketcap', 1_000_000_000]),
        EquityQuery('eq', ['region', 'us']),
    ])
    result = yf.screen(q, count=5, offset=0)
    quotes = result.get('quotes', [])
    print(f"Got {len(quotes)} quotes")
    for item in quotes[:3]:
        sym = item.get('symbol', '?')
        name = item.get('shortName', '?')
        print(f"  {sym}: {name}")
    if not quotes:
        print("WARNING: Screener returned 0 results!")
        print(f"Full result: {result}")
except Exception as e:
    print(f"Screener FAILED: {e}")
    import traceback
    traceback.print_exc()

# Test individual ticker fetch
print("\n--- Testing individual ticker (AAPL) ---")
try:
    t = yf.Ticker("AAPL")
    info = t.info
    print(f"Name: {info.get('shortName')}")
    print(f"Sector: {info.get('sectorDisp')}")
    print(f"Market Cap: {info.get('marketCap')}")
    print("Individual ticker: OK")
except Exception as e:
    print(f"Ticker FAILED: {e}")

print("\n--- All tests complete ---")
