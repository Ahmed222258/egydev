const Cart = require('../model/cart.model');
const Product = require('../model/product.model');
const logger = require('../utils/logger.util');

// ── Helper: build a unique key per cart line (product + variant) ──────────────
function itemKey(productId, variantId) {
  return `${productId}::${variantId || 'none'}`;
}

// ── Get Cart ──────────────────────────────────────────────────────────────────
exports.getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id }).populate('items.product');
    if (!cart) return res.status(404).json({ message: 'Cart not found' });
    res.status(200).json(cart);
  } catch (error) {
    logger.error(`getCart error: ${error.message}`);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ── Add to Cart ───────────────────────────────────────────────────────────────
// Body: { productId, quantity, variantId?, size?, color? }
exports.addToCart = async (req, res) => {
  const { productId, quantity, variantId, size, color } = req.body;

  if (!productId || typeof quantity !== 'number' || quantity <= 0) {
    return res.status(400).json({ message: 'Invalid product or quantity' });
  }

  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // ── Resolve variant ────────────────────────────────────────────────────
    let resolvedVariantId = null;
    let resolvedSize = size || '';
    let resolvedColor = color || '';
    let resolvedPrice = product.price;

    if (variantId) {
      const variant = product.variants.id(variantId);
      if (!variant) {
        return res.status(400).json({ message: 'Variant not found on this product' });
      }
      resolvedVariantId = variant._id;
      resolvedSize = variant.size || resolvedSize;
      resolvedColor = variant.color || resolvedColor;
    } else if (size || color) {
      // Try to match by size/color if variantId not provided
      const variant = product.variants.find(
        (v) =>
          (!size || v.size === size) &&
          (!color || v.color.toLowerCase() === color.toLowerCase())
      );
      if (variant) {
        resolvedVariantId = variant._id;
        resolvedSize = variant.size || resolvedSize;
        resolvedColor = variant.color || resolvedColor;
      }
    }

    // Effective price (respects active sales)
    resolvedPrice =
      product.sale &&
      product.sale.isOnSale &&
      product.sale.salePrice > 0
        ? product.sale.salePrice
        : product.price;

    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) cart = new Cart({ user: req.user.id, items: [] });

    // Match by product + variantId so different variants are separate line items
    const index = cart.items.findIndex(
      (item) =>
        item.product.toString() === productId &&
        String(item.variantId || 'none') === String(resolvedVariantId || 'none')
    );

    if (index > -1) {
      cart.items[index].quantity += quantity;
    } else {
      cart.items.push({
        product: productId,
        quantity,
        price: resolvedPrice,
        variantId: resolvedVariantId,
        size: resolvedSize,
        color: resolvedColor,
      });
    }

    const updatedCart = await cart.save();
    res.status(200).json({ message: 'Item added to cart', cart: updatedCart });
  } catch (error) {
    logger.error(`addToCart error: ${error.message}`);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ── Remove from Cart ──────────────────────────────────────────────────────────
// Route: DELETE /cart/:productId   (optionally ?variantId=xxx)
exports.removeFromCart = async (req, res) => {
  const { productId } = req.params;
  const { variantId } = req.query;

  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const before = cart.items.length;

    if (variantId) {
      // Remove only the specific variant line
      cart.items = cart.items.filter(
        (item) =>
          !(
            item.product.toString() === productId &&
            String(item.variantId || 'none') === String(variantId || 'none')
          )
      );
    } else {
      // Remove ALL lines for this product (any variant)
      cart.items = cart.items.filter(
        (item) => item.product.toString() !== productId
      );
    }

    if (cart.items.length === before) {
      return res.status(404).json({ message: 'Item not found in cart' });
    }

    await cart.save();
    res.status(200).json({ message: 'Item removed', cart });
  } catch (error) {
    logger.error(`removeFromCart error: ${error.message}`);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ── Update Quantity ───────────────────────────────────────────────────────────
// Route: PUT /cart/:productId   Body: { quantity, variantId? }
exports.updateQuantity = async (req, res) => {
  const { productId } = req.params;
  const { quantity, variantId } = req.body;

  if (typeof quantity !== 'number' || quantity <= 0) {
    return res.status(400).json({ message: 'Invalid quantity' });
  }

  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const item = cart.items.find(
      (i) =>
        i.product.toString() === productId &&
        String(i.variantId || 'none') === String(variantId || 'none')
    );

    if (!item) return res.status(404).json({ message: 'Product not in cart' });

    item.quantity = quantity;
    const updatedCart = await cart.save();
    res.status(200).json({ message: 'Quantity updated', cart: updatedCart });
  } catch (error) {
    logger.error(`updateQuantity error: ${error.message}`);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ── Clear Cart ────────────────────────────────────────────────────────────────
exports.clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    cart.items = [];
    await cart.save();
    res.status(200).json({ message: 'Cart cleared' });
  } catch (error) {
    logger.error(`clearCart error: ${error.message}`);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ── Sync Cart from localStorage ───────────────────────────────────────────────
// Body: { items: [{ productId, quantity, variantId?, size?, color? }] }
exports.syncCartFromLocal = async (req, res) => {
  const localItems = req.body.items;

  if (!Array.isArray(localItems) || localItems.length === 0) {
    return res.status(400).json({ message: 'No items to sync' });
  }

  try {
    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) cart = new Cart({ user: req.user.id, items: [] });

    for (const item of localItems) {
      if (!item.productId || !item.quantity || item.quantity <= 0) continue;

      const product = await Product.findById(item.productId);
      if (!product) continue;

      // Resolve variant
      let resolvedVariantId = null;
      let resolvedSize = item.size || '';
      let resolvedColor = item.color || '';

      if (item.variantId) {
        const variant = product.variants.id(item.variantId);
        if (variant) {
          resolvedVariantId = variant._id;
          resolvedSize = variant.size || resolvedSize;
          resolvedColor = variant.color || resolvedColor;
        }
      } else if (item.size || item.color) {
        const variant = product.variants.find(
          (v) =>
            (!item.size || v.size === item.size) &&
            (!item.color || v.color.toLowerCase() === (item.color || '').toLowerCase())
        );
        if (variant) {
          resolvedVariantId = variant._id;
          resolvedSize = variant.size || resolvedSize;
          resolvedColor = variant.color || resolvedColor;
        }
      }

      const resolvedPrice =
        product.sale && product.sale.isOnSale && product.sale.salePrice > 0
          ? product.sale.salePrice
          : product.price;

      const index = cart.items.findIndex(
        (i) =>
          i.product.toString() === item.productId &&
          String(i.variantId || 'none') === String(resolvedVariantId || 'none')
      );

      if (index > -1) {
        cart.items[index].quantity += item.quantity;
      } else {
        cart.items.push({
          product: item.productId,
          quantity: item.quantity,
          price: resolvedPrice,
          variantId: resolvedVariantId,
          size: resolvedSize,
          color: resolvedColor,
        });
      }
    }

    const updatedCart = await cart.save();
    res.status(200).json({ message: 'Cart synced from localStorage', cart: updatedCart });
  } catch (error) {
    logger.error(`syncCartFromLocal error: ${error.message}`);
    res.status(500).json({ message: 'Sync failed', error: error.message });
  }
};
