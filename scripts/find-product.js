const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Product = require('../model/product.model');
  const p = await Product.findOne({ isDeleted: { $ne: true } }).select('_id productName price inventory');
  if (p) console.log(JSON.stringify(p));
  else console.log('NO_PRODUCT');
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
