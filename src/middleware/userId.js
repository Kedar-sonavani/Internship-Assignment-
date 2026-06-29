/**
 * Middleware to extract and require userId from the request.
 * Searches in order: X-User-Id header, query param, body field.
 * Returns 400 with structured error if absent.
 */
function userIdMiddleware(req, res, next) {
  // Try header first
  let userId = req.get('X-User-Id');

  // Then query param
  if (!userId) {
    userId = req.query.userId;
  }

  // Then body field
  if (!userId) {
    userId = req.body && req.body.userId;
  }

  if (!userId || userId.trim() === '') {
    return res.status(400).json({
      error: 'Missing userId',
      details: [
        {
          field: 'userId',
          message: 'userId is required (via X-User-Id header, query param, or body field)'
        }
      ]
    });
  }

  req.userId = userId;
  next();
}

module.exports = userIdMiddleware;
