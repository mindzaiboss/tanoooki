// server/api/auth/signup.js
const { signUp } = require('../../auth/supabase-auth');

module.exports = async (req, res) => {
  const { email, password, username, firstName, lastName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing required fields: email, password' });
  }

  const displayName = username?.toLowerCase().trim() || '';
  const { data, error } = await signUp(email, password, displayName, username, firstName, lastName);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({
    user: data.user,
    session: data.session,
  });
};
