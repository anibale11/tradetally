const binancePublic = require('../utils/binancePublic');

/**
 * Read-only candle lookup for reference charts (bot/nautilus backtest trade
 * visualization) — NOT the Backtest Sandbox: no session/quota tracking, just
 * "give me bars for this symbol/window" from Binance's public klines.
 */
module.exports = {
  async getCandles(req, res, next) {
    try {
      const symbol = String(req.query.symbol || '').trim().toUpperCase();
      const fromTs = Number(req.query.from);
      const toTs = Number(req.query.to);

      if (!binancePublic.isSupportedSymbol(symbol)) {
        return res.status(400).json({ error: `Unsupported crypto pair. Supported: ${binancePublic.supportedSymbols().join(', ')}` });
      }
      if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs <= fromTs) {
        return res.status(400).json({ error: 'from/to must be epoch seconds with to > from' });
      }
      // Cap the window (3 days of 1m candles) so a bad request can't trigger
      // an unbounded number of paginated upstream calls.
      if (toTs - fromTs > 3 * 24 * 60 * 60) {
        return res.status(400).json({ error: 'Window too large — max 3 days' });
      }

      const candles = await binancePublic.getCandles(symbol, fromTs, toTs);
      res.json({ symbol, candles });
    } catch (error) {
      console.error('[CRYPTO-CANDLES] Failed to fetch candles:', error);
      next(error);
    }
  }
};
