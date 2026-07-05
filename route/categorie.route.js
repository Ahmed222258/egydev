const express = require('express');
const router = express.Router();
const categorieController = require('../controller/categorie.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');

// Public — anyone can read categories
router.get('/', categorieController.getAllCategories);
router.get('/:id', categorieController.getCategorieById);

// Protected — admin/manager only for writes (Fix #3)
router.post('/', authenticate, authorize('admin', 'manager'), categorieController.createCategorie);
router.put('/:id', authenticate, authorize('admin', 'manager'), categorieController.updateCategorie);
router.delete('/:id', authenticate, authorize('admin', 'manager'), categorieController.deleteCategorie);

module.exports = router;
