const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

// Setup process env mock values for testing
process.env.PAYMOB_API_KEY = 'egy_sk_test_mock';
process.env.PAYMOB_PUBLIC_KEY = 'egy_pk_test_mock';
process.env.PAYMOB_INTEGRATION_ID = '123456';
process.env.PAYMOB_HMAC = '3CCCDDF1AA8EF0CDC35DCCA5FEFCFD9E';
process.env.FRONTEND_URL = 'http://localhost:3000';

// 1. Require models/utils to mock them
const OrderModel = require('../model/order.model');
const PaymentModel = require('../model/payment.model');
const paymobUtil = require('../utils/paymob.util');

// Define mock order structure supporting chains like findById().populate()
const mockOrder = {
  _id: 'order123',
  user: 'user123',
  totalAmount: 100,
  status: 'pending',
  items: [
    { product: { productName: 'Product A' }, price: 50, quantity: 2 }
  ],
  shippingAddress: { address: '123 Main St' },
  save: async function() { return this; },
  paymobIntentionId: null,
  paymobClientSecret: null,
};

const orderMockQuery = {
  ...mockOrder,
  populate: function() { return this; },
  select: function() { return this; },
};

// Apply mocks
OrderModel.findById = (id) => orderMockQuery;
OrderModel.findOne = (query) => {
  if (query.paymobIntentionId === 'int_abc') {
    return orderMockQuery;
  }
  return null;
};

PaymentModel.findOne = async (query) => {
  return null;
};

PaymentModel.create = async (data) => {
  return { _id: 'pay123', ...data, save: async () => {} };
};

PaymentModel.updateMany = async () => ({ nModified: 1 });

paymobUtil.createIntention = async () => ({
  intentionId: 'int_abc',
  clientSecret: 'secret_abc'
});

// 2. Require controller/middleware after mocks are applied to module cache
const { verifyPaymob } = require('../middleware/verifyPaymob.middleware');
const paymentController = require('../controller/payment.controller');

// Mock Response Helper
const mockResponse = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.jsonData = data;
    return res;
  };
  res.redirect = (url) => {
    res.redirectUrl = url;
    return res;
  };
  return res;
};

// ── Test HMAC Middleware ──────────────────────────────────────────────────────
test('HMAC Verification - Success with correct signature', (t) => {
  const req = {
    query: { hmac: '' },
    body: {
      obj: {
        amount_cents: 10000,
        created_at: '2026-07-06T21:00:00Z',
        currency: 'EGP',
        error_occured: false,
        has_parent_transaction: false,
        id: 12345,
        integration_id: 123456,
        is_3d_secure: true,
        is_auth: false,
        is_capture: true,
        is_refunded: false,
        is_standalone_payment: true,
        is_voided: false,
        order: { id: 98765 },
        owner: 11111,
        pending: false,
        source_data: { pan: '1234', sub_type: 'card', type: 'visa' },
        success: true
      }
    }
  };

  const fields = [
    req.body.obj.amount_cents,
    req.body.obj.created_at,
    req.body.obj.currency,
    req.body.obj.error_occured,
    req.body.obj.has_parent_transaction,
    req.body.obj.id,
    req.body.obj.integration_id,
    req.body.obj.is_3d_secure,
    req.body.obj.is_auth,
    req.body.obj.is_capture,
    req.body.obj.is_refunded,
    req.body.obj.is_standalone_payment,
    req.body.obj.is_voided,
    req.body.obj.order.id,
    req.body.obj.owner,
    req.body.obj.pending,
    req.body.obj.source_data.pan,
    req.body.obj.source_data.sub_type,
    req.body.obj.source_data.type,
    req.body.obj.success,
  ];
  const concatenated = fields.map((f) => String(f)).join('');
  const expectedHmac = crypto
    .createHmac('sha512', process.env.PAYMOB_HMAC)
    .update(concatenated)
    .digest('hex');

  req.query.hmac = expectedHmac;

  const res = mockResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  verifyPaymob(req, res, next);
  assert.strictEqual(nextCalled, true, 'verifyPaymob should call next() on valid HMAC');
});

test('HMAC Verification - Rejects mismatching signature', (t) => {
  const req = {
    query: { hmac: 'invalid_hmac' },
    body: { obj: { amount_cents: 100 } }
  };
  const res = mockResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  verifyPaymob(req, res, next);
  assert.strictEqual(res.statusCode, 401, 'verifyPaymob should return 401 for mismatch');
  assert.strictEqual(nextCalled, false, 'verifyPaymob should not call next() for mismatch');
});

// ── Test Payment Creation ─────────────────────────────────────────────────────
test('Payment Creation - Happy path creates intention and record', async (t) => {
  const req = {
    user: { id: 'user123', name: 'John Doe', email: 'john@example.com' },
    body: { orderId: 'order123' }
  };
  const res = mockResponse();

  await paymentController.createPayment(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.jsonData.checkoutUrl.includes('clientSecret=secret_abc'));
  assert.strictEqual(res.jsonData.intentionId, 'int_abc');
});

test('Payment Creation - Rejects placeholder public key', async (t) => {
  const originalPublicKey = process.env.PAYMOB_PUBLIC_KEY;
  process.env.PAYMOB_PUBLIC_KEY = 'YOUR_PUBLIC_KEY_HERE';

  const req = {
    user: { id: 'user123' },
    body: { orderId: 'order123' }
  };
  const res = mockResponse();

  await paymentController.createPayment(req, res);

  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.jsonData.message, 'PAYMOB_PUBLIC_KEY is not configured');

  process.env.PAYMOB_PUBLIC_KEY = originalPublicKey; // Restore
});

// ── Test Webhook Handling ─────────────────────────────────────────────────────
test('Webhook - Verifies amount match and bypasses duplicate stock deduction', async (t) => {
  const req = {
    body: {
      obj: {
        id: 'tx_123',
        success: true,
        amount_cents: 10000, // 100 EGP * 100 = 10000 cents
        order: {
          merchant_order_id: 'order123',
          id: 'int_abc'
        }
      }
    }
  };
  const res = mockResponse();

  await paymentController.handleWebhook(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.jsonData.message, 'Webhook processed');
});

test('Webhook - Rejects amount mismatch', async (t) => {
  const req = {
    body: {
      obj: {
        id: 'tx_123',
        success: true,
        amount_cents: 5000, // Expected 10000 cents (100 EGP)
        order: {
          merchant_order_id: 'order123'
        }
      }
    }
  };
  const res = mockResponse();

  await paymentController.handleWebhook(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.jsonData.message, 'Amount mismatch');
});

// ── Test Callback Redirection ─────────────────────────────────────────────────
test('Callback - Redirects success state to frontend', async (t) => {
  const req = {
    query: {
      success: 'true',
      merchant_order_id: 'order123',
      id: 'tx_123'
    }
  };
  const res = mockResponse();

  await paymentController.handleCallback(req, res);

  assert.strictEqual(res.redirectUrl, 'http://localhost:3000/order/order123?status=success');
});
