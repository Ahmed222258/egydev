const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const paymentController = require('../controller/payment.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { verifyPaymob } = require('../middleware/verifyPaymob.middleware');

// Rate limiter for payment creation and retries (max 20 requests per 15 minutes)
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many payment attempts from this IP, please try again later.' }
});

// POST /api/payment/create
// Authenticated user creates a Paymob checkout session for a pending order
router.post('/create', authenticate, paymentLimiter, paymentController.createPayment);

// POST /api/payment/webhook
// Called by Paymob server after a transaction — HMAC signature verified first
router.post('/webhook', verifyPaymob, paymentController.handleWebhook);

// GET /api/payment/callback
// Paymob redirects the customer's browser here after payment completion
router.get('/callback', paymentController.handleCallback);

// GET /api/payment/status/:orderId
// Authenticated user queries status of payment for orderId
router.get('/status/:orderId', authenticate, paymentController.getPaymentStatus);

// POST /api/payment/retry/:orderId
// Authenticated user retries payment for failed/cancelled orderId
router.post('/retry/:orderId', authenticate, paymentLimiter, paymentController.retryPayment);

module.exports = router;
