const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema(
  {
    brandName: {
      type: String,
      required: true,
      trim: true,
    },
    logo: {
      type: String,
      default: '',
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deleted: { type: Boolean, default: false }, // legacy compat
  },
  { timestamps: true }
);

brandSchema.index({ brandName: 'text' });

module.exports = mongoose.model('brand', brandSchema);
