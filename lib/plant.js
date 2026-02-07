const plant = process.env.PLANT || 'mrg';

// Feature groups enabled per plant. Omitted = all features enabled.
const enabledFeaturesByPlant = {
  bri: ['dmcheck'],
};

const enabledFeatures = enabledFeaturesByPlant[plant];

export function isFeatureEnabled(feature) {
  if (!enabledFeatures) return true; // no restrictions (mrg)
  return enabledFeatures.includes(feature);
}

export { plant };
