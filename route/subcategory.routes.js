const express = require('express');
const router = express.Router();
const subcategorieController = require('../controller/subcategorie.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');

// Public — reads
router.get('/', subcategorieController.getAllSubcategories);
router.get('/:id', subcategorieController.getSubcategorieById);

// Protected — admin/manager only for writes (Fix #3)
router.post('/', authenticate, authorize('admin', 'manager'), subcategorieController.createSubcategorie);
router.put('/:id', authenticate, authorize('admin', 'manager'), subcategorieController.updateSubcategorie);
router.delete('/:id', authenticate, authorize('admin', 'manager'), subcategorieController.deleteSubcategorie);

module.exports = router;
