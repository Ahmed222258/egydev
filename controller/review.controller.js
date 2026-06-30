const Review = require('../model/review.model');
const Product = require('../model/product.model');
const Order = require('../model/order.model');
const logger = require('../utils/logger.util');

// ── Helper: recalculate product average rating ────────────────────────────────
async function recalcProductRating(productId) {
  const result = await Review.aggregate([
    { $match: { product: productId, isDeleted: false } },
    {
      $group: {
        _id: '$product',
        avgRating: { $avg: '$rating' },
        count: { $sum: 1 },
      },
    },
  ]);

  const rating = result.length > 0 ? Math.round(result[0].avgRating * 10) / 10 : 0;
  const reviewCount = result.length > 0 ? result[0].count : 0;

  await Product.findByIdAndUpdate(productId, {
    'analytics.rating': rating,
    'analytics.reviewCount': reviewCount,
  });
}

// ── Add Review ────────────────────────────────────────────────────────────────
exports.addReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const product = await Product.findById(productId);
    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if user already reviewed this product
    const existingReview = await Review.findOne({ product: productId, user: userId, isDeleted: false });
    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this product' });
    }

    // Check for verified purchase
    const hasPurchased = await Order.findOne({
      user: userId,
      'items.product': productId,
      status: { $in: ['paid', 'shipped', 'delivered'] },
    });

    const review = await Review.create({
      product: productId,
      user: userId,
      rating,
      comment: comment?.trim() || '',
      verifiedPurchase: !!hasPurchased,
    });

    await recalcProductRating(product._id);

    logger.info(`Review added: ${review._id} for product ${productId}`);
    res.status(201).json({ message: 'Review added successfully', data: review });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'You have already reviewed this product' });
    }
    logger.error(`Add Review Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to add review', error: err.message });
  }
};

// ── Get Product Reviews ───────────────────────────────────────────────────────
exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { product: productId, isDeleted: false };

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('user', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
    ]);

    res.status(200).json({
      message: 'Product reviews',
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: reviews,
    });
  } catch (err) {
    logger.error(`Get Reviews Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve reviews', error: err.message });
  }
};

// ── Delete Review (own review or admin) ──────────────────────────────────────
exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review || review.isDeleted) {
      return res.status(404).json({ message: 'Review not found' });
    }

    const isOwner = review.user.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'manager';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete this review' });
    }

    review.isDeleted = true;
    await review.save();

    await recalcProductRating(review.product);

    logger.info(`Review deleted: ${review._id}`);
    res.status(200).json({ message: 'Review deleted' });
  } catch (err) {
    logger.error(`Delete Review Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to delete review', error: err.message });
  }
};
