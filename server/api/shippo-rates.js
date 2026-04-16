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
    '593a940031554e009ddf8068a66a6b47', // UPS Canada (Shippo master)
    '2d5aee00db5b4f77adf3576e90eefff1', // Canada Post (with ZONOS)
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
    console.log('=== SHIPPO REQUEST BODY ===', JSON.stringify(req.body, null, 2));

    const { vendorUsername, buyerId, weight, weightUnit, length, width, height, distanceUnit, originCountry, productPrice, productTitle } = req.body;

    console.log('=== SHIPPO RATES REQUEST ===');
    console.log('vendorUsername:', vendorUsername);
    console.log('buyerId:', buyerId);

    // Lookup seller address from Supabase
    const { data: sellerData, error: sellerError } = await supabase
      .from('users')
      .select('shipping_address, first_name, last_name')
      .eq('username', vendorUsername)
      .single();

    if (sellerError || !sellerData) {
      console.error('Seller lookup error:', sellerError);
      return res.status(400).json({ error: 'Seller address not found' });
    }

    const sellerAddress = sellerData.shipping_address;
    if (!sellerAddress) {
      return res.status(400).json({ error: 'Seller shipping address not configured' });
    }

    const sellerFullName = [sellerData.first_name, sellerData.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || vendorUsername;

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
        console.log('=== BUYER RAW DATA ===', JSON.stringify(buyerData, null, 2));
        console.log('=== BUYER ADDRESS ===', JSON.stringify(buyerAddress, null, 2));
      }
    }

    const addressFrom = sellerAddress ? {
      name: sellerFullName,
      street1: sellerAddress.street1 || sellerAddress.street || '',
      street2: sellerAddress.street2 || sellerAddress.address2 || '',
      city: sellerAddress.city || '',
      state: normalizeState(sellerAddress.state || ''),
      zip: sellerAddress.zip || '',
      country: sellerAddress.country || 'CA',
    } : null;

    // Use a US fallback when seller is CA and buyer address is unknown (CA→US rate estimate)
    const sellerOriginCountry = sellerAddress.country || 'CA';
    const usFallback = sellerOriginCountry === 'CA' ? {
      name: 'Buyer',
      street1: '350 5th Ave',
      street2: '',
      city: 'New York',
      state: 'NY',
      zip: '10118',
      country: 'US',
    } : null;

    const buyerStreet = buyerAddress?.street1 || buyerAddress?.street || '';
    const buyerCity = buyerAddress?.city || '';
    const buyerZip = buyerAddress?.zip || '';
    const hasBuyerAddress = !!(buyerStreet && buyerCity && buyerZip);

    const addressTo = hasBuyerAddress ? {
      name: 'Buyer',
      street1: buyerStreet,
      street2: buyerAddress.street2 || buyerAddress.address2 || '',
      city: buyerCity,
      state: normalizeState(buyerAddress.state || ''),
      zip: buyerZip,
      country: buyerAddress.country || 'CA',
    } : usFallback || {
      name: 'Buyer',
      street1: '100 Queen St W',
      street2: '',
      city: 'Toronto',
      state: 'ON',
      zip: 'M5H 2N2',
      country: 'CA',
    };

    const parcel = {
      length: length.toString(),
      width: width.toString(),
      height: height.toString(),
      distanceUnit: distanceUnit,
      weight: weight.toString(),
      massUnit: weightUnit,
    };

    const sellerCountry = addressFrom.country;
    const destCountry = addressTo.country;
    const productOriginCountry = originCountry || 'CN';

    // ---------------------------------------------------------------------------
    // CA→US: Use ChitChats API instead of Shippo
    // ---------------------------------------------------------------------------
    if (sellerCountry === 'CA' && destCountry === 'US') {
      console.log('=== CA→US: Using ChitChats API ===');
      console.log('hasBuyerAddress:', hasBuyerAddress);
      console.log('addressTo:', JSON.stringify(addressTo, null, 2));

      // Convert weight to oz (ChitChats uses oz)
      const weightInLb = weightUnit === 'kg' ? (parseFloat(weight) * 2.20462) : parseFloat(weight);
      const weightInOz = parseFloat((weightInLb * 16).toFixed(2));

      // Convert dimensions to inches
      const sizeX = distanceUnit === 'cm' ? parseFloat((parseFloat(length) / 2.54).toFixed(1)) : parseFloat(length);
      const sizeY = distanceUnit === 'cm' ? parseFloat((parseFloat(width)  / 2.54).toFixed(1)) : parseFloat(width);
      const sizeZ = distanceUnit === 'cm' ? parseFloat((parseFloat(height) / 2.54).toFixed(1)) : parseFloat(height);

      const itemValue = (parseFloat(productPrice) || 25.00).toFixed(2);

      // Flat root-level fields per ChitChats API docs
      const chitchatsBody = {
        name: addressTo.name,
        address_1: addressTo.street1,
        address_2: addressTo.street2 || '',
        city: addressTo.city,
        province_code: addressTo.state,
        postal_code: addressTo.zip,
        country_code: addressTo.country,
        value: itemValue,
        value_currency: 'usd',
        package_type: 'parcel',
        weight_unit: 'oz',
        weight: weightInOz,
        size_unit: 'in',
        size_x: sizeX,
        size_y: sizeY,
        size_z: sizeZ,
        postage_type: 'unknown',
        ship_date: 'today',
        line_items: [{
          quantity: 1,
          description: 'Designer toy collectible',
          value_amount: itemValue,
          currency_code: 'usd',
          hs_tariff_code: '9503000090',
          origin_country: productOriginCountry,
          weight: weightInOz,
          weight_unit: 'oz',
          manufacturer_contact: 'Manufacturer',
          manufacturer_street: '1 Factory Road',
          manufacturer_city: 'Shenzhen',
          manufacturer_postal_code: '518000',
          manufacturer_province_code: 'GD',
          manufacturer_country_code: productOriginCountry || 'CN',
        }],
      };

      console.log('ChitChats request body:', JSON.stringify(chitchatsBody, null, 2));

      const chitchatsRes = await fetch(
        `https://chitchats.com/api/v1/clients/${process.env.CHITCHATS_CLIENT_ID}/shipments`,
        {
          method: 'POST',
          headers: {
            Authorization: process.env.CHITCHATS_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chitchatsBody),
        }
      );

      const chitchatsData = await chitchatsRes.json();
      console.log('ChitChats response status:', chitchatsRes.status);
      console.log('ChitChats response:', JSON.stringify(chitchatsData, null, 2));

      if (!chitchatsRes.ok) {
        console.error('ChitChats API error:', chitchatsData);
        return res.status(502).json({ error: 'ChitChats rate fetch failed', details: chitchatsData });
      }

      const shipmentId = chitchatsData.shipment?.id;
      const rawRates = chitchatsData.shipment?.rates || [];
      console.log('ChitChats raw rates:', rawRates.length);

      // Delete the draft shipment — we only needed it for rate quotes
      if (shipmentId) {
        fetch(
          `https://chitchats.com/api/v1/clients/${process.env.CHITCHATS_CLIENT_ID}/shipments/${shipmentId}`,
          {
            method: 'DELETE',
            headers: { Authorization: process.env.CHITCHATS_ACCESS_TOKEN },
          }
        ).then(() => console.log('ChitChats draft shipment deleted:', shipmentId))
         .catch(e => console.warn('ChitChats delete failed:', e.message));
      }

      // Normalize to match Shippo rate shape expected by frontend
      const normalized = rawRates.map(r => {
        // Strip redundant "Chit Chats " prefix and normalize "U.S." → "US"
        const cleanName = (r.postage_description || '')
          .replace(/^Chit Chats\s+/i, '')
          .replace('U.S.', 'US');

        // Extract just the day range (e.g. "4-8 estimated business days" → "4-8")
        const daysMatch = (r.delivery_time_description || '').match(/(\d+(?:-\d+)?)/);
        const estimatedDays = daysMatch ? daysMatch[1] : null;

        return {
          objectId: r.postage_type,
          provider: 'ChitChats',
          servicelevel: { name: cleanName },
          amount: (parseFloat(r.purchase_amount) * 1.01 + 0.25).toFixed(2),
          currency: 'USD',
          estimatedDays,
          ddpFees: (parseFloat(r.payment_amount) - parseFloat(r.purchase_amount)).toFixed(2),
        };
      });

      normalized.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));

      return res.status(200).json({
        success: true,
        rates: normalized.slice(0, 3),
      });
    }

    // ---------------------------------------------------------------------------
    // All other routes: use Shippo
    // ---------------------------------------------------------------------------
    const carrierAccounts = CARRIER_ACCOUNTS_BY_COUNTRY[sellerCountry] || [];

    console.log('=== RESOLVED PARCEL VALUES ===');
    console.log('distanceUnit:', parcel.distanceUnit);
    console.log('massUnit:', parcel.massUnit);
    console.log('Full parcel:', JSON.stringify(parcel, null, 2));
    console.log('=== ACTUAL PARCEL BEING SENT ===', JSON.stringify({ addressFrom, addressTo, parcels: [parcel] }, null, 2));

    // Build shipment object
    const shipmentData = {
      addressFrom,
      addressTo,
      parcels: [parcel],
      async: false,
      carrier_accounts: carrierAccounts,
    };

    // Customs declaration for non-CA→US international routes
    if (sellerCountry !== destCountry) {
      let customsValue = parseFloat(productPrice) || 25.00;
      let customsCurrency = 'USD';

      if (sellerCountry === 'CA') {
        customsValue = customsValue * 1.35;
        customsCurrency = 'CAD';
      }

      const truncatedTitle = (productTitle || 'Designer toy collectible').substring(0, 35);

      shipmentData.customs_declaration = {
        contents_type: 'MERCHANDISE',
        contents_explanation: truncatedTitle,
        non_delivery_option: 'RETURN',
        certify: true,
        certify_signer: sellerFullName,
        items: [{
          description: truncatedTitle,
          quantity: 1,
          net_weight: Number(parseFloat(weight).toFixed(2)),
          mass_unit: weightUnit === 'lb' ? 'lb' : 'kg',
          value_amount: Number(customsValue.toFixed(2)),
          value_currency: customsCurrency,
          origin_country: productOriginCountry,
          tariff_number: '950300',
        }],
      };
    }

    console.log('=== FULL SHIPMENT REQUEST ===');
    console.log(JSON.stringify(shipmentData, null, 2));
    console.log('==============================');

    const shipment = await shippo.shipments.create(shipmentData);

    console.log('=== SHIPMENT RESPONSE DEBUG ===');
    console.log('Messages:', JSON.stringify(shipment.messages, null, 2));
    console.log('Status:', shipment.status);
    console.log('Rates count:', shipment.rates?.length || 0);
    console.log('================================');

    console.log('=== ALL RATES FROM SHIPPO (before filtering) ===');
    shipment.rates.forEach(rate => {
      console.log(`${rate.provider} - ${rate.servicelevel.name}: $${rate.amount} ${rate.currency} (${rate.estimatedDays} days)`);
    });
    console.log('===========================================');

    // Service filtering rules by route
    const filterRates = (rates, originCountry, destCountry) => {
      const isCaToCa = originCountry === 'CA' && destCountry === 'CA';
      const isCaToIntl = originCountry === 'CA' && !['CA', 'US'].includes(destCountry);
      const isUsToCa = originCountry === 'US' && destCountry === 'CA';
      const isUsToUs = originCountry === 'US' && destCountry === 'US';
      const isUsToIntl = originCountry === 'US' && !['CA', 'US'].includes(destCountry);

      const filtered = rates.filter(rate => {
        const carrier = rate.provider;
        const service = rate.servicelevel.name;

        // Always block untracked/unreliable services
        if (carrier === 'Canada Post' && service.includes('Regular Parcel')) return false;
        if (carrier === 'Canada Post' && service.includes('Lettermail')) return false;
        if (carrier === 'UPS' && service.includes('Ground Saver')) return false;

        if (isCaToCa) {
          if (carrier === 'Canada Post') return ['Expedited Parcel', 'Xpresspost', 'Priority'].includes(service);
          if (carrier === 'UPS') return service === 'Standard®';
          return false;
        }

        if (isCaToIntl) {
          if (carrier === 'Canada Post') return ['Tracked Packet - International', 'Xpresspost - International', 'Priority Worldwide'].some(s => service.includes(s));
          if (carrier === 'UPS') return ['Standard®', 'Express®'].includes(service);
          return false;
        }

        if (isUsToUs) {
          if (carrier === 'USPS') return ['Ground Advantage', 'Priority Mail', 'Priority Mail Express'].includes(service);
          if (carrier === 'UPS') return ['Ground', '3 Day Select®', '2nd Day Air®'].includes(service);
          return false;
        }

        if (isUsToCa) {
          if (carrier === 'USPS') return ['Priority Mail International', 'Priority Mail Express International'].includes(service);
          if (carrier === 'UPS') return ['Standard®', 'Express®', 'Expedited®'].includes(service);
          return false;
        }

        if (isUsToIntl) {
          if (carrier === 'UPS') return service === 'Standard®';
          return false;
        }

        return true;
      });

      // Apply shipping markup: 1% + minimum $0.25
      const withMarkup = filtered.map(rate => ({
        ...rate,
        amount: (parseFloat(rate.amount) * 1.01 + 0.25).toFixed(2),
      }));

      withMarkup.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
      return withMarkup.slice(0, 3);
    };

    const filteredRates = filterRates(shipment.rates || [], sellerCountry, destCountry);

    return res.status(200).json({
      success: true,
      rates: filteredRates,
    });
  } catch (error) {
    console.error('Shippo rates error:', error);
    return res.status(500).json({ error: error.message });
  }
};