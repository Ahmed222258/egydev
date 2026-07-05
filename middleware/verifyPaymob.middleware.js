const crypto = require('crypto');

/**
 * Paymob HMAC Verification Middleware
 *
 * Paymob sends a `hmac` query parameter with every webhook.
 * We reconstruct the signed string from specific transaction fields
 * (in the exact order Paymob specifies), hash it with our HMAC secret,
 * and reject the request if it doesn't match.
 *
 * Reference: https://developers.paymob.com/egypt/docs/hmac-calculation
 */
exports.verifyPaymob = (req, res, next) => {
  try {
    const hmacSecret = process.env.PAYMOB_HMAC;
    if (!hmacSecret) {
      return res.status(500).json({ message: 'HMAC secret not configured' });
    }

    const receivedHmac = req.query.hmac;
    if (!receivedHmac) {
      return res.status(401).json({ message: 'Missing HMAC signature' });
    }

    const obj = req.body?.obj || {};

    // Fields concatenated in the exact order Paymob documents
    const fields = [
      obj.amount_cents,
      obj.created_at,
      obj.currency,
      obj.error_occured,
      obj.has_parent_transaction,
      obj.id,
      obj.integration_id,
      obj.is_3d_secure,
      obj.is_auth,
      obj.is_capture,
      obj.is_refunded,
      obj.is_standalone_payment,
      obj.is_voided,
      obj.order?.id,
      obj.owner,
      obj.pending,
      obj.source_data?.pan,
      obj.source_data?.sub_type,
      obj.source_data?.type,
      obj.success,
    ];

    const concatenated = fields.map((f) => (f !== undefined && f !== null ? String(f) : '')).join('');

    const computedHmac = crypto
      .createHmac('sha512', hmacSecret)
      .update(concatenated)
      .digest('hex');

    if (computedHmac !== receivedHmac) {
      return res.status(401).json({ message: 'Invalid HMAC signature — webhook rejected' });
    }

    next();
  } catch (err) {
    return res.status(500).json({ message: 'HMAC verification error', error: err.message });
  }
};
