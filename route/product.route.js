const express = require('express');
const router = express.Router();
const productController = require('../controller/product.controller');
const { upload } = require('../middleware/upload.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validateProduct } = require('../middleware/validate.middleware');

// ── Public routes ─────────────────────────────────────────────────────────────
router.get('/', productController.getAllProducts);
router.get('/related/:id', productController.getRelatedProducts);
router.get('/:id', productController.getProductById);
router.get('/:id/variants', productController.getVariants);

// ── Protected routes (admin / manager) ───────────────────────────────────────
router.post(
  '/',
  authenticate,
  authorize('admin', 'manager'),
  upload.array('images', 10),
  validateProduct(true),
  productController.createProduct
);

router.put(
  '/:id',
  authenticate,
  authorize('admin', 'manager'),
  upload.array('images', 10),
  validateProduct(false),
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

// ── Image management ──────────────────────────────────────────────────────────
// Append images without replacing existing ones
router.post(
  '/:id/images',
  authenticate,
  authorize('admin', 'manager'),
  upload.array('images', 10),
  productController.addImages
);

// Remove a single image by filename
router.delete(
  '/:id/images/:filename',
  authenticate,
  authorize('admin', 'manager'),
  productController.removeImage
);

// ── Variant management ────────────────────────────────────────────────────────
// Replace the full variants array (size × color × stock)
router.put(
  '/:id/variants',
  authenticate,
  authorize('admin', 'manager'),
  productController.manageVariants
);

// ── Authenticated: recently viewed ───────────────────────────────────────────
router.get('/user/recently-viewed', authenticate, productController.getRecentlyViewed);

module.exports = router;
