const Subcategorie = require('../model/subcategorie.model');
const Categorie = require('../model/categorie.model');
const cache = require('../utils/cache.util');
const logger = require('../utils/logger.util');

exports.createSubcategorie = async (req, res) => {
  try {
    cache.del('subcategories');

    const { subcategorieName, categorieName } = req.body;

    const foundCategorie = await Categorie.findOne({ categorieName });

    if (!foundCategorie) {
      logger.warn(`Categorie not found with name: ${categorieName}`);
      return res.status(404).json({ message: 'Categorie not found by name' });
    }

    const newSubcategorie = await Subcategorie.create({
      subcategorieName,
      categorie: foundCategorie._id
    });

    logger.info(`Created new subcategorie: ${newSubcategorie.subcategorieName} (ID: ${newSubcategorie._id})`);
    res.status(201).json({ message: 'Subcategorie Created', data: newSubcategorie });
  } catch (err) {
    logger.error(`Create Subcategorie Error: ${err.message}, Data: ${JSON.stringify(req.body)}`);
    res.status(500).json({ message: 'Failed to create subcategorie', error: err.message });
  }
};


exports.getAllSubcategories = async (req, res) => {
  const cacheKey = 'subcategories';
  const cachedData = cache.get(cacheKey);

  if (cachedData) {
    logger.info('Returned cached subcategorie list');
    return res.status(200).json({ message: 'Cached subcategories', data: cachedData });
  }

  try {
    const subcategories = await Subcategorie.find()
    cache.set(cacheKey, subcategories);
    res.status(200).json({ message: 'List of subcategories', data: subcategories });
  } catch (err) {
    logger.error(`Fetch Subcategories Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve subcategories', error: err.message });
  }
};

exports.getSubcategorieById = async (req, res) => {
  try {
    const subcategorie = await Subcategorie.findById(req.params.id).populate('aubcategorie');

    if (!subcategorie) {
      logger.warn(`Subcategorie not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Subcategorie not found' });
    }

    res.status(200).json({ message: 'Subcategorie data', data: subcategorie });
  } catch (err) {
    logger.error(`Get Subcategorie Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve subcategorie', error: err.message });
  }
};

exports.updateSubcategorie = async (req, res) => {
  try {
    cache.del('subcategories');

    const updated = await Subcategorie.findByIdAndUpdate(req.params.id, req.body, {
      new: true
    });

    if (!updated) {
      logger.warn(`Subcategorie not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Subcategorie not found' });
    }

    logger.info(`Subcategorie updated: ${updated._id}`);
    res.status(200).json({ message: 'Subcategorie updated', data: updated });
  } catch (err) {
    logger.error(`Update Subcategorie Error: ${err.message}`);
    res.status(400).json({ message: 'Failed to update subcategorie', error: err.message });
  }
};

exports.deleteSubcategorie = async (req, res) => {
  try {
    cache.del('subcategories');

    const deleted = await Subcategorie.findByIdAndDelete(req.params.id);

    if (!deleted) {
      logger.warn(`Subcategorie not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Subcategorie not found' });
    }

    logger.info(`Subcategorie deleted: ${deleted._id}`);
    res.status(200).json({ message: 'Subcategorie deleted', data: deleted });
  } catch (err) {
    logger.error(`Delete Subcategorie Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to delete subcategorie', error: err.message });
  }
};
