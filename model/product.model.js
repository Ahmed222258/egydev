const mongoose = require('mongoose');

// ── Variant Sub-Schema ────────────────────────────────────────────────────────
const variantSchema = new mongoose.Schema(
  {
    size: {
      type: String,
      enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'One Size'],
      default: 'One Size',
    },
    color: {
      type: String,
      trim: true,
      default: '',
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    sku: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: true }
);

// ── Main Product Schema ───────────────────────────────────────────────────────
const productSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },

    // ── Classification ──────────────────────────────────────────────────────
    type: {
      type: String,
      enum: [
        'Shirt',
        'Sticker',
        'Cap',
        'Scarf',
        'Poster',
        'Flag',
        'Accessories',
        'Shoes',
        'Ball',
        'Mug',
        'Keychain',
      ],
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'brand',
    },
    subcategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'subcategorie',
      },
    ],

    // ── Status ──────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        'Available',
        'Sold Out',
        'Limited Edition',
        'Coming Soon',
        'Pre-order',
        'Discontinued',
      ],
      default: 'Available',
    },

    // ── Pricing ─────────────────────────────────────────────────────────────
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    // ── Sale / Discount ─────────────────────────────────────────────────────
    sale: {
      isOnSale: { type: Boolean, default: false },
      originalPrice: { type: Number, default: 0 },
      discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
      salePrice: { type: Number, default: 0 },
      saleStartDate: { type: Date },
      saleEndDate: { type: Date },
    },

    // ── Inventory ───────────────────────────────────────────────────────────
    inventory: {
      currentStock: { type: Number, default: 0, min: 0 },
      reservedStock: { type: Number, default: 0, min: 0 },
      soldQuantity: { type: Number, default: 0, min: 0 },
      minStockAlert: { type: Number, default: 5, min: 0 },
      maxStock: { type: Number, default: 100, min: 0 },
    },

    // ── Variants (size × color combinations, each with own stock) ──────────
    variants: [variantSchema],

    // ── Images ──────────────────────────────────────────────────────────────
    // Legacy single image kept for backward compatibility
    imageUrl: { type: String, default: '' },
    // New multi-image array
    images: [{ type: String }],

    // ── Tags ────────────────────────────────────────────────────────────────
    tags: [{ type: String, trim: true }],

    // ── Analytics ───────────────────────────────────────────────────────────
    analytics: {
      views: { type: Number, default: 0 },
      purchases: { type: Number, default: 0 },
      wishlistCount: { type: Number, default: 0 },
      cartCount: { type: Number, default: 0 },
      rating: { type: Number, default: 0, min: 0, max: 5 },
      reviewCount: { type: Number, default: 0 },
    },

    // ── Soft Delete ─────────────────────────────────────────────────────────
    isDeleted: { type: Boolean, default: false },
    // Keep legacy `deleted` for backward compatibility with existing documents
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
productSchema.index({ productName: 'text', description: 'text', tags: 'text' });
productSchema.index({ team: 1 });
productSchema.index({ type: 1 });
productSchema.index({ status: 1 });
productSchema.index({ price: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ 'sale.isOnSale': 1 });
productSchema.index({ isDeleted: 1 });

// ── Virtual: effective selling price ─────────────────────────────────────────
productSchema.virtual('effectivePrice').get(function () {
  if (this.sale && this.sale.isOnSale && this.sale.salePrice > 0) {
    const now = new Date();
    const started = !this.sale.saleStartDate || this.sale.saleStartDate <= now;
    const notEnded = !this.sale.saleEndDate || this.sale.saleEndDate >= now;
    if (started && notEnded) return this.sale.salePrice;
  }
  return this.price;
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);