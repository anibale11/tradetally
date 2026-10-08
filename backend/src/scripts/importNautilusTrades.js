#!/usr/bin/env node
/**
 * Importa los trades reales de nautilus-trading (cuenta demo OKX, SMC
 * Sniper vía NautilusTrader) a la tabla `trades` de TradeTally, mismo
 * patrón que importBotTradingTrades.js.
 *
 * Fuente: data/nautilus_trades.jsonl, sincronizado del VPS por
 * sync_trades_from_okx.py (cron diario en el VPS, vía OKX
 * positions-history) + sync_nautilus_trades.sh (cron local).
 *
 * Idempotente: usa `notes` (con el pos_id + open_time_ms embebidos) para
 * detectar trades ya importados — una misma posición (pos_id) puede
 * cerrarse más de una vez en OKX (reduce parcial + cierre final quedan
 * como registros separados en positions-history), por eso la clave de
 * dedup combina pos_id + open_time_ms, no solo pos_id.
 *
 * Uso: node backend/src/scripts/importNautilusTrades.js
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const db = require('../config/database');
const Trade = require('../models/Trade');
const AnalyticsCache = require('../services/analyticsCache');

const DATA_DIR = process.env.NAUTILUS_TRADING_DATA_DIR || '/nautilus-data';
// Overrides por variable de entorno para importar otra cuenta/estrategia de
// nautilus-trading con el mismo script (ej. RSI Cloud en la subcuenta OKX,
// ver scripts/sync_all_bots.sh). Sin variables = SMC Sniper, como siempre.
const TRADES_FILE = path.join(DATA_DIR, process.env.IMPORT_TRADES_FILE || 'nautilus_trades.jsonl');
const BROKER_NAME = process.env.IMPORT_BROKER_NAME || 'nautilus-trading (SMC Sniper — OKX demo)';
const STRATEGY_NAME = process.env.IMPORT_STRATEGY_NAME || 'SMC Sniper Craig (Nautilus)';
const IS_DEFAULT_SMC = !process.env.IMPORT_BROKER_NAME;

// Cutoff: 2026-09-24 02:26 UTC (23:26 del 23/09 en America/Sao_Paulo),
// deploy del último fix de nautilus-trading: 3a44ba1 (no abrir nuevas
// entradas si ya hay posición abierta) + 7824130 (cancelar TP/SL
// remanentes al cerrar una posición).
// Antes de ese fix el bot sumaba órdenes sobre posiciones abiertas (XRP llegó
// a 62.69 contratos, -$673) y dejaba órdenes TP vivas que reabrían shorts
// fantasma (ATOM 709) — esos trades no son comparables. Criterio del
// proyecto (feedback_reset_30trade_sample_on_fix.md): se reinicia la muestra
// en cada fix de lógica. bot_trading tiene su propio corte (21/09) en
// importBotTradingTrades.js.
// Corte 2026-10-07 23:59 UTC: deploy de la paridad completa con bot_trading
// (nautilus d877acf — reseteo estructural, FVG 60, trailing 1h/5m, ventanas
// NY/Londres/Asia). Los 40 trades anteriores (-20.7R) se borraron de
// TradeTally a pedido del usuario; respaldo en
// backups/nautilus_smc_trades_pre_fix_2026-10-07.csv.
const CUTOFF_MS = Date.parse(process.env.IMPORT_CUTOFF || '2026-10-07T23:59:00.000Z');

// Incidente 26-29/09 (fix nautilus f7d37b0): tras cada restart las posiciones
// quedaban como EXTERNAL y el RiskEngine denegaba sus salidas — los SL no se
// ejecutaban y las posiciones se re-adoptaban con SL recalculado, fuera del
// método. Se excluye todo trade abierto antes del cierre forzado de la cuenta
// (29/09 21:20 UTC) que haya cerrado desde el primer SL denegado.
const INCIDENT_FIRST_DENIAL_MS = Date.parse('2026-09-26T20:42:40.000Z');
const INCIDENT_FLATTEN_MS = Date.parse('2026-09-29T21:20:00.000Z');

function affectedByIncident(t) {
  if (!IS_DEFAULT_SMC) return false;  // el incidente solo afectó a la cuenta del SMC Sniper
  return t.open_time_ms < INCIDENT_FLATTEN_MS && t.close_time_ms >= INCIDENT_FIRST_DENIAL_MS;
}

async function readTradeLines() {
  if (!fs.existsSync(TRADES_FILE)) return [];
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(TRADES_FILE), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch (e) { /* línea corrupta, se descarta */ }
  }
  return rows;
}

