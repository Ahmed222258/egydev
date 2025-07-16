


const Product = require('../model/product.model');
const Brand = require('../model/brand.model');
const Subcategorie = require('../model/subcategorie.model');
const Categorie = require('../model/categorie.model'); 
const cache = require('../utils/cache.util');
const logger = require('../utils/logger.util');




const mongoose = require('mongoose');






exports.createProduct = async (req, res) => {
  try {
    const {
      productName,
      description,
      price,
      stock,
      brand,
     deleted
    } = req.body;

    let subcategories = req.body['subcategories[]'] || req.body.subcategories || [];

    if (!Array.isArray(subcategories)) {
      subcategories = [subcategories];
    }

    for (let id of subcategories) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: `Invalid subcategory ID: ${id}` });
      }
    }

    if (!mongoose.Types.ObjectId.isValid(brand)) {
      return res.status(400).json({ message: 'Invalid brand ID' });
    }

    const newProduct = new Product({
      productName,
      description,
      price: parseFloat(price),
      stock: parseInt(stock),
      brand,
      subcategories,
      deleted,
      imageUrl: req.file?.filename || '' 
    });

    await newProduct.save();

    res.status(201).json({ message: 'Product created', data: newProduct });
  } catch (err) {
    console.error('Error in createProduct:', err);
    res.status(500).json({ message: 'Failed to create product', error: err.message });
  }
};



exports.getAllProducts = async (req, res) => {
  const cacheKey = 'products';

  try {
    const products = await Product.find()
      .populate('brand', 'brandName')
      .populate({
        path: 'subcategories',
        select: 'subcategorieName categorie',
        populate: {
          path: 'categorie',
          select: 'categorieName'
        }
      });


    res.status(200).json({ message: 'List of products', data: products });
  } catch (err) {
    logger.error(`Fetch Products Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve products', error: err.message });
  }
};


exports.updateProduct = async (req, res) => {
  try {
    cache.del('products');
    const { brand, subcategories, ...updateData } = req.body; 

    if (brand) {
      const brandExists = await Brand.findById(brand);
      if (!brandExists) {
        return res.status(400).json({ message: 'Invalid brand ID' });
      }
    }
    if (req.file) {
  updateData.imageUrl = req.file.filename;
}


    if (subcategories && Array.isArray(subcategories)) {
      for (const subcatId of subcategories) {
        const exists = await Subcategorie.findById(subcatId);
        if (!exists) {
          return res.status(400).json({ message: `Invalid subcategorie ID: ${subcatId}` });
        }
      }
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { ...updateData, brand, subcategories }, 
      { new: true }
    )
      .populate('brand', 'brandName')
      .populate({
        path: 'subcategories',
        select: 'subcategorieName categorie',
        populate: {
          path: 'categorie',
          select: 'categorieName'
        }
      });


    if (!updatedProduct) {
      logger.warn(`Product not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Product not found' });
    }

    logger.info(`Product updated: ${updatedProduct._id}`);
    res.status(200).json({ message: 'Product updated', data: updatedProduct });
  } catch (err) {
    logger.error(`Update Product Error: ${err.message}`);
    res.status(400).json({ message: 'Failed to update product', error: err.message });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('brand', 'brandName') 
      .populate({
        path: 'subcategories',
        select: 'subcategorieName categorie', 
        populate: {
          path: 'categorie',
          select: 'categorieName' 
        }
      });

    if (!product) {
      logger.warn(`Product not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json({ message: 'Product data', data: product });
  } catch (err) {
    logger.error(`Get Product Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve product', error: err.message });
  }
};



exports.getRelatedProducts = async (req, res) => {
  try {
    const currentProduct = await Product.findById(req.params.id);
    if (!currentProduct) {
      return res.status(404).json({ message: 'Current product not found' });
    }

    const related = await Product.find({
      _id: { $ne: req.params.id },
      'subcategories': { $in: currentProduct.subcategories },
      deleted: { $ne: true }  
    })
    .populate('brand', 'brandName')
    .populate({
      path: 'subcategories',
      select: 'subcategorieName categorie',
      populate: {
        path: 'categorie',
        select: 'categorieName'
      }
    });

    res.status(200).json({ message: 'Related products retrieved', data: related });
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve related products', error: err.message });
  }
};



exports.deleteProduct = async (req, res) => {
  try {
    cache.del('products');

    const product = await Product.findById(req.params.id);

    if (!product) {
      logger.warn(`Product not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Product not found' });
    }

    product.deleted = !product.deleted;
    await product.save();

    logger.info(`Product ${product.deleted ? 'deleted' : 'restored'}: ${product._id}`);
    res.status(200).json({
      message: `Product ${product.deleted ? 'marked as deleted' : 'restored'}`,
      data: product
    });
  } catch (err) {
    logger.error(`Toggle Delete Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to toggle product delete state', error: err.message });
  }
};
