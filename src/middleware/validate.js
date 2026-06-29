const Joi = require('joi');

/**
 * Create a validation middleware factory.
 * Validates request body against a Joi schema, strips unknown fields.
 * Returns 400 with structured details on failure.
 */
function createValidationMiddleware(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      stripUnknown: true,
      abortEarly: false
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details
      });
    }

    // Replace body with validated and stripped value
    req.body = value;
    next();
  };
}

/**
 * Schema for POST /cart/items
 */
const postCartItemSchema = Joi.object({
  userId: Joi.string().min(1).required(),
  productId: Joi.string().min(1).required(),
  name: Joi.string().min(1).required(),
  price: Joi.number().positive().required(),
  quantity: Joi.number().integer().min(0).required(),
  category: Joi.string().min(1).required()
});

module.exports = {
  createValidationMiddleware,
  postCartItemSchema
};
