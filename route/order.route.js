const express = require('express');
const router = express.Router();
const orderController = require('../controller/order.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');

router.post('/', authenticate, orderController.createOrder);

// Fix #6: Only admins can list ALL orders (prevents PII leak)
router.get('/', authenticate, authorize('admin'), orderController.getAllOrders);

router.get('/my', authenticate, orderController.getUserOrders);

// Fix #4: Only admins can change order status (prevents users cancelling others' orders)
router.put('/:orderId/status', authenticate, authorize('admin'), orderController.updateOrderStatus);

module.exports = router;
