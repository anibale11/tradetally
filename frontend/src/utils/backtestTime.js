/**
 * Timestamp parsing for backtest trade timestamps (bot_trading /
 * nautilus-trading) — both report entry/close times as strings, but NOT
 * always with an explicit UTC offset:
 *   - bot_trading: Python datetime.isoformat() on a tz-aware UTC datetime
 *     → "2026-08-16T15:11:00+00:00" (has an offset, parses correctly with
 *     the native Date constructor).
 *   - nautilus-trading: str(pandas.Timestamp) on ts_opened/ts_closed — can
 *     come through WITHOUT a timezone offset ("2026-08-31 10:40:00.123456"),
 *     which the native Date constructor treats as the BROWSER'S LOCAL time
 *     (per spec, a date-time string without an offset is local, not UTC) —
 *     this silently shifted displayed times by the browser's UTC offset,
 *     found 2026-09-04 as a 9h mismatch between the trade table and the
 *     chart panel for the same nautilus trade.
 *
 * These bot backtests are UTC-only systems (no exchange-local session
 * concept, unlike stock/futures) — so a timestamp with no explicit offset
 * is always meant as UTC, never local. Parse it as such explicitly instead
 * of trusting the Date constructor's local-time fallback.
 */

const NAIVE_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/;

export function parseUtcEpochSeconds(raw) {
  if (!raw) return null;
  const str = String(raw);
  // Already has an explicit offset/Z — the native parser handles it correctly.
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(str)) {
    const ms = new Date(str).getTime();
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  // No offset — parse the naive components manually and force UTC, instead
  // of letting the Date constructor guess (and get it wrong) as local time.
  const m = NAIVE_RE.exec(str);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return Math.floor(Date.UTC(y, mo - 1, d, h, mi, s) / 1000);
}

export function formatUtc(raw, locale = 'es-AR') {
  const ts = parseUtcEpochSeconds(raw);
  if (ts === null) return '—';
  return new Date(ts * 1000).toLocaleString(locale, { timeZone: 'UTC' });
}
