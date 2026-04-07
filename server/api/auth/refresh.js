// server/api/auth/refresh.js
const { refreshSession } = require('../../auth/supabase-auth');

module.exports = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Missing refreshToken' });
  }

  const { data, error } = await refreshSession(refreshToken);

  if (error || !data?.session) {
    return res.status(401).json({ error: error?.message || 'Refresh failed' });
  }

  return res.status(200).json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
};
