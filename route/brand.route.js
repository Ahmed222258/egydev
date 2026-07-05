const express = require('express');
const router = express.Router();
const brandController = require('../controller/brand.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');

// Public — reads
router.get('/', brandController.getAllBrands);
router.get('/:id', brandController.getBrandById);

// Protected — admin/manager only for writes (Fix #3)
router.post('/', authenticate, authorize('admin', 'manager'), brandController.createBrand);
router.put('/:id', authenticate, authorize('admin', 'manager'), brandController.updateBrand);
router.delete('/:id', authenticate, authorize('admin', 'manager'), brandController.deleteBrand);

module.exports = router;
