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
    // Authenticate with Supabase using the OAuth token
    const { data, error, isNewUser } = await getOrCreateUserFromOAuth(
      email,
      firstName,
      lastName,
      provider,
      idpToken
    );

    if (error) {
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

    if (!data?.session) {
      // No session means we need user confirmation (new user flow)
      // Store OAuth data in cookie for the confirm page
      res.cookie(
        'st-authinfo',
        {
          email,
          firstName,
          lastName,
          idpToken,
          provider,
          from,
          userType,
        },
        {
          maxAge: 15 * 60 * 1000, // 15 minutes
        }
      );

      return res.redirect(`${rootUrl}${defaultConfirm}#`);
    }

    // Successfully authenticated - store tokens in cookies
    // Using the same cookie names as email/password auth for consistency
    res.cookie('supabase-access-token', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 1000, // 1 hour
      sameSite: 'lax',
    });

    res.cookie('supabase-refresh-token', data.session.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'lax',
    });

    // Redirect to the appropriate page
    if (from) {
      return res.redirect(`${rootUrl}${from}#`);
    } else {
      return res.redirect(`${rootUrl}${defaultReturn}#`);
    }
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
