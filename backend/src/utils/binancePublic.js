/**
 * Binance Public Klines Client (crypto backtest sandbox)
 *
 * Public REST endpoint (no API key, no account) used for the Backtest
 * Sandbox's "crypto" instrument type. Mirrors the same public
 * `/api/v3/klines` endpoint bot_trading uses for its own historical
 * backtests (see backtest_smc_sniper_binance.py, binance_klines.py).
 *
 * Only the 5 pairs the trading bots actually operate are supported —
 * an intentionally small, hardcoded allowlist rather than a free-text
 * symbol so the sandbox can't be pointed at an arbitrary/unsupported pair.
 *
 * API docs: https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data
 */

const axios = require('axios');

const BASE_URL = 'https://api.binance.com/api/v3/klines';
const MAX_LIMIT = 1000; // Binance's per-request cap for 1m klines

// display symbol ("BTC-USDT", matches bot_trading's convention) -> Binance's
// own symbol format ("BTCUSDT", no separator)
const SUPPORTED_PAIRS = {
  'BTC-USDT': 'BTCUSDT',
  'ETH-USDT': 'ETHUSDT',
  'SOL-USDT': 'SOLUSDT',
  'ATOM-USDT': 'ATOMUSDT',
  'XRP-USDT': 'XRPUSDT'
};

function isSupportedSymbol(symbol) {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_PAIRS, symbol);
}

function supportedSymbols() {
  return Object.keys(SUPPORTED_PAIRS);
}

/**
 * 1-minute klines for [fromTs, toTs] (epoch seconds, inclusive), paginated
 * in MAX_LIMIT-candle pages since a full UTC day (1440 candles) exceeds
 * Binance's single-request cap.
 */
async function getCandles(symbol, fromTs, toTs) {
  const binanceSymbol = SUPPORTED_PAIRS[symbol];
  if (!binanceSymbol) {
    throw new Error(`Unsupported crypto pair: ${symbol}`);
  }

  const startMs = fromTs * 1000;
  const endMs = toTs * 1000;
  const bars = [];
  let cursor = startMs;

  while (cursor <= endMs) {
    const { data } = await axios.get(BASE_URL, {
      params: {
        symbol: binanceSymbol,
        interval: '1m',
        startTime: cursor,
        endTime: endMs,
        limit: MAX_LIMIT
      },
      timeout: 15000
    });

    if (!Array.isArray(data) || data.length === 0) break;

    for (const k of data) {
      // Kline array shape: [openTime, open, high, low, close, volume, closeTime, ...]
      bars.push({
        time: Math.floor(Number(k[0]) / 1000),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5])
      });
    }

    const lastOpenMs = Number(data[data.length - 1][0]);
    if (data.length < MAX_LIMIT || lastOpenMs >= endMs) break;
    cursor = lastOpenMs + 60_000; // next minute after the last bar received
  }

  return bars;
}

module.exports = {
  isSupportedSymbol,
  supportedSymbols,
  getCandles
};
