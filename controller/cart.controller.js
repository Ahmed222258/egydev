const Cart = require('../model/cart.model');
const Product = require('../model/product.model');


exports.getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id }).populate('items.product');
    if (!cart) return res.status(404).json({ message: 'Cart not found' });
    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.addToCart = async (req, res) => {
  const { productId, quantity } = req.body;

  if (!productId || typeof quantity !== 'number' || quantity <= 0) {
    return res.status(400).json({ message: 'Invalid product or quantity' });
  }

  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) cart = new Cart({ user: req.user.id, items: [] });

    const index = cart.items.findIndex(item => item.product.toString() === productId);
    if (index > -1) {
      cart.items[index].quantity += quantity;
    } else {
      cart.items.push({ product: productId, quantity, price: product.price });
    }

    const updatedCart = await cart.save();
    res.status(200).json({ message: 'Item added to cart', cart: updatedCart });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


exports.removeFromCart = async (req, res) => {
  const { productId } = req.params;
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    cart.items = cart.items.filter(item => item.product.toString() !== productId);
    await cart.save();
    res.status(200).json({ message: 'Item removed', cart });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


exports.updateQuantity = async (req, res) => {
  const { productId } = req.params;
  const { quantity } = req.body;

  if (typeof quantity !== 'number' || quantity <= 0) {
    return res.status(400).json({ message: 'Invalid quantity' });
  }

  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const item = cart.items.find(i => i.product.toString() === productId);
    if (!item) return res.status(404).json({ message: 'Product not in cart' });

    item.quantity = quantity;
    const updatedCart = await cart.save();
    res.status(200).json({ message: 'Quantity updated', cart: updatedCart });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


exports.clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    cart.items = [];
    await cart.save();
    res.status(200).json({ message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


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

      const index = cart.items.findIndex(i => i.product.toString() === item.productId);
      if (index > -1) {
        cart.items[index].quantity += item.quantity;
      } else {
        cart.items.push({ product: item.productId, quantity: item.quantity, price: product.price });
      }
    }

    const updatedCart = await cart.save();
    res.status(200).json({ message: 'Cart synced from localStorage', cart: updatedCart });
  } catch (error) {
    res.status(500).json({ message: 'Sync failed', error: error.message });
  }
};
