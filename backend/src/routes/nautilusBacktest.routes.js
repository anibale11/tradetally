const express = require('express');
const router = express.Router();
const controller = require('../controllers/nautilusBacktest.controller');
const { authenticate } = require('../middleware/auth');

// Backtest real de la estrategia CraigSMCStrategy (proyecto nautilus-trading,
// OKX) — disparado por el usuario, corrido por el watcher de ese proyecto,
// leído acá vía un volumen de datos compartido. Ver ../controllers/nautilusBacktest.controller.js.
router.post('/run', authenticate, controller.run);
router.get('/status', authenticate, controller.status);
router.get('/last', authenticate, controller.last);
router.get('/audit/:methodId', authenticate, controller.audit);

module.exports = router;
