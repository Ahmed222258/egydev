const User = require('../model/user.model');
const Product = require('../model/product.model');
const logger = require('../utils/logger.util');

// ── Get Wishlist ──────────────────────────────────────────────────────────────
exports.getWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({
        path: 'wishlist',
        match: { isDeleted: false },
        select: 'productName price status imageUrl images type team analytics.rating sale',
        populate: { path: 'team', select: 'teamName' },
      });

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({
      message: 'Wishlist',
      count: user.wishlist.length,
      data: user.wishlist,
    });
  } catch (err) {
    logger.error(`Get Wishlist Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve wishlist', error: err.message });
  }
};

// ── Add to Wishlist ───────────────────────────────────────────────────────────
exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId);
    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const alreadyInWishlist = user.wishlist.some(
      (id) => id.toString() === productId
    );

    if (alreadyInWishlist) {
      return res.status(400).json({ message: 'Product already in wishlist' });
    }

    user.wishlist.push(productId);
    await user.save();

    // Increment product wishlist count
    await Product.findByIdAndUpdate(productId, {
      $inc: { 'analytics.wishlistCount': 1 },
    });

    logger.info(`Product ${productId} added to wishlist by user ${req.user.id}`);
    res.status(200).json({ message: 'Product added to wishlist' });
  } catch (err) {
    logger.error(`Add Wishlist Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to update wishlist', error: err.message });
  }
};

// ── Remove from Wishlist ──────────────────────────────────────────────────────
exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const wasInWishlist = user.wishlist.some(
      (id) => id.toString() === productId
    );

    if (!wasInWishlist) {
      return res.status(400).json({ message: 'Product not in wishlist' });
    }

    user.wishlist = user.wishlist.filter((id) => id.toString() !== productId);
    await user.save();

    // Decrement product wishlist count (floor at 0)
    await Product.findByIdAndUpdate(productId, [
      {
        $set: {
          'analytics.wishlistCount': {
            $max: [0, { $subtract: ['$analytics.wishlistCount', 1] }],
          },
        },
      },
    ]);

    logger.info(`Product ${productId} removed from wishlist by user ${req.user.id}`);
    res.status(200).json({ message: 'Product removed from wishlist' });
  } catch (err) {
    logger.error(`Remove Wishlist Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to update wishlist', error: err.message });
  }
};
