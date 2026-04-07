// server/api/auth/signin.js
const { signIn, checkUserStatus } = require('../../auth/supabase-auth');

module.exports = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing required fields: email, password' });
  }

  const { data, error } = await signIn(email, password);

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  const { allowed, error: statusError, status } = await checkUserStatus(data.user.id);
  if (!allowed) {
    return res.status(403).json({ error: statusError });
  }

  return res.status(200).json({
    user: { ...data.user, accountStatus: status || 'active' },
    session: data.session,
  });
};
