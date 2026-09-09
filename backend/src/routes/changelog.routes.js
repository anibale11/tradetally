const express = require('express');
const router = express.Router();
const controller = require('../controllers/changelog.controller');
const { authenticate } = require('../middleware/auth');

// Historial de cambios real (git log) de bot_trading/nautilus-trading — ver
// ../controllers/changelog.controller.js.
router.get('/:repo', authenticate, controller.getChangelog);

module.exports = router;
