// server/api/auth/signin.js
const { signIn, checkUserStatus } = require('../../auth/supabase-auth');

module.exports = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing required fields: email or username, password' });
  }

  // Allow login with username (no @ sign) or email
  let loginEmail = email;
  if (!email.includes('@')) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('username', email.toLowerCase().trim())
      .single();
    if (user) {
      loginEmail = user.email;
    } else {
      return res.status(400).json({ error: 'No account found with that username' });
    }
  }

  const { data, error } = await signIn(loginEmail, password);

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
