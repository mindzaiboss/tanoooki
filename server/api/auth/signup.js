// server/api/auth/signup.js
const { signUp } = require('../../auth/supabase-auth');

module.exports = async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing required fields: email, password' });
  }

  const { data, error } = await signUp(email, password, displayName);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({
    user: data.user,
    session: data.session,
  });
};
