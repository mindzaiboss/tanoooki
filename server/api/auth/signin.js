// server/api/auth/signin.js
const { signIn } = require('../../auth/supabase-auth');

module.exports = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing required fields: email, password' });
  }

  const { data, error } = await signIn(email, password);

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  return res.status(200).json({
    user: data.user,
    session: data.session,
  });
};
