const express = require('express');
const router = express.Router();
const subcategorieController = require('../controller/subcategorie.controller');

router.post('/', subcategorieController.createSubcategorie);

router.get('/', subcategorieController.getAllSubcategories);


router.get('/:id', subcategorieController.getSubcategorieById);

router.put('/:id', subcategorieController.updateSubcategorie);


router.delete('/:id', subcategorieController.deleteSubcategorie);

module.exports = router;
