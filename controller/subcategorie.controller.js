const Subcategorie = require('../model/subcategorie.model');
const Categorie = require('../model/categorie.model');
const cache = require('../utils/cache.util');
const logger = require('../utils/logger.util');

exports.createSubcategorie = async (req, res) => {
  try {
    cache.del('subcategories');

    const { subcategorieName, categorieName } = req.body;

    const foundCategorie = await Categorie.findOne({ categorieName, isDeleted: { $ne: true }, deleted: { $ne: true } });

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
    // Only return subcategories that are not soft-deleted
    const subcategories = await Subcategorie.find({ isDeleted: { $ne: true }, deleted: { $ne: true } }).populate('categorie');
    cache.set(cacheKey, subcategories);
    res.status(200).json({ message: 'List of subcategories', data: subcategories });
  } catch (err) {
    logger.error(`Fetch Subcategories Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve subcategories', error: err.message });
  }
};

exports.getSubcategorieById = async (req, res) => {
  try {
    // FIX #14: Populate 'categorie' instead of the non-existent 'aubcategorie' field
    const subcategorie = await Subcategorie.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true },
      deleted: { $ne: true }
    }).populate('categorie');

    if (!subcategorie) {
      logger.warn(`Subcategorie not found or deleted: ${req.params.id}`);
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

    // Only update if not soft-deleted
    const updated = await Subcategorie.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true }, deleted: { $ne: true } },
      req.body,
      { new: true }
    );

    if (!updated) {
      logger.warn(`Subcategorie not found or deleted: ${req.params.id}`);
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

    // FIX #17: Inconsistent soft-delete. Toggle soft-delete like other controllers.
    const subcategorie = await Subcategorie.findById(req.params.id);

    if (!subcategorie) {
      logger.warn(`Subcategorie not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Subcategorie not found' });
    }

    subcategorie.deleted = !subcategorie.deleted;
    subcategorie.isDeleted = subcategorie.deleted;
    await subcategorie.save();

    logger.info(`Subcategorie ${subcategorie.deleted ? 'deleted' : 'restored'}: ${subcategorie._id}`);
    res.status(200).json({
      message: `Subcategorie ${subcategorie.deleted ? 'marked as deleted' : 'restored'}`,
      data: subcategorie
    });
  } catch (err) {
    logger.error(`Delete Subcategorie Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to delete subcategorie', error: err.message });
  }
};
