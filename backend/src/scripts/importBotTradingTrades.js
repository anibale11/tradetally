#!/usr/bin/env node
/**
 * Importa los trades reales de bot_trading (producción BingX, SMC Sniper)
 * a la tabla `trades` de TradeTally, usando el mismo modelo Trade.create()
 * que usa el resto de la app (import CSV, broker sync, etc.) — así estos
 * trades se ven y se comportan como si se hubieran importado por la UI en
 * /trades, no como una vista de solo lectura aparte.
 *
 * Fuente: data/trades_export.jsonl, sincronizado del VPS por
 * scripts/export_trades_jsonl.py (cron diario) + sync_trades_export.sh
 * (cron local) en bot_trading. Cutoff ya aplicado en origen (trades.db se
 * limpió el 2026-09-12, solo quedan trades desde el fix de fidelidad al
 * método del 2026-09-10).
 *
 * Idempotente: usa `notes` (con el order_id real de BingX embebido) para
 * detectar trades ya importados en corridas anteriores y saltarlos —
 * pensado para correr por cron diario después de cada sync, sin duplicar.
 *
 * Uso: node backend/src/scripts/importBotTradingTrades.js
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const db = require('../config/database');
const Trade = require('../models/Trade');

const DATA_DIR = process.env.BOT_TRADING_DATA_DIR || '/bot-trading-data';
const TRADES_FILE = path.join(DATA_DIR, 'trades_export.jsonl');
const BROKER_NAME = 'bot_trading (SMC Sniper — BingX)';

// close_reason que significan "la orden límite nunca se llenó" — no hubo
// trade real, no tiene sentido importarlos como si fueran una operación.
const NO_FILL_REASONS = new Set([
  'limit_order_expired',
  'limit_order_no_chase',
  'limit_order_invalidated',
  'limit_order_bias_flipped',
  'limit_order_struggling',
]);

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

async function alreadyImported(userId, orderId) {
  const result = await db.query(
    `SELECT id FROM trades WHERE user_id = $1 AND broker = $2 AND notes LIKE $3 LIMIT 1`,
    [userId, BROKER_NAME, `%order_id:${orderId}%`]
  );
  return result.rows.length > 0;
}

function toIsoNoTz(sqliteTimestamp) {
  // trades.db guarda "YYYY-MM-DD HH:MM:SS" en UTC (bot corre en UTC) — se
  // convierte a ISO explícito con sufijo Z para que TradeTally no lo
  // reinterprete con la zona horaria del usuario.
  if (!sqliteTimestamp) return null;
  return sqliteTimestamp.replace(' ', 'T') + 'Z';
}

async function main() {
  const userId = await getUserId();
  const rows = await readTradeLines();
  const closed = rows.filter(t => t.status === 'closed' && !NO_FILL_REASONS.has(t.close_reason));

  let imported = 0;
  let skipped = 0;

  for (const t of closed) {
    if (await alreadyImported(userId, t.order_id)) {
      skipped += 1;
      continue;
    }

    const side = t.direction === 'bullish' ? 'long' : 'short';
    const symbol = t.symbol.replace('-', '');

    const tradeData = {
      symbol,
      side,
      entryTime: toIsoNoTz(t.open_time),
      exitTime: toIsoNoTz(t.close_time),
      entryPrice: t.entry_price,
      exitPrice: t.close_price,
      quantity: t.quantity,
      pnl: t.pnl,
      broker: BROKER_NAME,
      strategy: 'SMC Sniper Craig',
      instrumentType: 'crypto',
      notes: `Importado automáticamente desde bot_trading (producción real, BingX). ` +
             `order_id:${t.order_id} | close_reason:${t.close_reason} | signal_id:${t.signal_id}`,
    };

    try {
      await Trade.create(userId, tradeData);
      imported += 1;
      console.log(`✅ Importado: ${symbol} ${side} ${t.open_time} — PnL ${t.pnl}`);
    } catch (err) {
      console.error(`❌ Error importando trade ${t.order_id} (${symbol}):`, err.message);
    }
  }

  console.log(`\nResumen: ${imported} importados, ${skipped} ya existían, ${closed.length} candidatos totales (${rows.length - closed.length} descartados por no-fill/cancelación).`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error fatal en import:', err);
  process.exit(1);
});
