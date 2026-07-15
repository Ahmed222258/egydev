const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema(
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
        quantity: { type: Number, default: 1, min: 1 },
        price: { type: Number, required: true },

        // ── Variant selection (size × color) ──────────────────────────────
        // variantId links back to the specific variants[] subdocument
        variantId: {
          type: mongoose.Schema.Types.ObjectId,
          default: null,
        },
        size: { type: String, default: '' },
        color: { type: String, default: '' },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cart', cartSchema);
