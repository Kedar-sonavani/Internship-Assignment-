require('dotenv').config();
const express = require('express');
const path = require('path');
const { connectDB } = require('./config/db');
const campaignService = require('./services/campaignService');
const loggerMiddleware = require('./middleware/logger');

const cartRoutes = require('./routes/cart');
const campaignRoutes = require('./routes/campaigns');

/**
 * Create and configure the Express application
 */
function createApp() {
  const app = express();

  // Register logger middleware
  app.use(loggerMiddleware);

  // Body parser with 100kb limit
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ limit: '100kb', extended: false }));

  // Mount routes
  app.use('/cart', cartRoutes);
  app.use('/campaigns', campaignRoutes);

  // 404 handler
  app.use((req, res) => {
    return res.status(404).json({ error: 'Not found' });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

/**
 * Start the server
 */
async function startServer(port) {
  const actualPort = port || process.env.PORT || 3000;
  try {
    // Connect to MongoDB
    await connectDB();

    // Load campaigns
    const campaignsPath = path.join(__dirname, 'campaigns.json');
    campaignService.loadCampaigns(campaignsPath);

    const app = createApp();

    return new Promise((resolve) => {
      const server = app.listen(actualPort, () => {
        console.log(`Server running on port ${actualPort}`);
        resolve(server);
      });
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    throw err;
  }
}

module.exports = {
  createApp,
  startServer
};

// If this file is run directly, start the server
if (require.main === module) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
