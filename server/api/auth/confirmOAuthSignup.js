// server/api/auth/confirmOAuthSignup.js
const { getOrCreateUserFromOAuth } = require('../../auth/supabase-auth');
const log = require('../../log');

/**
 * Complete OAuth signup after user confirmation.
 * This is called from the ConfirmPage after the user has reviewed
 * their profile information from the OAuth provider.
 */
module.exports = async (req, res) => {
  console.log('📝 Confirm OAuth signup request:', JSON.stringify(req.body, null, 2));

  // Email, firstName, lastName are in the cookie, not the request body
  const authInfo = req.cookies['st-authinfo'];
  if (!authInfo) {
    return res.status(400).json({
      error: 'Missing authentication info. Please start OAuth flow again.',
    });
  }

  const { email, firstName, lastName, idpId: cookieIdpId } = authInfo;

  // Get idpToken and idpId from request body
  const { idpToken, idpId, username, ...additionalData } = req.body || {};

  // Accept either 'provider' or 'idpId' for backwards compatibility
  const provider = idpId || cookieIdpId || req.body.provider;

  console.log('🔍 OAuth signup data:', { email, firstName, lastName, provider, hasToken: !!idpToken });

  if (!email || !idpToken || !provider) {
    return res.status(400).json({
      error: 'Missing required fields: email, idpToken, provider/idpId',
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
        error: 'Failed to create session after OAuth confirmation',
      });
    }

    // Save username, first_name, last_name
    if (username) {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const normalizedUsername = username.toLowerCase().trim();
      const { error: updateError } = await supabase
        .from('users')
        .update({
          username: normalizedUsername,
          first_name: firstName || '',
          last_name: lastName || '',
        })
        .eq('id', data.user.id);
      if (updateError) {
        console.error('Failed to save user profile:', updateError);
      } else {
        console.log('✅ User profile saved:', { username: normalizedUsername, firstName, lastName });
      }
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
