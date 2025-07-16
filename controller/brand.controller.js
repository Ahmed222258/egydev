const Brand = require('../model/brand.model');
const cache = require('../utils/cache.util');
const logger = require('../utils/logger.util');

exports.createBrand = async (req, res) => {
  try {
    cache.del('brands');

    const { brandName } = req.body;
    const exists = await Brand.findOne({ brandName });
if (exists) {
  return res.status(409).json({ message: 'Brand name already exists' });
}

    const newBrand = await Brand.create({ brandName });

    logger.info(`Admin created new brand: ${newBrand.brandName} (ID: ${newBrand._id})`);
    res.status(201).json({ message: 'Brand Created', data: newBrand });
  } catch (err) {
    logger.error(`Create Brand Error: ${err.message}, Data: ${JSON.stringify(req.body)}`);
    res.status(500).json({ message: 'Failed to create brand', error: err.message });
  }
};

exports.getAllBrands = async (req, res) => {
  const cacheKey = 'brands';
  const cachedData = cache.get(cacheKey);

  if (cachedData) {
    logger.info('Returned cached brand list');
    return res.status(200).json({ message: 'Cached brands', data: cachedData });
  }

  try {
    const brands = await Brand.find();
    cache.set(cacheKey, brands);
    res.status(200).json({ message: 'List of brands', data: brands });
  } catch (err) {
    logger.error(`Fetch Brands Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve brands', error: err.message });
  }
};

exports.updateBrand = async (req, res) => {
  try {
    cache.del('brands');

    const updatedBrand = await Brand.findByIdAndUpdate(req.params.id, req.body, { new: true });

    if (!updatedBrand) {
      logger.warn(`Brand not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Brand not found' });
    }

    logger.info(`Brand updated: ${updatedBrand._id}`);
    res.status(200).json({ message: 'Brand updated', data: updatedBrand });
  } catch (err) {
    logger.error(`Update Brand Error: ${err.message}`);
    res.status(400).json({ message: 'Failed to update brand', error: err.message });
  }
};

exports.getBrandById = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);

    if (!brand) {
      logger.warn(`Brand not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Brand not found' });
    }

    res.status(200).json({ message: 'Brand data', data: brand });
  } catch (err) {
    logger.error(`Get Brand Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve brand', error: err.message });
  }
};




exports.deleteBrand = async (req, res) => {
  try {
    cache.del('brands');

    const brand = await Brand.findById(req.params.id);

    if (!brand) {
      logger.warn(`Brand not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Brand not found' });
    }

    brand.deleted = !brand.deleted;
    await brand.save();

    logger.info(`Brand ${brand.deleted ? 'deleted' : 'restored'}: ${brand._id}`);
    res.status(200).json({
      message: `Brand ${brand.deleted ? 'marked as deleted' : 'restored'}`,
      data: brand
    });
  } catch (err) {
    logger.error(`Toggle Delete Brand Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to toggle brand delete state', error: err.message });
  }
};
