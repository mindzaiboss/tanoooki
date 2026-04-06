// server/auth/supabase-auth.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const signUp = async (email, password, displayName) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
    },
  });
  return { data, error };
};

const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

const signOut = async accessToken => {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { error } = await client.auth.signOut();
  return { error };
};

const getCurrentUser = async accessToken => {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return { data: null, error: authError };

  const { data: profile, error: profileError } = await client
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  return { data: profile ? { ...user, profile } : user, error: profileError };
};

const refreshSession = async refreshToken => {
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  return { data, error };
};

module.exports = { signUp, signIn, signOut, getCurrentUser, refreshSession };
