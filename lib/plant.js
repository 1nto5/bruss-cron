const plant = process.env.PLANT || 'mrg';

const countryByPlant = {
  mrg: 'PL',
  bri: 'DE',
};

const country = countryByPlant[plant] || 'PL';

// Feature groups enabled per plant. Omitted = all features enabled.
const enabledFeaturesByPlant = {
  bri: ['dmcheck-archive', 'ldap-sync'],
};

const enabledFeatures = enabledFeaturesByPlant[plant];

export function isFeatureEnabled(feature) {
  if (!enabledFeatures) return true; // no restrictions (mrg)
  return enabledFeatures.includes(feature);
}

export { plant, country };
