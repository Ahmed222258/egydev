const express = require('express');
const router = express.Router();
const wishlistController = require('../controller/wishlist.controller');
const { authenticate } = require('../middleware/auth.middleware');

// All wishlist routes require authentication
router.use(authenticate);

router.get('/', wishlistController.getWishlist);
router.post('/:productId', wishlistController.addToWishlist);
router.delete('/:productId', wishlistController.removeFromWishlist);

module.exports = router;
