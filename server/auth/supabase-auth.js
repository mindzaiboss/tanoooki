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

const checkUserStatus = async userId => {
  const { data, error } = await supabase
    .from('users')
    .select('status')
    .eq('id', userId)
    .single();

  if (error || !data) return { allowed: true, status: 'active' }; // fail open if row missing

  if (data.status === 'banned') {
    return { allowed: false, status: 'banned', error: 'Your account has been banned.' };
  }
  return { allowed: true, status: data.status || 'active' };
};

// OAuth: Sign in with OAuth provider (Google, Facebook, etc.)
// Returns the provider's ID token which can be used to authenticate with Supabase
const signInWithOAuth = async (provider, idToken) => {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider,
    token: idToken,
  });
  return { data, error };
};

// OAuth: Get or create user from OAuth data
// This handles the case where a user signs in with OAuth for the first time
const getOrCreateUserFromOAuth = async (email, firstName, lastName, provider, idToken) => {
  // First, try to authenticate with the idToken
  const { data: authData, error: authError } = await signInWithOAuth(provider, idToken);
  
  if (authError) {
    // If auth fails, it might be a new user - Supabase will auto-create the user
    // when they authenticate, but we may need to update their profile
    return { data: null, error: authError, isNewUser: true };
  }

  if (!authData?.user) {
    return { data: null, error: new Error('No user data returned from OAuth'), isNewUser: false };
  }

  const userId = authData.user.id;

  // Check if user profile exists in our users table
  const { data: existingProfile } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  // If no profile exists, create one
  if (!existingProfile) {
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || email?.split('@')[0] || '';
    
    const { data: newProfile, error: profileError } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        display_name: displayName,
        first_name: firstName || '',
        last_name: lastName || '',
        status: 'active',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (profileError) {
      return { data: authData, error: profileError, isNewUser: true };
    }

    return {
      data: { ...authData, user: { ...authData.user, profile: newProfile } },
      error: null,
      isNewUser: true,
    };
  }

  // Existing user
  return {
    data: { ...authData, user: { ...authData.user, profile: existingProfile } },
    error: null,
    isNewUser: false,
  };
};

module.exports = { 
  signUp, 
  signIn, 
  signOut, 
  getCurrentUser, 
  refreshSession, 
  checkUserStatus, 
  signInWithOAuth,
  getOrCreateUserFromOAuth,
};
