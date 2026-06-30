const Product = require('../model/product.model');
const Order = require('../model/order.model');
const User = require('../model/user.model');
const logger = require('../utils/logger.util');

// ── General Stats ─────────────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const [
      totalProducts,
      availableProducts,
      soldOutProducts,
      limitedEditionProducts,
      lowStockProducts,
      totalOrders,
      revenueData,
      totalUsers,
    ] = await Promise.all([
      Product.countDocuments({ isDeleted: false }),
      Product.countDocuments({ status: 'Available', isDeleted: false }),
      Product.countDocuments({ status: 'Sold Out', isDeleted: false }),
      Product.countDocuments({ status: 'Limited Edition', isDeleted: false }),
      // Products where currentStock <= minStockAlert and still active
      Product.find({
        isDeleted: false,
        status: { $nin: ['Discontinued', 'Sold Out'] },
        $expr: {
          $lte: ['$inventory.currentStock', '$inventory.minStockAlert'],
        },
      }).select('productName team type inventory.currentStock inventory.minStockAlert status'),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { status: { $in: ['paid', 'shipped', 'delivered'] } } },
        { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' }, avgOrderValue: { $avg: '$totalAmount' } } },
      ]),
      User.countDocuments({ role: 'user' }),
    ]);

    const revenue = revenueData[0] || { totalRevenue: 0, avgOrderValue: 0 };

    res.status(200).json({
      message: 'Dashboard statistics',
      data: {
        products: {
          total: totalProducts,
          available: availableProducts,
          soldOut: soldOutProducts,
          limitedEdition: limitedEditionProducts,
        },
        orders: {
          total: totalOrders,
          revenue: Math.round(revenue.totalRevenue * 100) / 100,
          averageOrderValue: Math.round(revenue.avgOrderValue * 100) / 100,
        },
        users: {
          total: totalUsers,
        },
        lowStockAlerts: lowStockProducts,
      },
    });
  } catch (err) {
    logger.error(`Dashboard Stats Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve stats', error: err.message });
  }
};

// ── Best Sellers ──────────────────────────────────────────────────────────────
exports.getBestSellers = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const bestSellers = await Product.find({ isDeleted: false })
      .sort({ 'analytics.purchases': -1 })
      .limit(limit)
      .populate('team', 'teamName')
      .populate('brand', 'brandName')
      .select('productName type status price analytics.purchases analytics.rating inventory.currentStock imageUrl images');

    res.status(200).json({ message: 'Best sellers', data: bestSellers });
  } catch (err) {
    logger.error(`Best Sellers Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve best sellers', error: err.message });
  }
};

// ── Order Analytics ───────────────────────────────────────────────────────────
exports.getOrderAnalytics = async (req, res) => {
  try {
    // Monthly sales for last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const [monthlySales, dailyOrders, mostPurchased, leastPurchased] = await Promise.all([
      // Monthly revenue
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: twelveMonthsAgo },
            status: { $in: ['paid', 'shipped', 'delivered'] },
          },
        },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            revenue: { $sum: '$totalAmount' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),

      // Daily orders (last 30 days)
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            orders: { $sum: 1 },
            revenue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Most purchased product
      Product.find({ isDeleted: false })
        .sort({ 'analytics.purchases': -1 })
        .limit(1)
        .select('productName analytics.purchases'),

      // Least purchased (that has at least 1 purchase)
      Product.find({ isDeleted: false, 'analytics.purchases': { $gt: 0 } })
        .sort({ 'analytics.purchases': 1 })
        .limit(1)
        .select('productName analytics.purchases'),
    ]);

    res.status(200).json({
      message: 'Order analytics',
      data: {
        monthlySales,
        dailyOrders,
        mostPurchasedProduct: mostPurchased[0] || null,
        leastPurchasedProduct: leastPurchased[0] || null,
      },
    });
  } catch (err) {
    logger.error(`Order Analytics Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve order analytics', error: err.message });
  }
};
