/**
 * PnL neto de un registro de nautilus_trades.jsonl / nautilus_dca_trades.jsonl.
 *
 * El productor (nautilus-trading/sync_trades_from_okx.py) copia en
 * `realized_pnl` el campo `realizedPnl` de OKX /account/positions-history,
 * que YA es neto:  realizedPnl = pnl + fee + fundingFee + liqPenalty + settledPnl
 * (verificado contra la API: ATOM short 13/10 pnl -13.752 + fee -2.1657 =
 * realizedPnl -15.9177). `fee` y `funding_fee` vienen solo como detalle
 * informativo — volver a sumarlos descontaba las comisiones dos veces y
 * contaba el funding dos veces.
 *
 * Fix 2026-10-13: el import guardaba realized_pnl + fee + funding_fee
 * (ATOM short 13/10 quedaba en -18.08 en vez de -15.92).
 */
function netPnlFromOkxRecord(t) {
  const v = Number(t && t.realized_pnl);
  return Number.isFinite(v) ? v : 0;
}

module.exports = { netPnlFromOkxRecord };
