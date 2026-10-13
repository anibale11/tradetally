const { netPnlFromOkxRecord } = require('../../src/scripts/lib/nautilusPnl');

// Registros reales de nautilus_trades.jsonl / nautilus_dca_trades.jsonl
// (13/10/2026). realized_pnl es OKX realizedPnl = pnl + fee + fundingFee,
// valores cruzados contra /account/positions-history.
describe('netPnlFromOkxRecord', () => {
  test('SMC ATOM short: no vuelve a descontar el fee (realizedPnl ya es neto)', () => {
    const t = { realized_pnl: -15.9177239999999, fee: -2.165724, funding_fee: 0 };
    expect(netPnlFromOkxRecord(t)).toBeCloseTo(-15.917724, 6);
  });

  test('DCA BNB short: no vuelve a sumar fee ni funding', () => {
    // OKX: pnl 3.135 + fee -0.355107 + fundingFee 0.0894 = realizedPnl 2.869293
    const t = { realized_pnl: 2.8692930000000003, fee: -0.355107, funding_fee: 0.0894 };
    expect(netPnlFromOkxRecord(t)).toBeCloseTo(2.869293, 6);
  });

  test('realized_pnl ausente o inválido → 0', () => {
    expect(netPnlFromOkxRecord({ fee: -1 })).toBe(0);
    expect(netPnlFromOkxRecord({ realized_pnl: null })).toBe(0);
    expect(netPnlFromOkxRecord({ realized_pnl: 'x' })).toBe(0);
  });
});
