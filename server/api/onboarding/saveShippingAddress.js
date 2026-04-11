// server/api/onboarding/saveShippingAddress.js
const { createClient } = require('@supabase/supabase-js');
const log = require('../../log');

/**
 * Save delivery and shipping addresses during onboarding
 */
module.exports = async (req, res) => {
  const { userId, deliveryAddress, shippingAddress } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  if (!deliveryAddress || !deliveryAddress.street || !deliveryAddress.city ||
      !deliveryAddress.state || !deliveryAddress.zip || !deliveryAddress.country) {
    return res.status(400).json({ error: 'Complete delivery address required' });
  }

  // Validate shipping address if provided
  if (shippingAddress && (!shippingAddress.street || !shippingAddress.city ||
      !shippingAddress.state || !shippingAddress.zip || !shippingAddress.country)) {
    return res.status(400).json({ error: 'Incomplete shipping address provided' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from('users')
      .update({
        delivery_address: deliveryAddress,
        shipping_address: shippingAddress, // NULL if same as delivery
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      log.error(error, 'save-addresses-failed', { userId });
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      user: data,
    });
  } catch (e) {
    log.error(e, 'save-addresses-exception', { userId });
    return res.status(500).json({
      error: 'An unexpected error occurred while saving addresses',
    });
  }
};
