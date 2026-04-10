// server/api/auth/admin/update-user-status.js
const { createClient } = require('@supabase/supabase-js');
const { getCurrentUser } = require('../../../auth/supabase-auth');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const VALID_STATUSES = ['active', 'suspended', 'banned'];

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const accessToken = authHeader.slice(7);
  const { data: adminUser, error: authError } = await getCurrentUser(accessToken);
  if (authError || !adminUser || adminUser.email?.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { userId, newStatus } = req.body;
  if (!userId || !newStatus) {
    return res.status(400).json({ error: 'Missing userId or newStatus' });
  }
  if (!VALID_STATUSES.includes(newStatus)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const { data: updated, error } = await supabaseAdmin
    .from('users')
    .update({ status: newStatus })
    .eq('id', userId)
    .select('id, email, username, status, created_at')
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ user: updated });
};
