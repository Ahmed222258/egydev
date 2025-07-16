const mongoose = require('mongoose');

const categorieSchema = new mongoose.Schema({
  categorieName: {
    type: String,
    required: true,
    trim: true,
    unique: true ,

  },
    deleted: Boolean,

});

module.exports = mongoose.model('categorie', categorieSchema);
