const Order = require('../model/order.model');
const Payment = require('../model/payment.model');
const Product = require('../model/product.model');
const { createIntention } = require('../utils/paymob.util');
const logger = require('../utils/logger.util');

const INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID;
const PUBLIC_KEY     = process.env.PAYMOB_PUBLIC_KEY;

// ── POST /api/payment/create ──────────────────────────────────────────────────
// Authenticated user initiates a Paymob Intention checkout for an existing pending order.
exports.createPayment = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: 'orderId is required' });
    }

    if (!PUBLIC_KEY) {
      return res.status(500).json({ message: 'PAYMOB_PUBLIC_KEY is not configured in .env' });
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
      integrationId: INTEGRATION_ID,
    });

    // Save intention references to the order
    order.paymobIntentionId  = intentionId;
    order.paymobClientSecret = clientSecret;
    await order.save();

    // Create a pending Payment record
    await Payment.create({
      order: order._id,
      user:  userId,
      amountCents,
    });

    // Unified Checkout URL — customer opens this in their browser to pay
    const checkoutUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${PUBLIC_KEY}&clientSecret=${clientSecret}`;

    logger.info(`Payment intention created — order ${orderId}, intention ${intentionId}`);
    return res.status(200).json({
      message:      'Payment session created',
      checkoutUrl,
      intentionId,
    });
  } catch (err) {
    logger.error(`createPayment error: ${err.message}`);
    return res.status(500).json({ message: 'Failed to initiate payment', error: err.message });
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
    // With the Intention API we pass merchant_order_id = our local order._id,
    // so Paymob echoes it back in obj.order.merchant_order_id.
    const merchantOrderId = paymobOrderObj?.merchant_order_id;

    let order = null;
    if (merchantOrderId) {
      order = await Order.findById(merchantOrderId);
    }

    // Fallback: some older/legacy webhooks use paymobIntentionId stored on the order
    if (!order) {
      const paymobIntentionId = String(paymobOrderObj?.id || '');
      order = await Order.findOne({ paymobIntentionId });
    }

    if (!order) {
      logger.warn(`Webhook: no local order found for merchant_order_id=${merchantOrderId}`);
      return res.status(200).json({ message: 'Order not found locally — acknowledged' });
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
        await Payment.create({
          order:                order._id,
          user:                 order.user,
          paymobTransactionId:  String(transactionId),
          amountCents:          obj.amount_cents,
          status:               'paid',
          rawWebhook:           obj,
        });
      }

      // ── Reduce stock for each purchased item ──────────────────────────────
      for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (!product) continue;

        if (item.variant && (item.variant.size || item.variant.color)) {
          const vi = product.variants.findIndex(
            (v) =>
              (!item.variant.size  || v.size  === item.variant.size) &&
              (!item.variant.color || v.color.toLowerCase() === item.variant.color.toLowerCase())
          );
          if (vi > -1) {
            product.variants[vi].stock = Math.max(0, product.variants[vi].stock - item.quantity);
          }
        }

        product.inventory.currentStock = Math.max(0, product.inventory.currentStock - item.quantity);
        product.inventory.soldQuantity += item.quantity;
        product.analytics.purchases    += item.quantity;

        if (product.inventory.currentStock === 0) product.status = 'Sold Out';

        await product.save();

        if (product.inventory.currentStock > 0 &&
            product.inventory.currentStock <= product.inventory.minStockAlert) {
          logger.warn(`LOW STOCK: "${product.productName}" — ${product.inventory.currentStock} left`);
        }
      }

      logger.info(`Payment SUCCESSFUL — order ${order._id} marked paid`);
    } else {
      // ── Payment failed ────────────────────────────────────────────────────
      if (payment) {
        payment.paymobTransactionId = String(transactionId);
        payment.status    = 'failed';
        payment.rawWebhook = obj;
        await payment.save();
      } else {
        await Payment.create({
          order:               order._id,
          user:                order.user,
          paymobTransactionId: String(transactionId),
          amountCents:         obj.amount_cents,
          status:              'failed',
          rawWebhook:          obj,
        });
      }
      logger.warn(`Payment FAILED — order ${order._id}, transaction ${transactionId}`);
    }

    return res.status(200).json({ message: 'Webhook processed' });
  } catch (err) {
    logger.error(`handleWebhook error: ${err.message}`);
    return res.status(500).json({ message: 'Webhook processing error', error: err.message });
  }
};

// ── GET /api/payment/callback ─────────────────────────────────────────────────
// Paymob redirects the browser here after the customer finishes on the checkout page.
// Not a server webhook — no HMAC needed — just read query params.
exports.handleCallback = async (req, res) => {
  try {
    const { success, merchant_order_id, id: transactionId } = req.query;

    const isSuccess = success === 'true';

    const order = merchant_order_id
      ? await Order.findById(merchant_order_id).select('_id status')
      : null;

    return res.status(200).json({
      message:             isSuccess ? 'Payment successful' : 'Payment failed or cancelled',
      success:             isSuccess,
      localOrderId:        order?._id  || null,
      orderStatus:         order?.status || null,
      paymobTransactionId: transactionId || null,
    });
  } catch (err) {
    logger.error(`handleCallback error: ${err.message}`);
    return res.status(500).json({ message: 'Callback error', error: err.message });
  }
};
