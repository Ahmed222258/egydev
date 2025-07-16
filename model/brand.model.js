const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  brandName: String,

  deleted: Boolean,

});

module.exports = mongoose.model('brand',brandSchema );
