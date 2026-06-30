/**
 * Lightweight input validation middleware.
 * No external library required — plain JS checks.
 */

/**
 * Validate product creation / update body.
 * Only enforces required fields on create.
 */
exports.validateProduct = (isCreate = true) => (req, res, next) => {
  const errors = [];
  const { productName, price, type, status, discountPercentage } = req.body;

  if (isCreate) {
    if (!productName || !productName.trim()) errors.push('productName is required');
    if (price === undefined || price === null || price === '') errors.push('price is required');
  }

  if (price !== undefined && isNaN(parseFloat(price))) {
    errors.push('price must be a valid number');
  }

  const validTypes = ['Shirt', 'Sticker', 'Cap', 'Scarf', 'Poster', 'Flag', 'Accessories', 'Shoes', 'Ball', 'Mug', 'Keychain'];
  if (type && !validTypes.includes(type)) {
    errors.push(`type must be one of: ${validTypes.join(', ')}`);
  }

  const validStatuses = ['Available', 'Sold Out', 'Limited Edition', 'Coming Soon', 'Pre-order', 'Discontinued'];
  if (status && !validStatuses.includes(status)) {
    errors.push(`status must be one of: ${validStatuses.join(', ')}`);
  }

  if (discountPercentage !== undefined) {
    const disc = parseFloat(discountPercentage);
    if (isNaN(disc) || disc < 0 || disc > 100) {
      errors.push('discountPercentage must be between 0 and 100');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: 'Validation failed', errors });
  }

  next();
};

/**
 * Validate review body.
 */
exports.validateReview = (req, res, next) => {
  const errors = [];
  const { rating } = req.body;

  if (rating === undefined || rating === null) errors.push('rating is required');
  else {
    const r = parseFloat(rating);
    if (isNaN(r) || r < 1 || r > 5) errors.push('rating must be between 1 and 5');
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: 'Validation failed', errors });
  }

  next();
};

/**
 * Validate team creation body.
 */
exports.validateTeam = (req, res, next) => {
  const errors = [];
  const { teamName, sport } = req.body;

  if (!teamName || !teamName.trim()) errors.push('teamName is required');

  const validSports = ['Football', 'Basketball', 'Formula 1', 'Tennis', 'Cricket', 'Other'];
  if (sport && !validSports.includes(sport)) {
    errors.push(`sport must be one of: ${validSports.join(', ')}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: 'Validation failed', errors });
  }

  next();
};
