
const mongoose = require('mongoose');

const subcategorieSchema = new mongoose.Schema({
  subcategorieName: String,
  categorie: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'categorie',
    required: true
  }
});

module.exports = mongoose.model('subcategorie', subcategorieSchema);