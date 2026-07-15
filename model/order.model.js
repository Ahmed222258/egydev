const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
        },
        // Variant selected at time of purchase
        variant: {
          size: { type: String, default: '' },
          color: { type: String, default: '' },
        },
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
    // Payment method chosen by the customer at checkout
    paymentMethod: {
      type: String,
      // enum: ['visa', 'instapay', 'cash_on_delivery'], // visa disabled
      enum: ['instapay', 'cash_on_delivery'],
      required: true,
      default: 'cash_on_delivery',
    },
    shippingAddress: {
      address: { type: String, default: '' },
      city: { type: String, default: '' },
      country: { type: String, default: '' },
    },
    tax: {
      type: Number,
      default: 0,
    },
    shippingFee: {
      type: Number,
      default: 0,
    },
    codFee: {
      type: Number,
      default: 0,
    },
    // Paymob Intention API references
    paymobIntentionId: {
      type: String,
      default: null,
    },
    // client_secret is used to build the Unified Checkout URL
    paymobClientSecret: {
      type: String,
      default: null,
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
