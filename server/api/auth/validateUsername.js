// server/api/auth/validateUsername.js
const { createClient } = require('@supabase/supabase-js');
const log = require('../../log');

// NSFW username blocklist (expand as needed)
const BLOCKED_WORDS = [
  'admin', 'administrator', 'root', 'support', 'help', 'api', 'www',
  'fuck', 'shit', 'ass', 'bitch', 'dick', 'cock', 'pussy', 'cunt',
  'nazi', 'hitler', 'porn', 'sex', 'nude', 'xxx',
  'tanoooki', 'tanuki', 'moderator', 'mod', 'official',
];

/**
 * Validate username for availability and appropriateness.
 * POST /api/auth/validate-username
 * Body: { username: string }
 */
module.exports = async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({
      available: false,
      message: 'Username is required',
    });
  }

  const normalizedUsername = username.toLowerCase().trim();

  // Format validation: 3-20 chars, lowercase letters/numbers/underscore/hyphen
  const formatRegex = /^[a-z0-9_-]{3,20}$/;
  if (!formatRegex.test(normalizedUsername)) {
    return res.status(200).json({
      available: false,
      message: 'Username must be 3-20 characters: lowercase letters, numbers, _ or -',
    });
  }

  // NSFW / reserved word check
  const containsBlockedWord = BLOCKED_WORDS.some(word => normalizedUsername.includes(word));
  if (containsBlockedWord) {
    return res.status(200).json({
      available: false,
      message: 'This username is not available',
    });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from('users')
      .select('username')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (error) {
      console.error('🔴 Supabase username query error:', JSON.stringify(error, null, 2));
      log.error(error, 'username-validation-failed', { username: normalizedUsername });
      return res.status(500).json({
        available: false,
        message: 'Could not validate username. Please try again.',
      });
    }

    if (data) {
      return res.status(200).json({
        available: false,
        message: 'This username is already taken',
      });
    }

    return res.status(200).json({
      available: true,
      message: 'Username is available!',
    });
  } catch (e) {
    log.error(e, 'username-validation-exception', { username: normalizedUsername });
    return res.status(500).json({
      available: false,
      message: 'An unexpected error occurred',
    });
  }
};
