const Order = require('../model/order.model');
const Payment = require('../model/payment.model');
const Product = require('../model/product.model');
const { createIntention } = require('../utils/paymob.util');
const logger = require('../utils/logger.util');

// Utility to generate a Paymob Unified Checkout URL dynamically using configured environment base URL
const getCheckoutUrl = (clientSecret) => {
  const BASE_URL = process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com';
  const origin = BASE_URL.replace(/\/api$/, '');
  const publicKey = process.env.PAYMOB_PUBLIC_KEY;
  return `${origin}/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${clientSecret}`;
};

// ── POST /api/payment/create ──────────────────────────────────────────────────
// Authenticated user initiates a Paymob Intention checkout for an existing pending order.
exports.createPayment = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: 'orderId is required' });
    }

    const publicKey = process.env.PAYMOB_PUBLIC_KEY;
    if (!publicKey || publicKey === 'YOUR_PUBLIC_KEY_HERE') {
      return res.status(500).json({ message: 'PAYMOB_PUBLIC_KEY is not configured' });
    }

    // Fetch the order and verify ownership
    const order = await Order.findById(orderId).populate('items.product', 'productName');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (order.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'You do not own this order' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ message: `Order is already ${order.status}` });
    }

    // ── Idempotency Check (Issue 5) ──────────────────────────────────────────
    const existingPayment = await Payment.findOne({ order: orderId, status: 'pending' });
    if (existingPayment && order.paymobClientSecret && order.paymobIntentionId) {
      const checkoutUrl = getCheckoutUrl(order.paymobClientSecret);
      logger.info(`Payment session reused for order ${orderId}, intention ${order.paymobIntentionId}`);
      return res.status(200).json({
        message: 'Payment session retrieved',
        checkoutUrl,
        intentionId: order.paymobIntentionId,
      });
    }

    // Amount in cents (totalAmount is stored in EGP)
    const amountCents = Math.round(order.totalAmount * 100);

    // Build Paymob items list (amount per item in cents)
    const paymobItems = order.items.map((item) => ({
      name:        item.product?.productName || 'Product',
      amount:      Math.round(item.price * 100),
      description: item.variant?.size || item.variant?.color || '',
      quantity:    item.quantity,
    }));

    // Build billing from user profile + shipping address
    const user = req.user;
    const nameParts = (user.name || '').split(' ');
    const billing = {
      firstName:  nameParts[0] || 'NA',
      lastName:   nameParts.slice(1).join(' ') || 'NA',
      email:      user.email || 'NA',
      phone:      user.phone || 'NA',
      street:     order.shippingAddress?.address || 'NA',
      apartment:  'NA',
      floor:      'NA',
      building:   'NA',
      city:       'NA',
      country:    'EG',
      postalCode: 'NA',
      state:      'NA',
    };

    logger.info(`Initiating Paymob intention for order ${orderId}`);

    // ── Single-call Intention API ─────────────────────────────────────────────
    const { intentionId, clientSecret } = await createIntention({
      orderId,
      amountCents,
      items:         paymobItems,
      billing,
      integrationId: process.env.PAYMOB_INTEGRATION_ID,
    });

    // Create a pending Payment record
    const payment = await Payment.create({
      order: order._id,
      user:  userId,
      amountCents,
    });

    // Save intention references and payment ref to the order
    order.paymobIntentionId  = intentionId;
    order.paymobClientSecret = clientSecret;
    order.payment            = payment._id;
    await order.save();

    // Unified Checkout URL
    const checkoutUrl = getCheckoutUrl(clientSecret);

    logger.info(`Payment intention created — order ${orderId}, intention ${intentionId}`);
    return res.status(200).json({
      message:      'Payment session created',
      checkoutUrl,
      intentionId,
    });
  } catch (err) {
    logger.error(`createPayment error: ${err.message}`);
    return res.status(500).json({ message: 'Failed to initiate payment' }); // Sanitized (Issue 8)
  }
};

