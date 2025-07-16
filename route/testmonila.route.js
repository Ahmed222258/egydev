const express = require('express');
const router = express.Router();
const testimonialController = require('../controller/testmonial.controller');
const { authenticate } = require('../middleware/auth.middleware'); 

router.get('/testimonials', testimonialController.getAcceptedTestimonials);

router.post('/testimonials', authenticate, testimonialController.createTestimonial);

router.get('/testimonials/all', authenticate, testimonialController.getAllTestimonials);

router.put('/testimonials/:id/accept', authenticate, testimonialController.acceptTestimonial);

module.exports = router;
