const sharetribeIntegrationSdk = require('sharetribe-flex-integration-sdk');

const INTEGRATION_CLIENT_ID = process.env.SHARETRIBE_INTEGRATION_CLIENT_ID;
const INTEGRATION_CLIENT_SECRET = process.env.SHARETRIBE_INTEGRATION_CLIENT_SECRET;

const COUNTRY_FALLBACK = {
  CA: { city: 'Toronto', state: 'ON', street1: '220 Yonge St', zip: 'M5B 2H1', country: 'CA' },
  US: { city: 'Chicago', state: 'IL', street1: '121 N LaSalle St', zip: '60602', country: 'US' },
  JP: { city: 'Tokyo', state: 'Tokyo', street1: '1-1 Chiyoda', zip: '100-0001', country: 'JP' },
  CN: { city: 'Beijing', state: 'Beijing', street1: '1 Changan Ave', zip: '100010', country: 'CN' },
  KR: { city: 'Seoul', state: 'Seoul', street1: '175 Sejong-daero', zip: '03154', country: 'KR' },
  TH: { city: 'Bangkok', state: 'Bangkok', street1: '173 Sathorn Rd', zip: '10120', country: 'TH' },
  AU: { city: 'Sydney', state: 'NSW', street1: '483 George St', zip: '2000', country: 'AU' },
  GB: { city: 'London', state: 'England', street1: '10 Downing St', zip: 'SW1A 2AA', country: 'GB' },
  HK: { city: 'Hong Kong', state: 'Hong Kong', street1: '1 Tim Mei Ave', zip: '999077', country: 'HK' },
  SG: { city: 'Singapore', state: 'Singapore', street1: '1 St Andrews Rd', zip: '178957', country: 'SG' },
};

module.exports = async (req, res) => {
  try {
    const { sellerId } = req.body;

    if (!sellerId) {
      return res.status(400).json({ error: 'sellerId is required' });
    }

    const integrationSdk = sharetribeIntegrationSdk.createInstance({
      clientId: INTEGRATION_CLIENT_ID,
      clientSecret: INTEGRATION_CLIENT_SECRET,
    });

    const { UUID } = sharetribeIntegrationSdk.types;

    const response = await integrationSdk.users.show({
      id: new UUID(sellerId),
      include: ['profileImage'],
    });

    const user = response.data.data;
    const privateData = user.attributes.profile.privateData || {};
    console.log('Seller privateData:', JSON.stringify(privateData, null, 2));

    const {
      streetAddress,
      streetAddress2,
      city,
      stateProvince,
      postalCode,
      country,
    } = privateData;

    if (streetAddress && city && stateProvince && postalCode && country) {
      // Tier 1 — full address available
      return res.json({
        success: true,
        tier: 'full',
        address: {
          name: 'Seller',
          street1: streetAddress,
          street2: streetAddress2 || '',
          city,
          state: stateProvince,
          zip: postalCode,
          country,
          phone: '4161234567',
        },
      });
    } else if (city && stateProvince && country) {
      // Tier 2 — city + state + country
      return res.json({
        success: true,
        tier: 'city',
        address: {
          name: 'Seller',
          street1: '',
          city,
          state: stateProvince,
          zip: postalCode || '',
          country,
          phone: '4161234567',
        },
      });
    } else if (country) {
      // Tier 3 — country only, use capital fallback
      const fallback = COUNTRY_FALLBACK[country] || COUNTRY_FALLBACK['US'];
      return res.json({
        success: true,
        tier: 'country',
        address: {
          name: 'Seller',
          ...fallback,
          phone: '4161234567',
        },
      });
    } else {
      // Tier 4 — nothing, use Toronto as default
      return res.json({
        success: true,
        tier: 'fallback',
        address: {
          name: 'Seller',
          ...COUNTRY_FALLBACK['CA'],
          phone: '4161234567',
        },
      });
    }
  } catch (error) {
    console.error('Seller location error:', error.message);
    res.status(500).json({ error: 'Failed to fetch seller location', details: error.message });
  }
};