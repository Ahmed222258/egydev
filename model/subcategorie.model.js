const mongoose = require('mongoose');

const subcategorieSchema = new mongoose.Schema({
  subcategorieName: {
    type: String,
    required: true,
  },
  categorie: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'categorie',
    required: true
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deleted: {
    type: Boolean,
    default: false,
  }
});

module.exports = mongoose.model('subcategorie', subcategorieSchema);