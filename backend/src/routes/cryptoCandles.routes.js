const express = require('express');
const router = express.Router();
const controller = require('../controllers/cryptoCandles.controller');
const { authenticate } = require('../middleware/auth');

// Velas reales de Binance para gráficos de referencia (trades de bot/nautilus
// backtest) — ver ../controllers/cryptoCandles.controller.js.
router.get('/candles', authenticate, controller.getCandles);

module.exports = router;
