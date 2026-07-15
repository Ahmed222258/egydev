const Product = require('../model/product.model');
const Brand = require('../model/brand.model');
const Subcategorie = require('../model/subcategorie.model');
const User = require('../model/user.model');
const logger = require('../utils/logger.util');
const mongoose = require('mongoose');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the standard populate chain used across multiple reads */
function buildPopulate(query) {
  return query
    .populate('brand', 'brandName logo')
    .populate('team', 'teamName logo country sport')
    .populate({
      path: 'subcategories',
      select: 'subcategorieName categorie',
      populate: { path: 'categorie', select: 'categorieName' },
    });
}

/** Calculate and update sale price, then check stock → status */
function computeSaleFields(body) {
  const updates = {};

  if (body.isOnSale !== undefined || body.originalPrice !== undefined || body.discountPercentage !== undefined) {
    updates['sale.isOnSale'] = body.isOnSale === true || body.isOnSale === 'true';
    if (body.originalPrice !== undefined) updates['sale.originalPrice'] = parseFloat(body.originalPrice);
    if (body.discountPercentage !== undefined) {
      const disc = Math.max(0, Math.min(100, parseFloat(body.discountPercentage)));
      updates['sale.discountPercentage'] = disc;
      if (body.originalPrice !== undefined) {
        updates['sale.salePrice'] = parseFloat(body.originalPrice) * (1 - disc / 100);
      }
    }
    if (body.saleStartDate) updates['sale.saleStartDate'] = new Date(body.saleStartDate);
    if (body.saleEndDate) updates['sale.saleEndDate'] = new Date(body.saleEndDate);
  }

  return updates;
}

