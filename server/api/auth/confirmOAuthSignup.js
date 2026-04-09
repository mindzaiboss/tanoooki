// server/api/auth/confirmOAuthSignup.js
const { getOrCreateUserFromOAuth } = require('../../auth/supabase-auth');
const log = require('../../log');

/**
 * Complete OAuth signup after user confirmation.
 * This is called from the ConfirmPage after the user has reviewed
 * their profile information from the OAuth provider.
 */
module.exports = async (req, res) => {
  const { email, firstName, lastName, idpToken, provider, ...additionalData } = req.body || {};

  if (!email || !idpToken || !provider) {
    return res.status(400).json({ 
      error: 'Missing required fields: email, idpToken, provider' 
    });
  }

  try {
    // Authenticate and create user profile with Supabase
    const { data, error } = await getOrCreateUserFromOAuth(
      email,
      firstName,
      lastName,
      provider,
      idpToken
    );

    if (error) {
      log.error(error, 'confirm-oauth-signup-failed', { email, provider });
      return res.status(400).json({ error: error.message });
    }

    if (!data?.session) {
      return res.status(401).json({ 
        error: 'Failed to create session after OAuth confirmation' 
      });
    }

    // Clear the OAuth info cookie since we're done with it
    res.clearCookie('st-authinfo');

    // Return the user and session data
    return res.status(200).json({
      user: data.user,
      session: data.session,
    });
  } catch (e) {
    log.error(e, 'confirm-oauth-signup-exception', { email, provider });
    return res.status(500).json({ 
      error: 'An unexpected error occurred during OAuth signup confirmation' 
    });
  }
};
