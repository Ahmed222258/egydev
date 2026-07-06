const Order = require('../model/order.model');
const Payment = require('../model/payment.model');
const Product = require('../model/product.model');
const logger = require('./logger.util');

/**
 * Start a periodic job to release stock of expired pending orders.
 * Run interval is default to 5 minutes.
 */
const startPaymentCleanupJob = () => {
  logger.info('Initializing payment session cleanup worker (runs every 5 minutes)...');

  setInterval(async () => {
    try {
      // Expiration time: 30 minutes ago
      const expirationTime = new Date(Date.now() - 30 * 60 * 1000);

      // Find pending orders created older than 30 minutes ago with initiated Paymob payments
      const expiredOrders = await Order.find({
        status: 'pending',
        createdAt: { $lt: expirationTime },
        paymobIntentionId: { $ne: null }
      });

      if (expiredOrders.length === 0) return;

      logger.info(`Payment Cleanup: Found ${expiredOrders.length} expired pending orders.`);

      for (const order of expiredOrders) {
        // Mark order as cancelled
        order.status = 'cancelled';
        await order.save();

        // Fail any pending payment records for this order
        await Payment.updateMany(
          { order: order._id, status: 'pending' },
          { status: 'failed' }
        );

        // Restore reserved stock
        for (const item of order.items) {
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

          // Restore Sold Out status if applicable
          const prod = await Product.findById(item.product);
          if (prod && prod.status === 'Sold Out' && prod.inventory.currentStock > 0) {
            prod.status = 'Available';
            await prod.save();
          }
        }
        logger.info(`Payment Cleanup: Cancelled order ${order._id} and restored stock.`);
      }
    } catch (err) {
      logger.error(`Payment Cleanup Error: ${err.message}`);
    }
  }, 5 * 60 * 1000); // 5 minutes
};

module.exports = { startPaymentCleanupJob };
