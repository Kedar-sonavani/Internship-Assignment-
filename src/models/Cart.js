const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
  category: { type: String, required: true }
});

const cartSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  items: [itemSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Pre-save hook to update updatedAt
cartSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;