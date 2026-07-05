const express = require('express');
const router = express.Router();
const reviewController = require('../controller/review.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validateReview } = require('../middleware/validate.middleware');

// Public: get reviews for a product
router.get('/:productId', reviewController.getProductReviews);

// Authenticated: submit a review
router.post('/:productId', authenticate, validateReview, reviewController.addReview);

// Authenticated: delete own review (or admin)
router.delete('/:id', authenticate, reviewController.deleteReview);

module.exports = router;
