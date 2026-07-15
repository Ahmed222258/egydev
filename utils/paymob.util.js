const axios = require('axios');

/**
 * Paymob Payment Utility — Intention API (v2)
 *
 * Key format `egy_sk_test_...` = Paymob's new Payment Intention API (not legacy).
 *
 * Single-call flow:
 *   POST /v1/intention/  →  { id (intentionId), client_secret }
 *   Checkout URL: https://accept.paymob.com/unifiedcheckout/?publicKey=<pub>&clientSecret=<secret>
 *
 * Required .env:
 *   PAYMOB_API_KEY       = egy_sk_test_...  (Secret Key — server only)
 *   PAYMOB_PUBLIC_KEY    = egy_pk_test_...  (Public Key — used in checkout URL)
 *   PAYMOB_INTEGRATION_ID = 5768977
 *   PAYMOB_HMAC          = ...              (HMAC secret for webhook verification)
 */

const BASE_URL = process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com';
const origin = BASE_URL.replace(/\/api$/, '');
const SECRET_KEY = process.env.PAYMOB_API_KEY;

/**
 * Create a Paymob Payment Intention.
 *
 * @param {Object} params
 * @param {string} params.orderId          - Your local MongoDB Order _id (stored as merchant_order_id)
 * @param {number} params.amountCents      - Total in smallest currency unit (e.g. 10000 = 100 EGP)
 * @param {Array}  params.items            - [{ name, amount, description, quantity }]
 * @param {Object} params.billing          - { firstName, lastName, email, phone, street, ... }
 * @param {number} params.integrationId    - Paymob card integration ID
 * @returns {{ intentionId: string, clientSecret: string }}
 */
const createIntention = async ({ orderId, amountCents, items = [], billing = {}, integrationId }) => {
  try {
    const response = await axios.post(
      `${origin}/v1/intention/`,
      {
        amount: amountCents,
        currency: 'EGP',
        // merchant_order_id links Paymob's transaction back to our local order in the webhook
        merchant_order_id: orderId.toString(),
        payment_methods: [parseInt(integrationId)],
        items: items.map((i) => ({
          name: i.name,
          amount: i.amount,         // per-item price in cents
          description: i.description || '',
          quantity: i.quantity,
        })),
        billing_data: {
          first_name: billing.firstName || 'NA',
          last_name:  billing.lastName  || 'NA',
          email:      billing.email     || 'NA',
          phone_number: billing.phone   || 'NA',
          street:     billing.street    || 'NA',
          building:   billing.building  || 'NA',
          apartment:  billing.apartment || 'NA',
          floor:      billing.floor     || 'NA',
          city:       billing.city      || 'NA',
          country:    billing.country   || 'EG',
          postal_code: billing.postalCode || 'NA',
          state:      billing.state     || 'NA',
        },
        customer: {
          first_name: billing.firstName || 'NA',
          last_name:  billing.lastName  || 'NA',
          email:      billing.email     || 'NA',
        },
        // extras is echoed back in the webhook under obj.order.extras
        extras: { order_id: orderId.toString() },
        // We embed our own order ID in the URL so the callback always knows which order to update.
        // Paymob appends its own params (&success=true&id=...&order=...) to whatever URL we give it.
        redirection_url: `http://localhost:${process.env.PORT || 8000}/api/payment/callback?our_order_id=${orderId}`,
      },
      {
        headers: {
          Authorization: `Token ${SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      intentionId:  String(response.data.id),
      clientSecret: response.data.client_secret,
    };
  } catch (err) {
    const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Paymob intention failed [${err.response?.status}]: ${msg}`);
  }
};

/**
 * Refund a Paymob transaction (full refund).
 *
 * @param {string} transactionId   - Paymob transaction ID (stored as paymobTransactionId on Payment)
 * @param {number} amountCents     - Amount to refund in cents (use full payment amount for full refund)
 * @returns {{ success: boolean, refundId: string }}
 */
const refundTransaction = async ({ transactionId, amountCents }) => {
  try {
    const response = await axios.post(
      `${origin}/api/acceptance/void_refund/refund`,
      {
        transaction_id: parseInt(transactionId, 10),
        amount_cents: amountCents,
      },
      {
        headers: {
          Authorization: `Token ${SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      refundId: String(response.data.id || ''),
    };
  } catch (err) {
    const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Paymob refund failed [${err.response?.status}]: ${msg}`);
  }
};

module.exports = { createIntention, refundTransaction };
