const Order = require('../model/order.model');
const Product = require('../model/product.model');
const logger = require('../utils/logger.util');

// ── Create Order ──────────────────────────────────────────────────────────────
exports.createOrder = async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Order must contain at least one item' });
    }

    // FIX #5 + #7: Server-side price lookup + atomic stock decrement
    // We use findOneAndUpdate with $inc and a conditional filter to atomically
    // check stock >= quantity and decrement in one operation, preventing oversell.
    let calculatedTotal = 0;
    const processedItems = [];

    for (const item of items) {
      if (!item.product || !item.quantity || item.quantity < 1) {
        return res.status(400).json({ message: 'Each item must have a product and quantity >= 1' });
      }

      // Determine variant filter for atomic update
      const hasVariant = item.variant && (item.variant.size || item.variant.color);

      // Fetch the product to get the real price (Fix #5)
      const product = await Product.findOne({
        _id: item.product,
        isDeleted: { $ne: true },
      });

      if (!product) {
        return res.status(404).json({ message: `Product not found: ${item.product}` });
      }

      // Use server-side price, never trust client price
      const unitPrice = product.price;
      calculatedTotal += unitPrice * item.quantity;

      if (hasVariant) {
        // FIX #7 – Atomic variant stock decrement
        const variantFilter = {
          _id: item.product,
          variants: {
            $elemMatch: {
              ...(item.variant.size  ? { size:  item.variant.size  } : {}),
              ...(item.variant.color ? { color: item.variant.color } : {}),
              stock: { $gte: item.quantity },
            },
          },
        };

        const variantUpdate = await Product.findOneAndUpdate(
          variantFilter,
          {
            $inc: {
              'inventory.currentStock': -item.quantity,
              'inventory.soldQuantity':  item.quantity,
              'analytics.purchases':     item.quantity,
              'variants.$.stock':        -item.quantity,
            },
          },
          { new: true }
        );

        if (!variantUpdate) {
          return res.status(400).json({
            message: `Insufficient variant stock for ${product.productName} (${item.variant.size || ''} ${item.variant.color || ''})`.trim(),
          });
        }

        // Auto set Sold Out
        if (variantUpdate.inventory.currentStock === 0) {
          variantUpdate.status = 'Sold Out';
          await variantUpdate.save();
        }

        // Low stock alert
        if (
          variantUpdate.inventory.currentStock > 0 &&
          variantUpdate.inventory.currentStock <= variantUpdate.inventory.minStockAlert
        ) {
          logger.warn(
            `LOW STOCK ALERT: "${variantUpdate.productName}" — ${variantUpdate.inventory.currentStock} remaining`
          );
        }
      } else {
        // FIX #7 – Atomic main stock decrement
        const mainUpdate = await Product.findOneAndUpdate(
          {
            _id: item.product,
            isDeleted: { $ne: true },
            'inventory.currentStock': { $gte: item.quantity },
          },
          {
            $inc: {
              'inventory.currentStock': -item.quantity,
              'inventory.soldQuantity':  item.quantity,
              'analytics.purchases':     item.quantity,
            },
          },
          { new: true }
        );

        if (!mainUpdate) {
          return res.status(400).json({ message: `Insufficient stock for ${product.productName}` });
        }

        if (mainUpdate.inventory.currentStock === 0) {
          mainUpdate.status = 'Sold Out';
          await mainUpdate.save();
        }

        if (
          mainUpdate.inventory.currentStock > 0 &&
          mainUpdate.inventory.currentStock <= mainUpdate.inventory.minStockAlert
        ) {
          logger.warn(
            `LOW STOCK ALERT: "${mainUpdate.productName}" — ${mainUpdate.inventory.currentStock} remaining`
          );
        }
      }

      processedItems.push({
        product: item.product,
        quantity: item.quantity,
        price: unitPrice, // server-side price (Fix #5)
        variant: item.variant || {},
      });
    }

    const newOrder = new Order({
      user: userId,
      items: processedItems,
      totalAmount: calculatedTotal, // server-calculated total (Fix #5)
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

// ── Get All Orders (admin only) ───────────────────────────────────────────────
exports.getAllOrders = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;
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
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 10;
    const skip   = (page - 1) * limit;

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

// ── Update Order Status (admin only) ─────────────────────────────────────────
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status }  = req.body;

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
        const hasVariant = item.variant && (item.variant.size || item.variant.color);
        if (hasVariant) {
          await Product.findOneAndUpdate(
            {
              _id: item.product,
              variants: {
                $elemMatch: {
                  ...(item.variant.size ? { size: item.variant.size } : {}),
                  ...(item.variant.color ? { color: item.variant.color } : {}),
                }
              }
            },
            {
              $inc: {
                'inventory.currentStock': item.quantity,
                'inventory.soldQuantity': -item.quantity,
                'analytics.purchases': -item.quantity,
                'variants.$.stock': item.quantity
              }
            }
          );
        } else {
          await Product.findByIdAndUpdate(item.product, {
            $inc: {
              'inventory.currentStock':  item.quantity,
              'inventory.soldQuantity': -item.quantity,
              'analytics.purchases':    -item.quantity,
            },
          });
        }

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
