const fs = require('fs');
const path = require('path');

let cachedTiers = null;

/**
 * Load campaigns from a JSON file and cache them.
 * Loads synchronously at application startup.
 */
function loadCampaigns(filepath) {
  if (cachedTiers !== null) {
    return cachedTiers;
  }

  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    cachedTiers = JSON.parse(content);
    return cachedTiers;
  } catch (err) {
    console.error(`Failed to load campaigns from ${filepath}:`, err.message);
    cachedTiers = [];
    return cachedTiers;
  }
}

/**
 * Compute the discount amount for a tier and subtotal.
 * For percentage: subtotal × (discountValue / 100), rounded to 2 dp
 * For fixed: min(discountValue, subtotal)
 */
function computeDiscount(tier, subtotal) {
  if (!tier) {
    return 0;
  }

  let discountAmount = 0;

  if (tier.discountType === 'percentage') {
    // Percentage: (subtotal × discountValue) / 100, rounded to 2 dp
    discountAmount = parseFloat(
      (subtotal * (tier.discountValue / 100)).toFixed(2)
    );
  } else if (tier.discountType === 'fixed') {
    // Fixed: min(discountValue, subtotal)
    discountAmount = Math.min(tier.discountValue, subtotal);
  }

  return discountAmount;
}

/**
 * Evaluate all tiers and return the single tier with the highest discount amount
 * that qualifies (subtotal >= minSubtotal AND distinctCategoryCount >= minCategories).
 * Returns null if no tier qualifies.
 */
function evaluateTiers(subtotal, distinctCategoryCount, tiers) {
  if (!tiers || tiers.length === 0) {
    return null;
  }

  let bestTier = null;
  let bestDiscountAmount = -1;

  for (const tier of tiers) {
    // Check if tier qualifies
    if (subtotal >= tier.minSubtotal && distinctCategoryCount >= tier.minCategories) {
      const discountAmount = computeDiscount(tier, subtotal);

      // Track the tier with highest discount
      if (discountAmount > bestDiscountAmount) {
        bestDiscountAmount = discountAmount;
        bestTier = tier;
      }
    }
  }

  return bestTier;
}

/**
 * Get the currently loaded tiers (for the GET /campaigns endpoint)
 */
function getTiers() {
  return cachedTiers || [];
}

module.exports = {
  loadCampaigns,
  computeDiscount,
  evaluateTiers,
  getTiers
};
