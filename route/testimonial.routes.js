const express = require('express');
const router = express.Router();
const testimonialController = require('../controller/testmonial.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');

router.get('/testimonials', testimonialController.getAcceptedTestimonials);

router.post('/testimonials', authenticate, testimonialController.createTestimonial);

// Protect list all testimonials and accept testimonial routes for admin/manager
router.get('/testimonials/all', authenticate, authorize('admin', 'manager'), testimonialController.getAllTestimonials);

router.put('/testimonials/:id/accept', authenticate, authorize('admin', 'manager'), testimonialController.acceptTestimonial);

module.exports = router;
