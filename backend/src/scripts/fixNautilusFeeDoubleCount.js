#!/usr/bin/env node
/**
 * Corrección de datos (one-shot) para el bug de doble conteo de fee/funding
 * en los trades de nautilus-trading (OKX) ya importados en TradeTally.
 *
 * importNautilusTrades.js guardaba pnl = realized_pnl + fee + funding_fee,
 * pero realized_pnl ya es el realizedPnl NETO de OKX (pnl + fee + fundingFee).
 * Este script lleva cada trade afectado a pnl = realized_pnl del JSONL fuente
 * y corrige también el `executions` JSON (el calendario lee
 * realized_pnl/gross_realized_pnl de la ejecución de cierre, no trades.pnl).
 *
 * Seguro de re-ejecutar: solo toca un trade si su pnl actual coincide con el
 * valor erróneo (realized_pnl + fee + funding_fee); si ya coincide con
 * realized_pnl lo reporta como OK; cualquier otra diferencia se reporta y
 * NO se toca.
 *
 * Por defecto es DRY-RUN dentro de una transacción READ ONLY (no puede
 * escribir). Con --apply aplica todo en una única transacción.
 *
 * Correr desde el host, sin copiar nada a la imagen (node lee el script por
 * stdin y resuelve los require relativos al -w):
 *   docker exec -i -w /app/backend/src/scripts tradetally-app node - < backend/src/scripts/fixNautilusFeeDoubleCount.js
 *   docker exec -i -w /app/backend/src/scripts tradetally-app node - --apply < backend/src/scripts/fixNautilusFeeDoubleCount.js
 * Después de --apply: docker compose restart app (el caché de analytics vive
 * en memoria del proceso servidor).
 */
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const APPLY = process.argv.includes('--apply');
const DATA_DIR = process.env.NAUTILUS_TRADING_DATA_DIR || '/nautilus-data';
const SOURCE_FILES = ['nautilus_trades.jsonl', 'nautilus_dca_trades.jsonl'];
const EPS = 1e-4;  // trades.pnl es numeric(20,6)
const FIX_TAG = 'pnl_fix:2026-10-13';

function loadSource() {
  const byKey = new Map();      // pos:open:close
  const byLegacy = new Map();   // pos:open -> [records]
  for (const f of SOURCE_FILES) {
    const p = path.join(DATA_DIR, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let t;
      try { t = JSON.parse(line); } catch (e) { continue; }
      t._file = f;
      byKey.set(`${t.pos_id}:${t.open_time_ms}:${t.close_time_ms}`, t);
      const lk = `${t.pos_id}:${t.open_time_ms}`;
      if (!byLegacy.has(lk)) byLegacy.set(lk, []);
      byLegacy.get(lk).push(t);
    }
  }
  return { byKey, byLegacy };
}

function findSource(src, trade) {
  const m = /dedup:(\d+):(\d+)(?::(\d+))?/.exec(trade.notes || '');
  if (!m) return null;
  if (m[3]) return src.byKey.get(`${m[1]}:${m[2]}:${m[3]}`) || null;
  // Formato legacy "dedup:<pos>:<open> |": desambiguar por exit_time.
  const exitMs = trade.exit_time ? new Date(trade.exit_time).getTime() : null;
  return (src.byLegacy.get(`${m[1]}:${m[2]}`) || []).find(t => t.close_time_ms === exitMs) || null;
}

function fixExecutions(executions, newPnl) {
  if (!Array.isArray(executions) || executions.length === 0) return executions;
  const out = executions.map(e => ({ ...e }));
  for (let i = out.length - 1; i >= 0; i -= 1) {
    const e = out[i];
    if (e && e.realized_pnl !== undefined && e.realized_pnl !== null) {
      e.realized_pnl = newPnl;
      e.gross_realized_pnl = newPnl + (Number(e.commission) || 0) + (Number(e.fees) || 0);
      break;
    }
  }
  return out;
}

async function main() {
  const src = loadSource();
  const client = await db.connect();
  const counts = { fix: 0, ok: 0, mismatch: 0, nosource: 0 };
  let deltaTotal = 0;
  try {
    await client.query(APPLY ? 'BEGIN' : 'BEGIN READ ONLY');
    const { rows } = await client.query(
      `SELECT id, broker, symbol, side, entry_time, exit_time, pnl, executions, notes
         FROM trades
        WHERE broker LIKE 'nautilus-trading%' AND notes LIKE '%dedup:%'
        ORDER BY entry_time`
    );
    console.log(`${APPLY ? 'APPLY' : 'DRY-RUN (READ ONLY)'} — ${rows.length} trades nautilus-trading en la DB\n`);
    console.log(['estado', 'id', 'broker', 'símbolo', 'lado', 'entrada', 'pnl_actual', 'pnl_correcto', 'delta'].join('\t'));

    for (const tr of rows) {
      const cur = Number(tr.pnl);
      const t = findSource(src, tr);
      const brokerShort = tr.broker.includes('DCA') ? 'DCA' : 'SMC';
      const base = [tr.id, brokerShort, tr.symbol, tr.side, new Date(tr.entry_time).toISOString()];
      if (!t) {
        counts.nosource += 1;
        console.log(['SIN_FUENTE', ...base, cur.toFixed(6), '-', '-'].join('\t'));
        continue;
      }
      const correct = Number(t.realized_pnl) || 0;
      const wrong = correct + (Number(t.fee) || 0) + (Number(t.funding_fee) || 0);
      if (Math.abs(cur - correct) < EPS) {
        counts.ok += 1;
        console.log(['OK', ...base, cur.toFixed(6), correct.toFixed(6), '0'].join('\t'));
        continue;
      }
      if (Math.abs(cur - wrong) >= EPS) {
        counts.mismatch += 1;
        console.log(['NO_COINCIDE', ...base, cur.toFixed(6), correct.toFixed(6), `(esperado erróneo ${wrong.toFixed(6)}) — no se toca`].join('\t'));
        continue;
      }
      const delta = correct - cur;
      deltaTotal += delta;
      counts.fix += 1;
      console.log(['CORREGIR', ...base, cur.toFixed(6), correct.toFixed(6), (delta >= 0 ? '+' : '') + delta.toFixed(6)].join('\t'));
      if (APPLY) {
        await client.query(
          `UPDATE trades
              SET pnl = $2,
                  executions = $3::jsonb,
                  notes = notes || $4,
                  updated_at = NOW()
            WHERE id = $1`,
          [tr.id, correct, JSON.stringify(fixExecutions(tr.executions, correct)),
           ` | ${FIX_TAG} (antes ${cur.toFixed(6)}: fee/funding contados dos veces)`]
        );
      }
    }
    await client.query(APPLY ? 'COMMIT' : 'ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  console.log(`\nResumen: ${counts.fix} ${APPLY ? 'corregidos' : 'a corregir'} (delta total ${deltaTotal >= 0 ? '+' : ''}${deltaTotal.toFixed(4)} USDT), ` +
              `${counts.ok} ya correctos, ${counts.mismatch} no coinciden (no tocados), ${counts.nosource} sin registro fuente.`);
  if (APPLY && counts.fix > 0) {
    console.log('Reiniciar la app para refrescar el caché de analytics: docker compose restart app');
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
