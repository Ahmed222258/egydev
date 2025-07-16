
const express = require('express');
const router = express.Router();
const productController = require('../controller/product.controller');
const { upload } = require('../middleware/upload.middleware'); 

router.post('/', upload.single('image'), productController.createProduct);

router.get('/', productController.getAllProducts);

router.get('/:id', productController.getProductById);

router.put('/:id', upload.single('image'), productController.updateProduct);

router.get('/related/:id', productController.getRelatedProducts);

router.delete('/:id', productController.deleteProduct);

module.exports = router;
