const express = require('express');
const router = express.Router();

const userIdMiddleware = require('../middleware/userId');
const { createValidationMiddleware, postCartItemSchema } = require('../middleware/validate');
const rateLimiterMiddleware = require('../middleware/rateLimiter');

const cartController = require('../controllers/cartController');

// Mount userId middleware on all routes
router.use(userIdMiddleware);

// Mount validation and rate limiter on POST only
router.post(
  '/items',
  createValidationMiddleware(postCartItemSchema),
  rateLimiterMiddleware,
  cartController.upsertItem
);

// GET /cart - retrieve user's cart
router.get('/', cartController.getCart);

// GET /cart/checkout - retrieve checkout summary
router.get('/checkout', cartController.checkout);

module.exports = router;
