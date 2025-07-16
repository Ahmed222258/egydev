const express = require('express');
const router = express.Router();
const cartController = require('../controller/cart.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/', authenticate, cartController.getCart);
router.post('/add', authenticate, cartController.addToCart);
router.delete('/remove/:productId', authenticate, cartController.removeFromCart);
router.put('/update/:productId', authenticate, cartController.updateQuantity);
router.delete('/clear', authenticate, cartController.clearCart);
router.post('/sync', authenticate, cartController.syncCartFromLocal);

module.exports = router;
