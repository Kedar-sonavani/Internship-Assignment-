const cartService = require('../services/cartService');
const campaignService = require('../services/campaignService');

/**
 * GET /cart
 * Return the cart for the authenticated user.
 */
async function getCart(req, res) {
  try {
    const userId = req.userId;
    const cart = await cartService.getCart(userId);

    return res.status(200).json(cart);
  } catch (err) {
    console.error('Error in getCart:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /cart/items
 * Upsert or remove an item in the user's cart.
 * req.body contains: userId, productId, name, price, quantity, category
 */
async function upsertItem(req, res) {
  try {
    const userId = req.userId;
    const { productId, name, price, quantity, category } = req.body;

    const item = {
      productId,
      name,
      price,
      quantity,
      category
    };

    const updatedCart = await cartService.upsertItem(userId, item);

    return res.status(200).json(updatedCart);
  } catch (err) {
    console.error('Error in upsertItem:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /cart/checkout
 * Compute and return a checkout summary with applied discounts.
 */
async function checkout(req, res) {
  try {
    const userId = req.userId;
    const cart = await cartService.getCart(userId);

    // Compute subtotal: sum of price × quantity for all items
    let subtotal = 0;
    for (const item of cart.items) {
      subtotal += item.price * item.quantity;
    }
    // Round to 2 decimal places
    subtotal = parseFloat(subtotal.toFixed(2));

    // Get distinct categories
    const categorySet = new Set();
    for (const item of cart.items) {
      categorySet.add(item.category);
    }
    const distinctCategoryCount = categorySet.size;

    // Evaluate tiers and compute discount
    const tiers = campaignService.getTiers();
    const appliedTier = campaignService.evaluateTiers(subtotal, distinctCategoryCount, tiers);
    const discountAmount = campaignService.computeDiscount(appliedTier, subtotal);

    // Compute total
    const total = parseFloat((subtotal - discountAmount).toFixed(2));

    // Build Checkout_Summary
    const lineItems = cart.items.map(item => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      category: item.category,
      lineTotal: parseFloat((item.price * item.quantity).toFixed(2))
    }));

    const summary = {
      userId,
      items: lineItems,
      subtotal,
      discountAmount,
      discountLabel: appliedTier ? appliedTier.label : null,
      total,
      appliedTier: appliedTier ? appliedTier.id : null
    };

    return res.status(200).json(summary);
  } catch (err) {
    console.error('Error in checkout:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getCart,
  upsertItem,
  checkout
};
