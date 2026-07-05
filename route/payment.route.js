const express = require('express');
const router = express.Router();
const paymentController = require('../controller/payment.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { verifyPaymob } = require('../middleware/verifyPaymob.middleware');

// POST /api/payment/create
// Authenticated user creates a Paymob checkout session for a pending order
router.post('/create', authenticate, paymentController.createPayment);

// POST /api/payment/webhook
// Called by Paymob server after a transaction — HMAC signature verified first
router.post('/webhook', verifyPaymob, paymentController.handleWebhook);

// GET /api/payment/callback
// Paymob redirects the customer's browser here after payment completion
router.get('/callback', paymentController.handleCallback);

module.exports = router;
