// server/api/auth/loginWithSupabaseOAuth.js
const log = require('../../log.js');
const { getOrCreateUserFromOAuth } = require('../../auth/supabase-auth');

const rootUrl = process.env.REACT_APP_MARKETPLACE_ROOT_URL;

/**
 * Handle OAuth callback from Google/Facebook using Supabase
 * 
 * @param {Error} err - Error from passport authentication
 * @param {Object} user - User data from OAuth provider
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {String} provider - OAuth provider ('google' or 'facebook')
 */
module.exports = async (err, user, req, res, provider) => {
  console.log('🔵 OAuth callback hit!', { provider, hasUser: !!user, hasError: !!err });

  if (err) {
    log.error(err, 'fetching-user-data-from-idp-failed');

    return res
      .cookie(
        'st-autherror',
        {
          status: err.status,
          code: err.code,
          message: err.message,
        },
        {
          maxAge: 15 * 60 * 1000, // 15 minutes
        }
      )
      .redirect(`${rootUrl}/login#`);
  }

  if (!user) {
    log.error(
      new Error('Failed to fetch user details from identity provider'),
      'fetching-user-data-from-idp-failed'
    );

    return res
      .cookie(
        'st-autherror',
        {
          status: 'Bad Request',
          code: 400,
          message: 'Failed to fetch user details from identity provider!',
        },
        {
          maxAge: 15 * 60 * 1000, // 15 minutes
        }
      )
      .redirect(`${rootUrl}/login#`);
  }

  const { email, firstName, lastName, idpToken, from, defaultReturn, defaultConfirm, userType } = user;

  try {
    console.log('🔵 Attempting Supabase OAuth...', { email, provider });

    // Authenticate with Supabase using the OAuth token
    const { data, error, isNewUser } = await getOrCreateUserFromOAuth(
      email,
      firstName,
      lastName,
      provider,
      idpToken
    );

    if (error) {
      console.log('🔴 Supabase OAuth failed:', error);
      log.error(error, 'supabase-oauth-auth-failed', { email, provider });
      
      return res
        .cookie(
          'st-autherror',
          {
            status: 'Authentication Failed',
            code: 401,
            message: error.message || 'OAuth authentication failed',
          },
          {
            maxAge: 15 * 60 * 1000,
          }
        )
        .redirect(`${rootUrl}/login#`);
    }

    if (isNewUser) {
      // New user — redirect to profile completion form
      console.log('🟡 New user detected - redirecting to profile completion');
      const cookieData = {
        email,
        firstName,
        lastName,
        idpToken: idpToken || 'oauth-token',
        idpId: provider, // Frontend expects this field name, not 'provider'
        from,
        userType,
      };

      console.log('🍪 Setting cookie with data:', JSON.stringify(cookieData, null, 2));

      res.cookie('st-authinfo', cookieData, {
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      return res.redirect(`${rootUrl}${defaultConfirm}#`);
    }

    // Existing user — pass tokens via URL hash (standard OAuth pattern)
    // The frontend handleSupabaseAuthCallback in app.js reads hash-based tokens
    console.log('🟢 Existing user - logging in with tokens');
    const targetPath = from || defaultReturn || '/';
    const tokenHash = `#access_token=${encodeURIComponent(data.session.access_token)}&refresh_token=${encodeURIComponent(data.session.refresh_token)}`;

    return res.redirect(`${rootUrl}${targetPath}${tokenHash}`);
  } catch (error) {
    log.error(error, 'oauth-login-exception', { email, provider });
    
    return res
      .cookie(
        'st-autherror',
        {
          status: 'Internal Server Error',
          code: 500,
          message: 'An unexpected error occurred during authentication',
        },
        {
          maxAge: 15 * 60 * 1000,
        }
      )
      .redirect(`${rootUrl}/login#`);
  }
};
