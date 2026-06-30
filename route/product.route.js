const express = require('express');
const router = express.Router();
const productController = require('../controller/product.controller');
const { upload } = require('../middleware/upload.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');

// ── Public routes ─────────────────────────────────────────────────────────────
router.get('/', productController.getAllProducts);
router.get('/related/:id', productController.getRelatedProducts);
router.get('/:id', productController.getProductById);

// ── Protected routes (admin / manager) ───────────────────────────────────────
router.post(
  '/',
  authenticate,
  authorize('admin', 'manager'),
  upload.array('images', 10),
  productController.createProduct
);

router.put(
  '/:id',
  authenticate,
  authorize('admin', 'manager'),
  upload.array('images', 10),
  productController.updateProduct
);

router.post(
  '/:id/duplicate',
  authenticate,
  authorize('admin', 'manager'),
  productController.duplicateProduct
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  productController.deleteProduct
);

// ── Authenticated: recently viewed ───────────────────────────────────────────
router.get('/user/recently-viewed', authenticate, productController.getRecentlyViewed);

module.exports = router;
