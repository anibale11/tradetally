const express = require('express');
const router = express.Router();
const controller = require('../controllers/struggleCalibration.controller');
const { authenticate } = require('../middleware/auth');

router.get('/summary', authenticate, controller.summary);

module.exports = router;
