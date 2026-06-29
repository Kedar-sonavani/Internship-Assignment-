const express = require('express');
const router = express.Router();

const campaignController = require('../controllers/campaignController');

// GET /campaigns - retrieve loaded tiers
router.get('/', campaignController.getCampaigns);

module.exports = router;
