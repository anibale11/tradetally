const fs = require('fs');
const path = require('path');

// Backtest real de smc_sniper_strategy.py (bot_trading, producción BingX) —
// mismo patrón "file system como bus" que nautilusBacktest.controller.js,
// leyendo/escribiendo el volumen de datos de ESE repo (montado aparte, ver
// docker-compose.yaml). Duplicado deliberado en vez de una abstracción
// genérica: hoy son solo 2 métodos, con esquemas de resultado ligeramente
// distintos (bot_trading no tiene PnL en $, solo R) — generalizar recién
// tendría sentido con un tercer método real.
const DATA_DIR = process.env.BOT_TRADING_DATA_DIR || '/bot-trading-data';
const TRIGGER_FILE = path.join(DATA_DIR, 'bot_backtest_trigger.json');
const RESULT_FILE = path.join(DATA_DIR, 'bot_backtest_result.json');

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  // El watcher de bot_trading (proceso Python, uid distinto al de este
  // contenedor) también reescribe este mismo archivo — sin esto, el
  // dueño/permiso que deja el último proceso en escribir puede bloquear
  // al otro (EACCES real visto en producción de esta sesión).
  try { fs.chmodSync(filePath, 0o666); } catch (e) { /* best-effort */ }
}

exports.run = (req, res) => {
  const current = readJson(TRIGGER_FILE, { status: 'idle' });
  if (current.status === 'pending' || current.status === 'running') {
    return res.status(409).json({ error: 'Ya hay un backtest en curso' });
  }

  const days = parseInt(req.query.days || req.body?.days || '90', 10);
  const trigger = {
    status: 'pending',
    days,
    requested_at: new Date().toISOString(),
  };
  writeJson(TRIGGER_FILE, trigger);
  res.json(trigger);
};

exports.status = (req, res) => {
  res.json(readJson(TRIGGER_FILE, { status: 'idle' }));
};

exports.last = (req, res) => {
  res.json(readJson(RESULT_FILE, {}));
};
