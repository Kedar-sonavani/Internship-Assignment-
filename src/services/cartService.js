const Cart = require('../models/Cart');

/**
 * Get the cart for a user.
 * Returns the existing cart if found, or an empty cart (never creates on read).
 */
async function getCart(userId) {
  let cart = await Cart.findOne({ userId });

  if (!cart) {
    // Return a representation of an empty cart without saving
    cart = {
      userId,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  return cart;
}

/**
 * Upsert an item in a user's cart.
 * - Finds or creates the cart
 * - If quantity is 0, removes the item by productId
 * - Otherwise, adds or updates the item by productId
 * - Updates updatedAt timestamp
 * - Returns the saved cart
 */
async function upsertItem(userId, item) {
  // Find or create cart
  let cart = await Cart.findOne({ userId });

  if (!cart) {
    cart = new Cart({
      userId,
      items: []
    });
  }

  const { productId, quantity } = item;

  if (quantity === 0) {
    // Remove item by productId
    cart.items = cart.items.filter(i => i.productId !== productId);
  } else {
    // Find existing item with this productId
    const existingIndex = cart.items.findIndex(i => i.productId === productId);

    if (existingIndex >= 0) {
      // Update existing item
      cart.items[existingIndex].quantity = quantity;
      cart.items[existingIndex].price = item.price;
      // name and category could also be updated
      cart.items[existingIndex].name = item.name;
      cart.items[existingIndex].category = item.category;
    } else {
      // Add new item
      cart.items.push({
        productId,
        name: item.name,
        price: item.price,
        quantity,
        category: item.category
      });
    }
  }

  // Update updatedAt (the pre-save hook will also set it, but be explicit)
  cart.updatedAt = Date.now();

  // Save and return
  return await cart.save();
}

module.exports = {
  getCart,
  upsertItem
};