// ── POST /api/payment/webhook ─────────────────────────────────────────────────
// Paymob calls this endpoint after every transaction (server-to-server).
// The verifyPaymob middleware validates HMAC before this runs.
exports.handleWebhook = async (req, res) => {
  try {
    const { obj } = req.body;

    if (!obj) {
      return res.status(400).json({ message: 'Invalid webhook payload' });
    }

    const { id: transactionId, success, order: paymobOrderObj } = obj;

    // ── Locate our local Order ────────────────────────────────────────────────
    const merchantOrderId = paymobOrderObj?.merchant_order_id;

    let order = null;
    if (merchantOrderId) {
      order = await Order.findById(merchantOrderId);
    }

    // Fallback: older intention payments stored on order
    if (!order) {
      const paymobIntentionId = String(paymobOrderObj?.id || '');
      order = await Order.findOne({ paymobIntentionId });
    }

    if (!order) {
      logger.warn(`Webhook: no local order found for merchant_order_id=${merchantOrderId}`);
      return res.status(200).json({ message: 'Order not found locally — acknowledged' });
    }

    // ── Verify Amount (Issue 4) ────────────────────────────────────────────────
    if (success === true) {
      const expectedAmountCents = Math.round(order.totalAmount * 100);
      if (Number(obj.amount_cents) !== expectedAmountCents) {
        logger.error(`Webhook amount mismatch for order ${order._id}: expected ${expectedAmountCents}, got ${obj.amount_cents}`);
        return res.status(400).json({ message: 'Amount mismatch' });
      }
    }

    // ── Idempotency — skip if already processed ───────────────────────────────
    const existing = await Payment.findOne({ paymobTransactionId: String(transactionId) });
    if (existing) {
      logger.info(`Duplicate webhook for transaction ${transactionId} — skipped`);
      return res.status(200).json({ message: 'Already processed' });
    }

    // Find the pending Payment record for this order
    const payment = await Payment.findOne({ order: order._id, status: 'pending' });

    if (success === true) {
      // ── Payment succeeded ─────────────────────────────────────────────────
      order.status = 'paid';
      await order.save();

      if (payment) {
        payment.paymobTransactionId = String(transactionId);
        payment.status   = 'paid';
        payment.rawWebhook = obj;
        await payment.save();
      } else {
        const newPayment = await Payment.create({
          order:                order._id,
          user:                 order.user,
          paymobTransactionId:  String(transactionId),
          amountCents:          obj.amount_cents,
          status:               'paid',
          rawWebhook:           obj,
        });
        order.payment = newPayment._id;
        await order.save();
      }

      // Stock is reserved on order creation, so we DO NOT decrement stock again (Fixes double-deduction bug)
      logger.info(`Payment SUCCESSFUL — order ${order._id} marked paid`);
    } else {
      // ── Payment failed ────────────────────────────────────────────────────
      if (payment) {
        payment.paymobTransactionId = String(transactionId);
        payment.status    = 'failed';
        payment.rawWebhook = obj;
        await payment.save();
      } else {
        const newPayment = await Payment.create({
          order:               order._id,
          user:                order.user,
          paymobTransactionId: String(transactionId),
          amountCents:         obj.amount_cents,
          status:              'failed',
          rawWebhook:          obj,
        });
        order.payment = newPayment._id;
        await order.save();
      }
      logger.warn(`Payment FAILED — order ${order._id}, transaction ${transactionId}`);
    }

    return res.status(200).json({ message: 'Webhook processed' });
  } catch (err) {
    logger.error(`handleWebhook error: ${err.message}`);
    return res.status(500).json({ message: 'Webhook processing error' }); // Sanitized (Issue 8)
  }
};

// ── GET /api/payment/callback ─────────────────────────────────────────────────
// Paymob redirects the browser here after the customer finishes on the checkout page.
exports.handleCallback = async (req, res) => {
  try {
    const { success, merchant_order_id, id: transactionId } = req.query;

    const isSuccess = success === 'true';

    const order = merchant_order_id
      ? await Order.findById(merchant_order_id).select('_id status')
      : null;

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const status = isSuccess ? 'success' : 'failure';
    const redirectUrl = order?._id
      ? `${frontendUrl}/order/${order._id}?status=${status}`
      : `${frontendUrl}/checkout?status=${status}`;

    logger.info(`Payment callback processed — success=${isSuccess}, redirecting client to ${redirectUrl}`);
    return res.redirect(redirectUrl); // Redirect instead of raw JSON (Issue 6)
  } catch (err) {
    logger.error(`handleCallback error: ${err.message}`);
    return res.status(500).json({ message: 'Callback error' }); // Sanitized (Issue 8)
  }
};

// ── GET /api/payment/status/:orderId ──────────────────────────────────────────
// Authenticated user queries the payment status for their order (Issue 11).
exports.getPaymentStatus = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'You do not own this order' });
    }

    // Find the latest payment record
    const payment = await Payment.findOne({ order: orderId }).sort({ createdAt: -1 });

    return res.status(200).json({
      orderStatus: order.status,
      paymentStatus: payment ? payment.status : 'no_payment_initiated',
      paymobTransactionId: payment ? payment.paymobTransactionId : null,
    });
  } catch (err) {
    logger.error(`getPaymentStatus error: ${err.message}`);
    return res.status(500).json({ message: 'Failed to retrieve payment status' });
  }
};

