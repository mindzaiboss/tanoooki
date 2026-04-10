// server/api/profile/updateProfile.js
const { createClient } = require('@supabase/supabase-js');
const log = require('../../log');

/**
 * Update user profile (username, firstName, lastName, bio, etc.)
 */
module.exports = async (req, res) => {
  const { userId, username, firstName, lastName, bio, phoneNumber } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const updateData = {
      first_name: firstName?.trim() || null,
      last_name: lastName?.trim() || null,
      bio: bio?.trim() || null,
    };

    // Only include username if it's provided and different
    if (username) {
      updateData.username = username.toLowerCase().trim();
    }

    if (phoneNumber) {
      updateData.phone_number = phoneNumber;
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      log.error(error, 'profile-update-failed', { userId });
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      user: data,
    });
  } catch (e) {
    log.error(e, 'profile-update-exception', { userId });
    return res.status(500).json({
      error: 'An unexpected error occurred while updating profile',
    });
  }
};