async function getUserId() {
  const result = await db.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1');
  if (result.rows.length === 0) throw new Error('No hay ningún usuario en TradeTally para asignar los trades importados');
  return result.rows[0].id;
}

// Incluye close_time_ms: un cierre parcial (TP1 + runner) llega de OKX como
// 2 filas con el mismo pos_id y open_time_ms — con solo pos_id:open_time_ms
// la segunda parte se descartaba como "ya existía" (XRP 24/09 y 26/09).
function dedupKey(t) {
  return `${t.pos_id}:${t.open_time_ms}:${t.close_time_ms}`;
}

async function alreadyImported(userId, t) {
  // Formato legacy (antes del fix): "dedup:<pos_id>:<open_time_ms> |" — esos
  // trades se reconocen por la clave vieja + su exit_time, para no duplicarlos.
  const result = await db.query(
    `SELECT id FROM trades WHERE user_id = $1 AND broker = $2 AND (
       notes LIKE $3 OR (notes LIKE $4 AND exit_time = $5::timestamptz)
     ) LIMIT 1`,
    [userId, BROKER_NAME, `%dedup:${dedupKey(t)} %`,
     `%dedup:${t.pos_id}:${t.open_time_ms} |%`, msToIso(t.close_time_ms)]
  );
  return result.rows.length > 0;
}

function msToIso(ms) {
  if (!ms) return null;
  return new Date(ms).toISOString();
}

async function main() {
  const userId = await getUserId();
  const rows = await readTradeLines();

  let imported = 0;
  let skipped = 0;
  let excluded = 0;

  for (const t of rows) {
    if (!t.open_time_ms || t.open_time_ms < CUTOFF_MS) continue;
    if (affectedByIncident(t)) { excluded += 1; continue; }
    const key = dedupKey(t);
    if (await alreadyImported(userId, t)) {
      skipped += 1;
      continue;
    }

    const side = t.direction === 'long' ? 'long' : 'short';
    const symbol = t.symbol.replace('-USDT-SWAP', 'USDT');
    const pnl = (t.realized_pnl || 0) + (t.fee || 0) + (t.funding_fee || 0);

    const tradeData = {
      symbol,
      side,
      entryTime: msToIso(t.open_time_ms),
      exitTime: msToIso(t.close_time_ms),
      entryPrice: t.entry_price,
      exitPrice: t.exit_price,
      quantity: t.quantity,
      pnl,
      broker: BROKER_NAME,
      strategy: STRATEGY_NAME,
      instrumentType: 'crypto',
      notes: `Importado automáticamente desde nautilus-trading (cuenta demo real, OKX). ` +
             `dedup:${key} | fee:${t.fee} | funding_fee:${t.funding_fee} | leverage:${t.leverage}`,
    };

    try {
      await Trade.create(userId, tradeData);
      imported += 1;
      console.log(`✅ Importado: ${symbol} ${side} ${new Date(t.open_time_ms).toISOString()} — PnL neto ${pnl.toFixed(2)}`);
    } catch (err) {
      console.error(`❌ Error importando trade ${key} (${symbol}):`, err.message);
    }
  }

  if (imported > 0) {
    // Trade.create() aquí se llama fuera del controller HTTP normal, que es
    // donde vive la invalidación de AnalyticsCache — sin esto, el dashboard
    // sigue sirviendo el payload cacheado (TTL 24h) de antes del import.
    await AnalyticsCache.invalidate(userId);
    console.log('[CACHE] Analytics cache invalidado tras el import.');
  }

  console.log(`\nResumen: ${imported} importados, ${skipped} ya existían, ${rows.length} candidatos totales (${excluded} excluidos por incidente 26-29/09).`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error fatal en import:', err);
  process.exit(1);
});
