const mongoose = require('mongoose');

const categorieSchema = new mongoose.Schema(
  {
    categorieName: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    // Self-referential: allows subcategory tree (parent category)
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'categorie',
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deleted: { type: Boolean, default: false }, // legacy compat
  },
  { timestamps: true }
);

categorieSchema.index({ categorieName: 'text' });
categorieSchema.index({ parent: 1 });

module.exports = mongoose.model('categorie', categorieSchema);
