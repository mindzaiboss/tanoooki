const { Shippo } = require('shippo');

const shippo = new Shippo({ apiKeyHeader: process.env.SHIPPO_API_KEY });

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
    const { addressFrom, addressTo, parcel, fromAddress, weight, weightUnit, length, width, height, distanceUnit } = req.body;

    const resolvedAddressFrom = addressFrom || (fromAddress ? {
      name: fromAddress.name || 'Seller',
      street1: fromAddress.streetAddress,
      street2: fromAddress.streetAddress2 || '',
      city: fromAddress.city,
      state: normalizeState(fromAddress.stateProvince),
      zip: fromAddress.postalCode,
      country: fromAddress.country,
    } : null);

    const resolvedParcel = parcel || (weight ? {
      length: String(length),
      width: String(width),
      height: String(height),
      distance_unit: distanceUnit,
      weight: String(weight),
      mass_unit: weightUnit,
    } : null);

    if (!resolvedAddressFrom || !resolvedParcel) {
      return res.status(400).json({ error: 'Missing required fields: addressFrom/fromAddress, parcel/dimensions' });
    }

    const resolvedAddressTo = addressTo || {
      name: 'Buyer',
      street1: '965 Mission St',
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      country: 'US',
    };

    const shipment = await shippo.shipments.create({
      addressFrom: {
        name: resolvedAddressFrom.name || 'Seller',
        street1: resolvedAddressFrom.street1,
        street2: resolvedAddressFrom.street2 || '',
        city: resolvedAddressFrom.city,
        state: resolvedAddressFrom.state,
        zip: resolvedAddressFrom.zip,
        country: resolvedAddressFrom.country,
      },
      addressTo: {
        name: resolvedAddressTo.name || 'Buyer',
        street1: resolvedAddressTo.street1,
        street2: resolvedAddressTo.street2 || '',
        city: resolvedAddressTo.city,
        state: resolvedAddressTo.state,
        zip: resolvedAddressTo.zip,
        country: resolvedAddressTo.country,
      },
      parcels: [{
        length: String(resolvedParcel.length),
        width: String(resolvedParcel.width),
        height: String(resolvedParcel.height),
        distanceUnit: resolvedParcel.distance_unit || resolvedParcel.distanceUnit,
        weight: String(resolvedParcel.weight),
        massUnit: resolvedParcel.mass_unit || resolvedParcel.massUnit,
      }],
      async: false,
    });

    console.log('Shipment status:', shipment.status);
    console.log('Shipment messages:', JSON.stringify(shipment.messages, null, 2));
    console.log('Rates count:', shipment.rates?.length);

    const rates = shipment.rates.map(rate => ({
      rateId: rate.objectId,
      carrier: rate.provider,
      service: rate.servicelevel.name,
      amount: rate.amount,
      currency: rate.currency,
      estimatedDays: rate.estimatedDays,
      durationTerms: rate.durationTerms,
    }));

    res.json({ success: true, rates, shipmentId: shipment.objectId });
  } catch (error) {
    console.error('Shippo rates error:', error.message);
    res.status(500).json({ error: 'Failed to fetch shipping rates', details: error.message });
  }
};