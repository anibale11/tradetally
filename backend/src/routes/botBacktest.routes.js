const express = require('express');
const router = express.Router();
const controller = require('../controllers/botBacktest.controller');
const { authenticate } = require('../middleware/auth');

// Backtest real de bot_trading (SMC Sniper, producción BingX) — ver
// ../controllers/botBacktest.controller.js.
router.post('/run', authenticate, controller.run);
router.get('/status', authenticate, controller.status);
router.get('/last', authenticate, controller.last);

module.exports = router;
