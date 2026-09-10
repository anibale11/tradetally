const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Lee data/struggle_calibration.jsonl (bot_trading, producción BingX) —
// instrumentación agregada el 06/08/2026 para calibrar STRUGGLE_MIN_TOUCHES
// con datos reales. El archivo se sincroniza desde el VPS por cron local
// (scripts/sync_struggle_calibration.sh en bot_trading, cada 6h) — este
// contenedor solo lee el volumen ya montado, nunca accede al VPS.
const DATA_DIR = process.env.BOT_TRADING_DATA_DIR || '/bot-trading-data';
const CALIBRATION_FILE = path.join(DATA_DIR, 'struggle_calibration.jsonl');

async function readCalibrationLines() {
  if (!fs.existsSync(CALIBRATION_FILE)) return [];
  const lines = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(CALIBRATION_FILE),
    crlfDelay: Infinity
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      lines.push(JSON.parse(line));
    } catch (e) {
      // línea corrupta/truncada (posible corte a mitad de escritura durante
      // el sync) — se descarta en vez de romper el resto del archivo.
    }
  }
  return lines;
}

// Este log solo instrumenta el criterio 4 (_reevaluate_pending_limit,
// position_monitor.py) — rechazos repetidos del nivel de ChoCh. NO registra
// el timeout pasivo de 2h ni los otros 3 criterios (no-chasing, invalidación
// estructural, sesgo BTC), así que la clasificación de acá es una
// aproximación honesta basada solo en lo que este archivo puede ver, no un
// veredicto final — para eso hay que cruzar con close_reason en trades.db.
// Etiquetas (ver análisis empírico 2026-09-09, memoria de sesión):
// - "struggle_fired": el criterio 4 sí disparó (last.fired === true) —
//   rechazó el nivel repetidamente sin romper limpio.
// - "never_neared_level": el precio nunca tocó el nivel (touches=0 siempre)
//   — candidato a la causa "el precio se escapó sin retroceder", pero puede
//   seguir pendiente o haber cerrado por otro criterio distinto al 4.
// - "touched_not_fired": hubo algún toque pero no llegó al umbral — zona gris.
function classifyTrade(evals) {
  const last = evals[evals.length - 1];
  const maxTouches = Math.max(...evals.map(e => e.touches));

  if (last.fired) return 'struggle_fired';
  if (maxTouches === 0) return 'never_neared_level';
  return 'touched_not_fired';
}

exports.summary = async (req, res, next) => {
  try {
    const rows = await readCalibrationLines();
    const byTrade = new Map();
    for (const row of rows) {
      if (!byTrade.has(row.trade_id)) byTrade.set(row.trade_id, []);
      byTrade.get(row.trade_id).push(row);
    }

    const trades = [];
    for (const [tradeId, evals] of byTrade) {
      evals.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const first = evals[0];
      const last = evals[evals.length - 1];
      trades.push({
        tradeId,
        symbol: first.symbol,
        direction: first.direction,
        refLevel: first.ref_level,
        firstSeenAt: first.timestamp,
        lastSeenAt: last.timestamp,
        durationMinutes: Math.round((new Date(last.timestamp) - new Date(first.timestamp)) / 60000),
        maxTouches: Math.max(...evals.map(e => e.touches)),
        evaluations: evals.length,
        fired: last.fired,
        cause: classifyTrade(evals),
        distancePctSeries: evals.map(e => ({ t: e.timestamp, distance_pct: e.distance_pct, touches: e.touches }))
      });
    }

    trades.sort((a, b) => new Date(b.firstSeenAt) - new Date(a.firstSeenAt));

    const causeCounts = trades.reduce((acc, t) => {
      acc[t.cause] = (acc[t.cause] || 0) + 1;
      return acc;
    }, {});

    res.json({
      totalSignals: trades.length,
      causeCounts,
      trades
    });
  } catch (error) {
    next(error);
  }
};
