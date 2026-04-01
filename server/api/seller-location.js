// server/api/seller-location.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

    // Fetch vendor from Supabase
    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('street_address, street_address_2, city, state_province, postal_code, country')
      .eq('id', sellerId)
      .single();

    if (error) {
      console.error('Supabase error:', error);
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

    const {
      street_address: streetAddress,
      street_address_2: streetAddress2,
      city,
      state_province: stateProvince,
      postal_code: postalCode,
      country,
    } = vendor;

    // 4-tier fallback logic
    if (streetAddress && city && stateProvince && postalCode && country) {
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