// server/api/onboarding/saveShippingAddress.js
const { createClient } = require('@supabase/supabase-js');
const log = require('../../log');

/**
 * Save shipping address during onboarding
 */
module.exports = async (req, res) => {
  const { userId, shippingAddress } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  if (
    !shippingAddress ||
    !shippingAddress.street ||
    !shippingAddress.city ||
    !shippingAddress.state ||
    !shippingAddress.zip ||
    !shippingAddress.country
  ) {
    return res.status(400).json({ error: 'Complete shipping address required' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('🔍 Saving shipping address:', { userId, shippingAddress });

    const { data, error } = await supabase
      .from('users')
      .update({ shipping_address: shippingAddress })
      .eq('id', userId)
      .select()
      .single();

    console.log('✅ Supabase response:', { data, error });

    if (error) {
      log.error(error, 'save-shipping-address-failed', { userId });
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      user: data,
    });
  } catch (e) {
    log.error(e, 'save-shipping-address-exception', { userId });
    return res.status(500).json({
      error: 'An unexpected error occurred while saving shipping address',
    });
  }
};
