const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { verifyToken, requirePermission } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken, requirePermission('DASHBOARD_VER'));

router.get('/summary', dashboardController.getSummary);
router.get('/export/:type', dashboardController.exportReport);

module.exports = router;
