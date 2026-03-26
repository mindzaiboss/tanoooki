const geoip = require('geoip-lite');

// Map country codes to currencies
// NOTE: Keep this in sync with src/util/useCurrencyConversion.js COUNTRY_CURRENCY_MAP
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
    // Extract IP from request — check x-forwarded-for first (for proxies like Render),
    // then fall back to socket address or req.ip
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || req.ip;
    console.log('Geolocate request IP:', ip);

    // Look up geo data from geoip-lite's local database
    // Returns: { country, region, city, ll: [lat, lon], ... } or null
    const geo = geoip.lookup(ip);
    console.log('Geo result:', geo);

    // Default to US if country can't be determined (e.g. localhost ::1)
    const countryCode = geo?.country || 'US';
    const currency = COUNTRY_CURRENCY_MAP[countryCode] || 'USD';

    res.json({
      success: true,
      countryCode,          // e.g. 'CA'
      currency,             // e.g. 'CAD'
      region: geo?.region || null,  // e.g. 'ON' for Ontario, 'CA' for California
      city: geo?.city || null,      // e.g. 'Toronto'
      ll: geo?.ll || null,          // e.g. [43.7001, -79.4163] lat/long coordinates
    });
  } catch (error) {
    console.error('Geolocate error:', error);
    // Default to USD on error — better to show something than nothing
    res.json({
      success: true,
      countryCode: 'US',
      currency: 'USD',
      region: null,
      city: n