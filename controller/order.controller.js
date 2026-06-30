const Order = require('../model/order.model');
const Product = require('../model/product.model');
const logger = require('../utils/logger.util');

// ── Create Order ──────────────────────────────────────────────────────────────
exports.createOrder = async (req, res) => {
  try {
    const { items, totalAmount, shippingAddress } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Order must contain at least one item' });
    }

    // Validate stock and prepare updates
    const stockUpdates = [];

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product || product.isDeleted) {
        return res.status(404).json({ message: `Product not found: ${item.product}` });
      }

      // Check variant stock if a variant was selected
      if (item.variant && (item.variant.size || item.variant.color)) {
        const variant = product.variants.find(
          (v) =>
            (!item.variant.size || v.size === item.variant.size) &&
            (!item.variant.color || v.color.toLowerCase() === item.variant.color.toLowerCase())
        );

        if (variant) {
          if (variant.stock < item.quantity) {
            return res.status(400).json({
              message: `Insufficient variant stock for ${product.productName} (${item.variant.size || ''} ${item.variant.color || ''})`,
            });
          }
          stockUpdates.push({ type: 'variant', product, variant, quantity: item.quantity });
        } else {
          // Fallback to main inventory
          if (product.inventory.currentStock < item.quantity) {
            return res.status(400).json({ message: `Insufficient stock for ${product.productName}` });
          }
          stockUpdates.push({ type: 'main', product, quantity: item.quantity });
        }
      } else {
        if (product.inventory.currentStock < item.quantity) {
          return res.status(400).json({ message: `Insufficient stock for ${product.productName}` });
        }
        stockUpdates.push({ type: 'main', product, quantity: item.quantity });
      }
    }

    // Apply stock updates
    for (const update of stockUpdates) {
      const { product, quantity } = update;

      if (update.type === 'variant') {
        const variantIndex = product.variants.findIndex(
          (v) => v._id.toString() === update.variant._id.toString()
        );
        if (variantIndex > -1) {
          product.variants[variantIndex].stock -= quantity;
        }
      }

      product.inventory.currentStock = Math.max(0, product.inventory.currentStock - quantity);
      product.inventory.soldQuantity += quantity;
      product.analytics.purchases += quantity;

      // Auto set Sold Out
      if (product.inventory.currentStock === 0) {
        product.status = 'Sold Out';
      }

      await product.save();

      // Low stock alert
      if (
        product.inventory.currentStock > 0 &&
        product.inventory.currentStock <= product.inventory.minStockAlert
      ) {
        logger.warn(
          `LOW STOCK ALERT: "${product.productName}" (ID: ${product._id}) — only ${product.inventory.currentStock} remaining (alert threshold: ${product.inventory.minStockAlert})`
        );
      }
    }

    const newOrder = new Order({
      user: userId,
      items,
      totalAmount,
      shippingAddress,
    });

    const savedOrder = await newOrder.save();
    logger.info(`Order created: ${savedOrder._id} by user ${userId}`);
    res.status(201).json({ message: 'Order placed successfully', data: savedOrder });
  } catch (err) {
    logger.error(`Order creation failed: ${err.message}`);
    res.status(500).json({
      message: 'Failed to create order',
      error: err.message,
    });
  }
};

// ── Get All Orders (admin) ────────────────────────────────────────────────────
exports.getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status } = req.query;

    const filter = status ? { status } : {};

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('user', 'name email')
        .populate('items.product', 'productName price imageUrl')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter),
    ]);

    res.status(200).json({
      message: 'All orders',
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: orders,
    });
  } catch (error) {
    logger.error(`Get All Orders Error: ${error.message}`);
    res.status(500).json({ message: 'Failed to fetch orders', error: error.message });
  }
};

// ── Get User's Own Orders ─────────────────────────────────────────────────────
exports.getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find({ user: userId })
        .populate('items.product', 'productName price imageUrl images')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments({ user: userId }),
    ]);

    res.status(200).json({
      message: 'Your orders',
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: orders,
    });
  } catch (error) {
    logger.error(`Get User Orders Error: ${error.message}`);
    res.status(500).json({ message: 'Failed to fetch orders', error: error.message });
  }
};

// ── Update Order Status ───────────────────────────────────────────────────────
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { status },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // If cancelled, restore inventory
    if (status === 'cancelled') {
      for (const item of updatedOrder.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: {
            'inventory.currentStock': item.quantity,
            'inventory.soldQuantity': -item.quantity,
            'analytics.purchases': -item.quantity,
          },
        });

        // Check if it was Sold Out and can now be Available again
        const prod = await Product.findById(item.product);
        if (prod && prod.status === 'Sold Out' && prod.inventory.currentStock > 0) {
          prod.status = 'Available';
          await prod.save();
        }
      }
      logger.info(`Order ${orderId} cancelled — inventory restored`);
    }

    logger.info(`Order ${orderId} status updated to ${status}`);
    res.status(200).json({ message: 'Order status updated', data: updatedOrder });
  } catch (error) {
    logger.error(`Update Order Status Error: ${error.message}`);
    res.status(500).json({ message: 'Failed to update order', error: error.message });
  }
};