// ── Create Product ────────────────────────────────────────────────────────────
exports.createProduct = async (req, res) => {
  try {
    const {
      productName, description, price, type, team, brand,
      status, tags, isOnSale, originalPrice, discountPercentage,
      saleStartDate, saleEndDate,
    } = req.body;

    if (!productName || !price) {
      return res.status(400).json({ message: 'productName and price are required' });
    }

    // Parse subcategories
    let subcategories = req.body['subcategories[]'] || req.body.subcategories || [];
    if (!Array.isArray(subcategories)) subcategories = [subcategories];
    for (const id of subcategories) {
      if (id && !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: `Invalid subcategory ID: ${id}` });
      }
    }

    if (brand && !mongoose.Types.ObjectId.isValid(brand)) {
      return res.status(400).json({ message: 'Invalid brand ID' });
    }
    if (team && !mongoose.Types.ObjectId.isValid(team)) {
      return res.status(400).json({ message: 'Invalid team ID' });
    }

    // Parse variants
    let variants = req.body.variants || [];
    if (typeof variants === 'string') {
      try { variants = JSON.parse(variants); } catch { variants = []; }
    }

    // Parse tags
    let parsedTags = tags || [];
    if (typeof parsedTags === 'string') {
      try { parsedTags = JSON.parse(parsedTags); } catch { parsedTags = [parsedTags]; }
    }

    // Images: multi-upload (files) + imageUrl legacy
    const images = req.files ? req.files.map((f) => f.filename) : [];
    const imageUrl = images[0] || req.body.imageUrl || '';

    // Inventory
    const currentStock = parseInt(req.body.currentStock) || 0;
    const inventory = {
      currentStock,
      reservedStock: parseInt(req.body.reservedStock) || 0,
      soldQuantity: 0,
      minStockAlert: parseInt(req.body.minStockAlert) || 5,
      maxStock: parseInt(req.body.maxStock) || 100,
    };

    // Auto sale price
    let saleData = {};
    if (isOnSale === true || isOnSale === 'true') {
      const orig = parseFloat(originalPrice) || parseFloat(price);
      const disc = Math.max(0, Math.min(100, parseFloat(discountPercentage) || 0));
      saleData = {
        isOnSale: true,
        originalPrice: orig,
        discountPercentage: disc,
        salePrice: Math.round(orig * (1 - disc / 100) * 100) / 100,
        saleStartDate: saleStartDate ? new Date(saleStartDate) : undefined,
        saleEndDate: saleEndDate ? new Date(saleEndDate) : undefined,
      };
    }

    // Determine initial status based on stock
    let resolvedStatus = status || 'Available';
    if (currentStock === 0 && !status) resolvedStatus = 'Sold Out';

    const product = new Product({
      productName: productName.trim(),
      description: description?.trim() || '',
      price: parseFloat(price),
      type: type || undefined,
      team: team || undefined,
      brand: brand || undefined,
      subcategories: subcategories.filter(Boolean),
      status: resolvedStatus,
      tags: parsedTags,
      variants,
      images,
      imageUrl,
      inventory,
      sale: saleData,
    });

    await product.save();
    logger.info(`Product created: ${product._id} - ${product.productName}`);
    res.status(201).json({ message: 'Product created', data: product });
  } catch (err) {
    logger.error(`Create Product Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to create product', error: err.message });
  }
};

// ── Get All Products (with advanced filtering + pagination) ───────────────────
exports.getAllProducts = async (req, res) => {
  try {
    const {
      search, team, type, brand, category, status,
      minPrice, maxPrice, size, color, tags,
      page = 1, limit = 20, sort = 'createdAt',
      isOnSale, showDeleted,
    } = req.query;

    const filter = {};

    // Soft delete — admins can pass showDeleted=true
    if (showDeleted !== 'true') filter.isDeleted = false;

    // Text search
    if (search) filter.$text = { $search: search };

    // Enum filters
    if (team && mongoose.Types.ObjectId.isValid(team)) filter.team = team;
    if (type) filter.type = type;
    if (brand && mongoose.Types.ObjectId.isValid(brand)) filter.brand = brand;
    if (status) filter.status = status;
    if (isOnSale === 'true') filter['sale.isOnSale'] = true;

    // Category → resolve via subcategories
    if (category && mongoose.Types.ObjectId.isValid(category)) {
      const Subcategorie = require('../model/subcategorie.model');
      const subcats = await Subcategorie.find({ categorie: category }).select('_id');
      filter.subcategories = { $in: subcats.map((s) => s._id) };
    }

    // Price range
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Variant filters
    if (size) filter['variants.size'] = size;
    if (color) filter['variants.color'] = { $regex: color, $options: 'i' };

    // Tags
    if (tags) {
      const tagList = Array.isArray(tags) ? tags : [tags];
      filter.tags = { $in: tagList };
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sortMap = {
      createdAt: { createdAt: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      popular: { 'analytics.purchases': -1 },
      rating: { 'analytics.rating': -1 },
      views: { 'analytics.views': -1 },
      name: { productName: 1 },
    };
    const sortObj = sortMap[sort] || { createdAt: -1 };

    const [products, total] = await Promise.all([
      buildPopulate(Product.find(filter)).sort(sortObj).skip(skip).limit(limitNum),
      Product.countDocuments(filter),
    ]);

    res.status(200).json({
      message: 'List of products',
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: products,
    });
  } catch (err) {
    logger.error(`Fetch Products Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve products', error: err.message });
  }
};

