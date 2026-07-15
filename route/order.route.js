const express = require('express');
const router = express.Router();
const orderController = require('../controller/order.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');

router.post('/', authenticate, orderController.createOrder);

// Fix #6: Only admins can list ALL orders (prevents PII leak)
router.get('/', authenticate, authorize('admin'), orderController.getAllOrders);

router.get('/my', authenticate, orderController.getUserOrders);

// Get a single order by ID — user sees their own, admin sees any
router.get('/:orderId', authenticate, orderController.getOrderById);

// Fix #4: Only admins can change order status (prevents users cancelling others' orders)
router.put('/:orderId/status', authenticate, authorize('admin'), orderController.updateOrderStatus);

// DELETE /api/orders/:orderId/cancel
// Authenticated user cancels their own order (blocked if shipped/delivered).
// If paid via Paymob, a full refund is automatically initiated.
router.delete('/:orderId/cancel', authenticate, orderController.cancelOrder);

module.exports = router;
