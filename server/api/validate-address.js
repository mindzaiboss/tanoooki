const { Shippo } = require('shippo');
const shippo = new Shippo({ apiKeyHeader: process.env.SHIPPO_API_KEY });

module.exports = async (req, res) => {
  try {
    const { street1, street2, city, state, zip, country } = req.body;

    const address = await shippo.addresses.create({
      street1: '1 Main St', // placeholder — we only care about city/state/zip validation
      street2: '',
      city,
      state: state || '',
      zip: zip || '',
      country,
      validate: true,
    });

    console.log('Shippo address validation result:', JSON.stringify(address, null, 2));

    const validationResults = address.validationResults || {};
    const isValid = validationResults.isValid !== false;
    const messages = (validationResults.messages || []).map(m => ({
      text: m.text || m.message || String(m),
    }));

    // Build suggested correction from Shippo's normalized values
    const suggested = {
      street1: street1, // always keep user's original street
      street2: street2 || '',
      city: address.city || city,
      state: address.state || state,
      zip: address.zip || zip,
      country: address.country || country,
    };

    // Detect if Shippo corrected city, state, or zip (case-insensitive)
    const normalize = s => (s || '').trim().toUpperCase();
    // Only compare the base zip (first 5 chars for US, ignore ZIP+4 extension)
    const baseZip = s => normalize(s).split('-')[0];

    const hasSuggestion =
      normalize(suggested.city) !== normalize(city) ||
      normalize(suggested.state) !== normalize(state) ||
      baseZip(suggested.zip) !== baseZip(zip);

    res.json({
      success: true,
      isValid,
      hasSuggestion,
      suggested,
      messages,
    });
  } catch (error) {
    console.error('Address validation error:', error.message);
    res.status(500).json({
      error: 'Address validation failed. Please check your address and try again.',
      details: error.message,
    });
  }
};
