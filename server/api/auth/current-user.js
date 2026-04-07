// server/api/auth/current-user.js
const { getCurrentUser, checkUserStatus } = require('../../auth/supabase-auth');

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const accessToken = authHeader.slice(7);
  const { data, error } = await getCurrentUser(accessToken);

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  if (!data) {
    return res.status(401).json({ error: 'User not found' });
  }

  const { allowed, error: statusError, status } = await checkUserStatus(data.id);
  if (!allowed) {
    return res.status(403).json({ error: statusError });
  }

  return res.status(200).json({ user: { ...data, accountStatus: status || 'active' } });
};
