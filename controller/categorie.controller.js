const Categorie = require('../model/categorie.model');
const cache = require('../utils/cache.util');
const logger = require('../utils/logger.util');

exports.createCategorie = async (req, res) => {
  try {
    cache.del('categories');

    const { categorieName } = req.body;
        const exists = await Categorie.findOne({ categorieName });
    if (exists) {
      return res.status(409).json({ message: 'Categorie  already exists' });
    }
    const newCategorie = await Categorie.create({ categorieName });

    logger.info(`Created new categorie: ${newCategorie.categorieName} (ID: ${newCategorie._id})`);
    res.status(201).json({ message: 'Categorie Created', data: newCategorie });
  } catch (err) {
    logger.error(`Create Categorie Error: ${err.message}, Data: ${JSON.stringify(req.body)}`);
    res.status(500).json({ message: 'Failed to create categorie', error: err.message });
  }
};

exports.getAllCategories = async (req, res) => {
  const cacheKey = 'categories';
  const cachedData = cache.get(cacheKey);

  if (cachedData) {
    logger.info('Returned cached categorie list');
    return res.status(200).json({ message: 'Cached categories', data: cachedData });
  }

  try {
    const categories = await Categorie.find();
    cache.set(cacheKey, categories);
    res.status(200).json({ message: 'List of categories', data: categories });
  } catch (err) {
    logger.error(`Fetch Categories Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve categories', error: err.message });
  }
};

exports.getCategorieById = async (req, res) => {
  try {
    const categorie = await Categorie.findById(req.params.id);

    if (!categorie) {
      logger.warn(`Categorie not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Categorie not found' });
    }

    res.status(200).json({ message: 'Categorie data', data: categorie });
  } catch (err) {
    logger.error(`Get Categorie Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve categorie', error: err.message });
  }
};

exports.updateCategorie = async (req, res) => {
  try {
    cache.del('categories');

    const updated = await Categorie.findByIdAndUpdate(req.params.id, req.body, {
      new: true
    });

    if (!updated) {
      logger.warn(`Categorie not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Categorie not found' });
    }

    logger.info(`Categorie updated: ${updated._id}`);
    res.status(200).json({ message: 'Categorie updated', data: updated });
  } catch (err) {
    logger.error(`Update Categorie Error: ${err.message}`);
    res.status(400).json({ message: 'Failed to update categorie', error: err.message });
  }
};


exports.deleteCategorie = async (req, res) => {
  try {
    cache.del('categories');

    const categorie = await Categorie.findById(req.params.id);

    if (!categorie) {
      logger.warn(`Categorie not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Categorie not found' });
    }

    categorie.deleted = !categorie.deleted;
    await categorie.save();

    logger.info(`Categorie ${categorie.deleted ? 'deleted' : 'restored'}: ${categorie._id}`);
    res.status(200).json({
      message: `Categorie ${categorie.deleted ? 'marked as deleted' : 'restored'}`,
      data: categorie
    });
  } catch (err) {
    logger.error(`Delete Categorie Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to delete categorie', error: err.message });
  }
};
