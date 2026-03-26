const { Shippo } = require('shippo');

const shippo = new Shippo({ apiKeyHeader: process.env.SHIPPO_API_KEY });

module.exports = async (req, res) => {
  try {
    const { addressFrom, addressTo, parcel } = req.body;

    if (!addressFrom || !addressTo || !parcel) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // v2 SDK uses camelCase
    const shipment = await shippo.shipments.create({
      addressFrom: {
        name: addressFrom.name,
        street1: addressFrom.street1,
        street2: addressFrom.street2 || '',
        city: addressFrom.city,
        state: addressFrom.state,
        zip: addressFrom.zip,
        country: addressFrom.country,
      },
      addressTo: {
        name: addressTo.name,
        street1: addressTo.street1,
        street2: addressTo.street2 || '',
        city: addressTo.city,
        state: addressTo.state,
        zip: addressTo.zip,
        country: addressTo.country,
      },
      parcels: [{
        length: parcel.length,
        width: parcel.width,
        height: parcel.height,
        distanceUnit: parcel.distance_unit,
        weight: parcel.weight,
        massUnit: parcel.mass_unit,
      }],
      async: false,
    });

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