// server/api/auth/admin/list-users.js
const { createClient } = require('@supabase/supabase-js');
const { getCurrentUser } = require('../../../auth/supabase-auth');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

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

  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, email, display_name, status, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ users });
};
