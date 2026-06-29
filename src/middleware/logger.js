/**
 * Structured JSON logging middleware.
 * Logs to stdout with: timestamp, method, path, userId, statusCode, durationMs.
 * Adds errorMessage on 4xx/5xx responses.
 * Never logs request/response bodies.
 */
function loggerMiddleware(req, res, next) {
  // Capture start time
  const startTime = Date.now();

  // Extract userId if available
  const userId = req.userId || req.get('X-User-Id') || req.query.userId || null;

  // Intercept res.end to log response
  const originalEnd = res.end;

  res.end = function(...args) {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;

    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      userId: userId || null,
      statusCode,
      durationMs
    };

    // Add errorMessage for 4xx/5xx
    if (statusCode >= 400) {
      logEntry.errorMessage = res.statusMessage || 'Error';
    }

    console.log(JSON.stringify(logEntry));

    // Call original end
    originalEnd.apply(res, args);
  };

  next();
}

module.exports = loggerMiddleware;
