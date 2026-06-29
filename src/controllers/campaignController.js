const campaignService = require('../services/campaignService');

/**
 * GET /campaigns
 * Return the loaded tier definitions.
 */
function getCampaigns(req, res) {
  try {
    const tiers = campaignService.getTiers();
    return res.status(200).json(tiers);
  } catch (err) {
    console.error('Error in getCampaigns:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getCampaigns
};
