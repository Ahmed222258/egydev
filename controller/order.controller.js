const Order = require('../model/order.model');
const Product = require('../model/product.model');
const Payment = require('../model/payment.model');
const { refundTransaction } = require('../utils/paymob.util');
const logger = require('../utils/logger.util');

// ── Create Order ──────────────────────────────────────────────────────────────
exports.createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Order must contain at least one item' });
    }

    // Validate payment method
    // const validPaymentMethods = ['visa', 'instapay', 'cash_on_delivery']; // visa disabled
    const validPaymentMethods = ['instapay', 'cash_on_delivery'];
    const chosenMethod = paymentMethod || 'cash_on_delivery';
    if (!validPaymentMethods.includes(chosenMethod)) {
      return res.status(400).json({
        message: `Invalid payment method. Must be one of: ${validPaymentMethods.join(', ')}`,
      });
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

    const subtotal = calculatedTotal;
    const tax = 0;
    const shippingFee = 0;
    const codFee = chosenMethod === 'cash_on_delivery' ? 20 : 0;
    const finalTotal = subtotal + tax + shippingFee + codFee;

    const newOrder = new Order({
      user: userId,
      items: processedItems,
      totalAmount: finalTotal,
      tax,
      shippingFee,
      codFee,
      shippingAddress: {
        address: shippingAddress?.address || '',
        city: shippingAddress?.city || '',
        country: shippingAddress?.country || '',
      },
      paymentMethod: chosenMethod,
    });

    const savedOrder = await newOrder.save();
    logger.info(`Order created: ${savedOrder._id} by user ${userId} — payment method: ${chosenMethod}`);

    // Build a helpful message based on payment method
    let message = 'Order placed successfully';
    let nextStep = null;
    // visa payment disabled
    // if (chosenMethod === 'visa') {
    //   nextStep = 'Proceed to POST /api/payment/create with this orderId to get your Paymob checkout URL';
    // } else
    if (chosenMethod === 'instapay') {
      nextStep = 'Please DM us on Instagram to complete your InstaPay payment';
    } else {
      nextStep = 'Your order will be delivered and payment collected on delivery';
    }

    res.status(201).json({ message, nextStep, data: savedOrder });
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

// ── Get Single Order by ID ────────────────────────────────────────────────────
exports.getOrderById = async (req, res) => {
  try {
    const userId  = req.user?.id;
    const isAdmin = req.user?.role === 'admin';
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .populate('user', 'name email')
      .populate('items.product', 'productName price imageUrl images')
      .populate('payment');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Users can only view their own orders; admins can view any
    if (!isAdmin && order.user._id.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.status(200).json({ message: 'Order details', data: order });
  } catch (error) {
    logger.error(`Get Order By ID Error: ${error.message}`);
    res.status(500).json({ message: 'Failed to fetch order', error: error.message });
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

// ── Cancel Order (user) ───────────────────────────────────────────────────────
// Allows the authenticated user to cancel their own order.
// Rules:
//   - Cannot cancel if status is 'shipped' or 'delivered'
//   - If paid via Paymob (visa + status=paid), a full refund is initiated automatically
//   - Stock is restored for all items
exports.cancelOrder = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { orderId } = req.params;

    const order = await Order.findById(orderId).populate('items.product', 'productName');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Ownership check
    if (order.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'You do not own this order' });
    }

    // Block cancellation once the order is shipped or delivered
    if (order.status === 'shipped' || order.status === 'delivered') {
      return res.status(400).json({
        message: `Cannot cancel an order that is already ${order.status}`,
      });
    }

    // Block double-cancellation
    if (order.status === 'cancelled') {
      return res.status(400).json({ message: 'Order is already cancelled' });
    }

    // ── Paymob Refund (only if paid via card) ────────────────────────────────
    let refundResult = null;
    if (order.paymentMethod === 'visa' && order.status === 'paid') {
      const payment = await Payment.findOne({ order: order._id, status: 'paid' })
        .sort({ createdAt: -1 });

      if (!payment || !payment.paymobTransactionId) {
        return res.status(400).json({
          message: 'Cannot refund: no completed Paymob transaction found for this order. Contact support.',
        });
      }
      try {
        const isMockTx = /[^0-9]/.test(payment.paymobTransactionId);
        if (isMockTx) {
          refundResult = { success: true, refundId: 'mock-refund-' + Date.now() };
          logger.info(`Bypassed Paymob API refund for non-numeric/mock transaction ID: ${payment.paymobTransactionId}`);
        } else {
          refundResult = await refundTransaction({
            transactionId: payment.paymobTransactionId,
            amountCents: payment.amountCents,
          });
        }

        // Mark Payment record as refunded
        payment.status = 'refunded';
        await payment.save();
        logger.info(`Paymob refund initiated — order ${orderId}, refundId ${refundResult.refundId}`);
      } catch (refundErr) {
        logger.error(`Paymob refund failed for order ${orderId}: ${refundErr.message}`);
        return res.status(502).json({
          message: `Order cancellation failed: refund could not be processed. ${refundErr.message}`,
        });
      }
    }

    // ── Restore Stock ────────────────────────────────────────────────────────
    for (const item of order.items) {
      const hasVariant = item.variant && (item.variant.size || item.variant.color);
      if (hasVariant) {
        await Product.findOneAndUpdate(
          {
            _id: item.product,
            variants: {
              $elemMatch: {
                ...(item.variant.size  ? { size:  item.variant.size  } : {}),
                ...(item.variant.color ? { color: item.variant.color } : {}),
              },
            },
          },
          {
            $inc: {
              'inventory.currentStock':  item.quantity,
              'inventory.soldQuantity': -item.quantity,
              'analytics.purchases':    -item.quantity,
              'variants.$.stock':        item.quantity,
            },
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

      // Re-activate product if it was Sold Out
      const prod = await Product.findById(item.product);
      if (prod && prod.status === 'Sold Out' && prod.inventory.currentStock > 0) {
        prod.status = 'Available';
        await prod.save();
      }
    }

    // ── Mark Order Cancelled ─────────────────────────────────────────────────
    order.status = 'cancelled';
    await order.save();

    logger.info(`Order ${orderId} cancelled by user ${userId}${
      refundResult ? ` — refund initiated (refundId: ${refundResult.refundId})` : ''
    }`);

    return res.status(200).json({
      message: refundResult
        ? 'Order cancelled and refund has been initiated. It may take a few business days to reflect.'
        : 'Order cancelled successfully.',
      refundInitiated: !!refundResult,
      refundId: refundResult?.refundId || null,
    });
  } catch (err) {
    logger.error(`cancelOrder error: ${err.message}`);
    return res.status(500).json({ message: 'Failed to cancel order' });
  }
};
