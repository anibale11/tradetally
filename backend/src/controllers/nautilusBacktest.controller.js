const fs = require('fs');
const path = require('path');

// Mismo patrón "file system como bus" que ya usa dashboard-simple/app.py
// (nautilus-trading): el trigger/resultado del backtest se comunican por
// un volumen compartido con el watcher del proyecto nautilus-trading
// (backtest_watcher.py, corriendo en un contenedor separado), no por una
// API interna entre los dos servicios.
const DATA_DIR = process.env.NAUTILUS_DATA_DIR || '/nautilus-data';
// Una pareja trigger/resultado por estrategia (mismos nombres que
// nautilus-trading/backtest_watcher.py y run_backtest.RESULT_FILES). La del
// SMC Sniper conserva los nombres originales.
const STRATEGIES = {
  smc: { trigger: 'backtest_trigger.json', result: 'backtest_result.json' },
  rsi_cloud: { trigger: 'backtest_trigger_rsi_cloud.json', result: 'backtest_result_rsi_cloud.json' },
};

function filesFor(req) {
  const key = Object.prototype.hasOwnProperty.call(STRATEGIES, req.query.strategy) ? req.query.strategy : 'smc';
  return {
    trigger: path.join(DATA_DIR, STRATEGIES[key].trigger),
    result: path.join(DATA_DIR, STRATEGIES[key].result),
  };
}

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
  // El watcher de nautilus-trading (proceso Python, uid distinto al de
  // este contenedor) también reescribe este mismo archivo — sin esto, el
  // dueño/permiso que deja el último proceso en escribir puede bloquear
  // al otro (EACCES real visto con el equivalente de bot_trading).
  try { fs.chmodSync(filePath, 0o666); } catch (e) { /* best-effort */ }
}

exports.run = (req, res) => {
  const { trigger: TRIGGER_FILE } = filesFor(req);
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
  res.json(readJson(filesFor(req).trigger, { status: 'idle' }));
};

exports.last = (req, res) => {
  res.json(readJson(filesFor(req).result, {}));
};

// Páginas de auditoría de método (HTML autocontenido, comparación contra
// el NB trading-brain) — montadas desde el mismo volumen que usaba
// dashboard-simple (nautilus-trading), servidas acá directo para poder
// dar de baja ese sitio aparte. Sanitización anti path-traversal idéntica
// a dashboard-simple/app.py: solo alfanumérico/guiones en el id.
const AUDITS_DIR = process.env.NAUTILUS_AUDITS_DIR || '/nautilus-audits';

exports.audit = (req, res) => {
  const safeId = String(req.params.methodId || '').replace(/[^a-zA-Z0-9-]/g, '');
  const filePath = path.join(AUDITS_DIR, `${safeId}-detail.html`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Detalle no encontrado para este método');
  }

  // El middleware de seguridad global (security.js) manda X-Frame-Options:
  // DENY + frame-ancestors 'none' en TODAS las respuestas (anti-clickjacking
  // OWASP) — bloquea incluso el iframe same-origin que usa
  // MethodAuditDetailView.vue para embeber esto dentro del shell de la app.
  // Acá, deliberadamente, se relaja SOLO para esta ruta a 'self': el
  // contenido es HTML propio (no de terceros), servido detrás del mismo
  // middleware de auth que el resto de la API.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.removeHeader('X-FRAME-OPTIONS');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  res.setHeader('X-Content-Security-Policy', "frame-ancestors 'self'");
  res.setHeader('X-Webkit-CSP', "frame-ancestors 'self'");
  res.setHeader('X-WebKit-CSP', "frame-ancestors 'self'");

  res.type('html').send(fs.readFileSync(filePath, 'utf8'));
};
