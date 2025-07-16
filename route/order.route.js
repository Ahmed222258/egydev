const express = require('express');
const router = express.Router();
const orderController = require('../controller/order.controller');
const { authenticate } = require('../middleware/auth.middleware');


router.post('/', authenticate, orderController.createOrder);
router.get('/', authenticate, orderController.getAllOrders);
router.get('/my', authenticate, orderController.getUserOrders);
router.put('/:orderId/status', authenticate, orderController.updateOrderStatus);


module.exports = router;
