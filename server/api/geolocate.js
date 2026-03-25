const geoip = require('geoip-lite');

// Map country codes to currencies
const COUNTRY_CURRENCY_MAP = {
  US: 'USD',
  CA: 'CAD',
  JP: 'JPY',
  CN: 'CNY',
  KR: 'KRW',
  TH: 'THB',
  AU: 'AUD',
  // Eurozone countries
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR',
  BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR', IE: 'EUR',
  GR: 'EUR', SK: 'EUR', SI: 'EUR', EE: 'EUR', LV: 'EUR',
  LT: 'EUR', LU: 'EUR', MT: 'EUR', CY: 'EUR',
  GB: 'GBP',
  HK: 'HKD',
  SG: 'SGD',
};

module.exports = (req, res) => {
  try {
    // Get IP from request
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || req.ip;

    console.log('Geolocate request IP:', ip);

    // Look up geo data
    const geo = geoip.lookup(ip);
    console.log('Geo result:', geo);

    const countryCode = geo?.country || 'US';
    const currency = COUNTRY_CURRENCY_MAP[countryCode] || 'USD';

    res.json({
      success: true,
      countryCode,
      currency,
    });
  } catch (error) {
    console.error('Geolocate error:', error);
    // Default to USD on error
    res.json({
      success: true,
      countryCode: 'US',
      currency: 'USD',
    });
  }
};