// ── POST /api/payment/retry/:orderId ──────────────────────────────────────────
// Authenticated user retries payment for a failed or pending order, creating a new intention (Issue 12).
exports.retryPayment = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { orderId } = req.params;

    const publicKey = process.env.PAYMOB_PUBLIC_KEY;
    if (!publicKey || publicKey === 'YOUR_PUBLIC_KEY_HERE') {
      return res.status(500).json({ message: 'PAYMOB_PUBLIC_KEY is not configured' });
    }

    const order = await Order.findById(orderId).populate('items.product', 'productName');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'You do not own this order' });
    }

    // A paid/shipped/delivered order cannot be retried
    if (order.status !== 'pending' && order.status !== 'cancelled') {
      return res.status(400).json({ message: `Cannot retry payment for order status ${order.status}` });
    }

    // If order was cancelled, we need to re-verify and reserve stock!
    if (order.status === 'cancelled') {
      // Recheck and reserve stock for the items
      for (const item of order.items) {
        const product = await Product.findOne({ _id: item.product, isDeleted: { $ne: true } });
        if (!product) {
          return res.status(404).json({ message: `Product not found: ${item.product}` });
        }

        const hasVariant = item.variant && (item.variant.size || item.variant.color);
        if (hasVariant) {
          const variantFilter = {
            _id: item.product,
            variants: {
              $elemMatch: {
                ...(item.variant.size ? { size: item.variant.size } : {}),
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
                'inventory.soldQuantity': item.quantity,
                'analytics.purchases': item.quantity,
                'variants.$.stock': -item.quantity,
              },
            },
            { new: true }
          );

          if (!variantUpdate) {
            return res.status(400).json({
              message: `Insufficient variant stock for ${product.productName} (${item.variant.size || ''} ${item.variant.color || ''})`.trim(),
            });
          }

          if (variantUpdate.inventory.currentStock === 0) {
            variantUpdate.status = 'Sold Out';
            await variantUpdate.save();
          }
        } else {
          const mainUpdate = await Product.findOneAndUpdate(
            {
              _id: item.product,
              isDeleted: { $ne: true },
              'inventory.currentStock': { $gte: item.quantity },
            },
            {
              $inc: {
                'inventory.currentStock': -item.quantity,
                'inventory.soldQuantity': item.quantity,
                'analytics.purchases': item.quantity,
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
        }
      }

      // Restore order status to pending
      order.status = 'pending';
      await order.save();
    }

    // Cancel/mark expired any previous pending payment records for this order
    await Payment.updateMany(
      { order: orderId, status: 'pending' },
      { status: 'failed' }
    );

    const amountCents = Math.round(order.totalAmount * 100);

    const paymobItems = order.items.map((item) => ({
      name: item.product?.productName || 'Product',
      amount: Math.round(item.price * 100),
      description: item.variant?.size || item.variant?.color || '',
      quantity: item.quantity,
    }));

    const user = req.user;
    const nameParts = (user.name || '').split(' ');
    const billing = {
      firstName: nameParts[0] || 'NA',
      lastName: nameParts.slice(1).join(' ') || 'NA',
      email: user.email || 'NA',
      phone: user.phone || 'NA',
      street: order.shippingAddress?.address || 'NA',
      apartment: 'NA',
      floor: 'NA',
      building: 'NA',
      city: 'NA',
      country: 'EG',
      postalCode: 'NA',
      state: 'NA',
    };

    logger.info(`Retrying payment — initiating new Paymob intention for order ${orderId}`);

    const { intentionId, clientSecret } = await createIntention({
      orderId,
      amountCents,
      items: paymobItems,
      billing,
      integrationId: process.env.PAYMOB_INTEGRATION_ID,
    });

    // Create a new pending Payment record
    const payment = await Payment.create({
      order: order._id,
      user: userId,
      amountCents,
    });

    order.paymobIntentionId = intentionId;
    order.paymobClientSecret = clientSecret;
    order.payment = payment._id;
    await order.save();

    const checkoutUrl = getCheckoutUrl(clientSecret);

    logger.info(`Payment retried successfully — order ${orderId}, intention ${intentionId}`);
    return res.status(200).json({
      message: 'New payment session created',
      checkoutUrl,
      intentionId,
    });
  } catch (err) {
    logger.error(`retryPayment error: ${err.message}`);
    return res.status(500).json({ message: 'Failed to retry payment' });
  }
};
