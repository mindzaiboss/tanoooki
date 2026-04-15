const { Shippo } = require('shippo');
const { createClient } = require('@supabase/supabase-js');

const shippo = new Shippo({ apiKeyHeader: process.env.SHIPPO_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// Carrier accounts by ORIGIN country
// DHL Express is the universal fallback for any unlisted country or route
// ---------------------------------------------------------------------------
const DHL = 'd9a54cc0c85140cfb4773f8516d28915';

const CARRIER_ACCOUNTS_BY_COUNTRY = {
  CA: [
    '593a940031554e009ddf8068a66a6b47', // UPS Canada
    'a7e659b3218c49c182140d682b98f937', // Canada Post
    DHL,
  ],
  US: [
    '670f42fd1c594430926357ee1739c4f1', // UPS US
    'f5fad08c7b1a4576b883398d5a1e8225', // USPS
    DHL,
  ],
  GB: [
    'cf2f0ddf3fb046aaabfdc0f93ec4d487', // Evri UK
    'd7f9e16b7ace4ce09b86a87890e2b521', // DPD UK
    DHL,
  ],
  AU: [
    'd9b161767e45415fa21c05d3c8d7517c', // Sendle
    'b8fe56bc9c6941879c57984b4e5b6fd8', // CouriersPlease
    DHL,
  ],
  DE: [
    '3791410183d24e03a384743f5c883515', // Deutsche Post
    '74d55e3c9d1c4f39b9004776158faf5b', // DPD DE
    DHL,
  ],
  FR: [
    '9567e2c357234436b4a7ab58ba3f5709', // Chronopost
    '8175973efc28499ba6552e6c618e36b3', // Colissimo
    DHL,
  ],
  // Asia-Pacific: DHL only (most reliable for these origins)
  JP: [DHL],
  CN: [DHL],
  KR: [DHL],
  TH: [DHL],
  HK: [DHL],
  SG: [DHL],
};

// Fallback for any unlisted origin country
const DEFAULT_CARRIERS = [DHL];

const PROVINCE_STATE_CODES = {
  'Alberta': 'AB', 'British Columbia': 'BC', 'Manitoba': 'MB',
  'New Brunswick': 'NB', 'Newfoundland and Labrador': 'NL',
  'Northwest Territories': 'NT', 'Nova Scotia': 'NS', 'Nunavut': 'NU',
  'Ontario': 'ON', 'Prince Edward Island': 'PE', 'Quebec': 'QC',
  'Saskatchewan': 'SK', 'Yukon': 'YT',
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY',
};

const normalizeState = (state) => {
  if (!state) return '';
  if (state.length <= 3) return state.toUpperCase();
  return PROVINCE_STATE_CODES[state] || state;
};


module.exports = async (req, res) => {
  try {
    const { vendorUsername, buyerId, weight, weightUnit, length, width, height, distanceUnit } = req.body;

    console.log('=== SHIPPO RATES REQUEST ===');
    console.log('vendorUsername:', vendorUsername);
    console.log('buyerId:', buyerId);

    // Lookup seller address from Supabase
    let sellerAddress = null;
    if (vendorUsername) {
      const { data: sellerData, error: sellerError } = await supabase
        .from('users')
        .select('shipping_address, delivery_address')
        .eq('username', vendorUsername)
        .single();

      if (sellerError) {
        console.error('Seller lookup error:', sellerError);
      } else {
        sellerAddress = sellerData?.shipping_address || sellerData?.delivery_address;
      }
    }

    // Lookup buyer address from Supabase
    let buyerAddress = null;
    if (buyerId) {
      const { data: buyerData, error: buyerError } = await supabase
        .from('users')
        .select('delivery_address')
        .eq('id', buyerId)
        .single();

      if (buyerError) {
        console.error('Buyer lookup error:', buyerError);
      } else {
        buyerAddress = buyerData?.delivery_address;
      }
    }

    const addressFrom = sellerAddress ? {
      name: 'Seller',
      street1: sellerAddress.street1 || sellerAddress.street || '',
      street2: sellerAddress.street2 || sellerAddress.address2 || '',
      city: sellerAddress.city || '',
      state: normalizeState(sellerAddress.state || ''),
      zip: sellerAddress.zip || '',
      country: sellerAddress.country || 'CA',
    } : null;

    const addressTo = buyerAddress ? {
      name: 'Buyer',
      street1: buyerAddress.street1 || buyerAddress.street || '',
      street2: buyerAddress.street2 || buyerAddress.address2 || '',
      city: buyerAddress.city || '',
      state: normalizeState(buyerAddress.state || ''),
      zip: buyerAddress.zip || '',
      country: buyerAddress.country || 'CA',
    } : {
      name: 'Buyer',
      street1: '100 Queen St W',
      city: 'Toronto',
      state: 'ON',
      zip: 'M5H 2N2',
      country: 'CA',
    };

    if (!addressFrom) {
      return res.status(400).json({ error: 'Seller address not found' });
    }

    const parcel = {
      length: String(length),
      width: String(width),
      height: String(height),
      distance_unit: distanceUnit,
      weight: String(weight),
      mass_unit: weightUnit,
    };

    const originCountry = addressFrom.country;
    const carrierAccounts = CARRIER_ACCOUNTS_BY_COUNTRY[originCountry] || DEFAULT_CARRIERS;

    console.log('=== RESOLVED PARCEL VALUES ===');
    console.log('distance_unit:', parcel.distance_unit);
    console.log('mass_unit:', parcel.mass_unit);
    console.log('Full parcel:', JSON.stringify(parcel, null, 2));

    const shipment = await shippo.shipments.create({
      addressFrom,
      addressTo,
      parcels: [parcel],
      async: false,
      carrier_accounts: carrierAccounts,
    });

    console.log('Shipment status:', shipment.status);
    console.log('Rates count:', shipment.rates?.length || 0);

    return res.status(200).json({
      success: true,
      rates: shipment.rates || [],
    });
  } catch (error) {
    console.error('Shippo rates error:', error);
    return res.status(500).json({ error: error.message });
  }
};