// ── Get Product By ID ─────────────────────────────────────────────────────────
exports.getProductById = async (req, res) => {
  try {
    const product = await buildPopulate(Product.findById(req.params.id));

    if (!product || product.isDeleted) {
      logger.warn(`Product not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Product not found' });
    }

    // Increment view count
    await Product.findByIdAndUpdate(req.params.id, {
      $inc: { 'analytics.views': 1 },
    });

    // Track in recently viewed (if authenticated)
    if (req.user) {
      await User.findByIdAndUpdate(req.user.id, {
        $pull: { recentlyViewed: product._id },
      });
      await User.findByIdAndUpdate(req.user.id, {
        $push: { recentlyViewed: { $each: [product._id], $position: 0, $slice: 20 } },
      });
    }

    res.status(200).json({ message: 'Product data', data: product });
  } catch (err) {
    logger.error(`Get Product Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve product', error: err.message });
  }
};

// ── Update Product ────────────────────────────────────────────────────────────
exports.updateProduct = async (req, res) => {
  try {
    const { brand, subcategories, team, type, status, tags, variants, ...rest } = req.body;

    // Validate refs
    if (brand) {
      if (!mongoose.Types.ObjectId.isValid(brand)) {
        return res.status(400).json({ message: 'Invalid brand ID' });
      }
      const brandExists = await Brand.findById(brand);
      if (!brandExists) return res.status(400).json({ message: 'Brand not found' });
    }

    if (team && !mongoose.Types.ObjectId.isValid(team)) {
      return res.status(400).json({ message: 'Invalid team ID' });
    }

    // Build update object
    const updateData = { ...rest };
    if (brand) updateData.brand = brand;
    if (team) updateData.team = team;
    if (type) updateData.type = type;
    if (status) updateData.status = status;

    // Tags
    if (tags !== undefined) {
      let parsedTags = tags;
      if (typeof parsedTags === 'string') {
        try { parsedTags = JSON.parse(parsedTags); } catch { parsedTags = [parsedTags]; }
      }
      updateData.tags = parsedTags;
    }

    // Variants
    if (variants !== undefined) {
      let parsedVariants = variants;
      if (typeof parsedVariants === 'string') {
        try { parsedVariants = JSON.parse(parsedVariants); } catch { parsedVariants = []; }
      }
      updateData.variants = parsedVariants;
    }

    // Subcategories
    if (subcategories && Array.isArray(subcategories)) {
      for (const id of subcategories) {
        const exists = await Subcategorie.findById(id);
        if (!exists) return res.status(400).json({ message: `Invalid subcategory ID: ${id}` });
      }
      updateData.subcategories = subcategories;
    }

    // Images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((f) => f.filename);
      updateData.images = newImages;
      updateData.imageUrl = newImages[0];
    } else if (req.file) {
      updateData.imageUrl = req.file.filename;
      updateData.$push = { images: req.file.filename };
    }

    // Sale fields
    const saleUpdates = computeSaleFields(req.body);
    Object.assign(updateData, saleUpdates);

    // Inventory fields
    if (rest.currentStock !== undefined) updateData['inventory.currentStock'] = parseInt(rest.currentStock);
    if (rest.reservedStock !== undefined) updateData['inventory.reservedStock'] = parseInt(rest.reservedStock);
    if (rest.minStockAlert !== undefined) updateData['inventory.minStockAlert'] = parseInt(rest.minStockAlert);
    if (rest.maxStock !== undefined) updateData['inventory.maxStock'] = parseInt(rest.maxStock);

    // Sync status to Sold Out if stock hits 0
    const newStock = parseInt(rest.currentStock);
    if (!isNaN(newStock) && newStock === 0 && !status) {
      updateData.status = 'Sold Out';
    }

    const updatedProduct = await buildPopulate(
      Product.findByIdAndUpdate(req.params.id, updateData, { new: true })
    );

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

// ── Duplicate Product ─────────────────────────────────────────────────────────
exports.duplicateProduct = async (req, res) => {
  try {
    const original = await Product.findById(req.params.id);
    if (!original || original.isDeleted) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const copy = original.toObject();
    delete copy._id;
    delete copy.createdAt;
    delete copy.updatedAt;
    copy.productName = `${copy.productName} (Copy)`;
    copy.analytics = { views: 0, purchases: 0, wishlistCount: 0, cartCount: 0, rating: 0, reviewCount: 0 };
    copy.inventory = { ...copy.inventory, soldQuantity: 0, reservedStock: 0 };
    copy.isDeleted = false;

    const newProduct = await Product.create(copy);
    logger.info(`Product duplicated: ${original._id} → ${newProduct._id}`);
    res.status(201).json({ message: 'Product duplicated', data: newProduct });
  } catch (err) {
    logger.error(`Duplicate Product Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to duplicate product', error: err.message });
  }
};

// ── Get Related Products ──────────────────────────────────────────────────────
exports.getRelatedProducts = async (req, res) => {
  try {
    const current = await Product.findById(req.params.id);
    if (!current) return res.status(404).json({ message: 'Product not found' });

    const related = await buildPopulate(
      Product.find({
        _id: { $ne: req.params.id },
        isDeleted: false,
        $or: [
          { subcategories: { $in: current.subcategories } },
          { team: current.team },
          { type: current.type },
        ],
      }).limit(10)
    );

    res.status(200).json({ message: 'Related products', data: related });
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve related products', error: err.message });
  }
};

// ── Get Recently Viewed ───────────────────────────────────────────────────────
exports.getRecentlyViewed = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'recentlyViewed',
      match: { isDeleted: false },
      select: 'productName price status imageUrl images type analytics.rating team',
      populate: { path: 'team', select: 'teamName' },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({ message: 'Recently viewed products', data: user.recentlyViewed });
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve recently viewed', error: err.message });
  }
};

// ── Soft Delete / Restore Product ─────────────────────────────────────────────
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      logger.warn(`Product not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Product not found' });
    }

    product.isDeleted = !product.isDeleted;
    product.deleted = product.isDeleted; // keep legacy field in sync
    await product.save();

    const action = product.isDeleted ? 'deleted' : 'restored';
    logger.info(`Product ${action}: ${product._id}`);
    res.status(200).json({ message: `Product ${action}`, data: product });
  } catch (err) {
    logger.error(`Toggle Delete Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to toggle product delete state', error: err.message });
  }
};

// ── Add Images (append without replacing existing) ────────────────────────────
// POST /:id/images  (multipart: field name "images", up to 10 files)
exports.addImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No image files uploaded' });
    }

    const product = await Product.findById(req.params.id);
    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const newFilenames = req.files.map((f) => f.filename);
    product.images.push(...newFilenames);
    if (!product.imageUrl) product.imageUrl = newFilenames[0];

    await product.save();
    logger.info(`Images added to product ${product._id}: ${newFilenames.join(', ')}`);
    res.status(200).json({
      message: `${newFilenames.length} image(s) added`,
      images: product.images,
      imageUrl: product.imageUrl,
    });
  } catch (err) {
    logger.error(`Add Images Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to add images', error: err.message });
  }
};

// ── Remove a Single Image ─────────────────────────────────────────────────────
// DELETE /:id/images/:filename
exports.removeImage = async (req, res) => {
  try {
    const { filename } = req.params;

    const product = await Product.findById(req.params.id);
    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const before = product.images.length;
    product.images = product.images.filter((img) => img !== filename);

    if (product.images.length === before) {
      return res.status(404).json({ message: 'Image not found on this product' });
    }

    // Keep imageUrl in sync — use the first remaining image
    if (product.imageUrl === filename) {
      product.imageUrl = product.images[0] || '';
    }

    await product.save();
    logger.info(`Image removed from product ${product._id}: ${filename}`);
    res.status(200).json({
      message: 'Image removed',
      images: product.images,
      imageUrl: product.imageUrl,
    });
  } catch (err) {
    logger.error(`Remove Image Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to remove image', error: err.message });
  }
};

// ── Get Variants ──────────────────────────────────────────────────────────────
// GET /:id/variants
exports.getVariants = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select('variants productName');
    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Build colour/size summary maps for quick front-end use
    const colours = [...new Set(product.variants.map((v) => v.color).filter(Boolean))];
    const sizes = [...new Set(product.variants.map((v) => v.size).filter(Boolean))];

    res.status(200).json({
      message: 'Variants',
      productName: product.productName,
      variants: product.variants,
      availableColors: colours,
      availableSizes: sizes,
    });
  } catch (err) {
    logger.error(`Get Variants Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve variants', error: err.message });
  }
};

// ── Manage Variants (replace full variants array) ─────────────────────────────
// PUT /:id/variants
// Body: { variants: [ { size, color, stock, sku } ] }
exports.manageVariants = async (req, res) => {
  try {
    let { variants } = req.body;

    if (!variants) {
      return res.status(400).json({ message: 'variants array is required' });
    }

    if (typeof variants === 'string') {
      try { variants = JSON.parse(variants); } catch {
        return res.status(400).json({ message: 'variants must be a valid JSON array' });
      }
    }

    if (!Array.isArray(variants)) {
      return res.status(400).json({ message: 'variants must be an array' });
    }

    const validSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'One Size'];
    for (const v of variants) {
      if (v.size && !validSizes.includes(v.size)) {
        return res.status(400).json({ message: `Invalid size "${v.size}". Must be one of: ${validSizes.join(', ')}` });
      }
      if (v.stock !== undefined && (isNaN(v.stock) || v.stock < 0)) {
        return res.status(400).json({ message: 'stock must be a non-negative number' });
      }
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { variants },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Derive summary
    const colours = [...new Set(product.variants.map((v) => v.color).filter(Boolean))];
    const sizes = [...new Set(product.variants.map((v) => v.size).filter(Boolean))];

    logger.info(`Variants updated for product ${product._id}`);
    res.status(200).json({
      message: 'Variants updated',
      variants: product.variants,
      availableColors: colours,
      availableSizes: sizes,
    });
  } catch (err) {
    logger.error(`Manage Variants Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to update variants', error: err.message });
  }
};
