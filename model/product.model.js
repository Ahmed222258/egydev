const mongoose = require('mongoose');


const productSchema = new mongoose.Schema({
  productName: String,
  description: String,
  price: Number,
  stock: Number,
  deleted: Boolean,
  imageUrl: String,
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'brand'
  },
  subcategories: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'subcategorie'
    },
  ]
});

module.exports = mongoose.model('Product', productSchema);