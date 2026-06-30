const express = require('express');
const router = express.Router();
const dashboardController = require('../controller/dashboard.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');

// All dashboard routes require admin or manager role
router.use(authenticate, authorize('admin', 'manager'));

router.get('/stats', dashboardController.getStats);
router.get('/best-sellers', dashboardController.getBestSellers);
router.get('/order-analytics', dashboardController.getOrderAnalytics);

module.exports = router;
