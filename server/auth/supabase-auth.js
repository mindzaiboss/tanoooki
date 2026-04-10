// server/auth/supabase-auth.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const signUp = async (email, password, displayName, username, firstName, lastName) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username: displayName, first_name: firstName, last_name: lastName },
    },
  });

  // Save username and names to profile row (created by trigger)
  if (!error && data?.user && username) {
    const normalized = username.toLowerCase().trim();
    await supabase
      .from('users')
      .upsert(
        {
          id: data.user.id,
          email,
          username: normalized,
          first_name: firstName || '',
          last_name: lastName || '',
        },
        { onConflict: 'id' }
      );
  }

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

  // Profile exists (trigger auto-created it), but check if it's complete
  // New users won't have username set yet
  const isProfileComplete = existingProfile?.username && existingProfile.username.trim().length > 0;

  console.log('🔍 Profile check:', {
    userId,
    existingProfile: !!existingProfile,
    isProfileComplete,
    willReturnIsNewUser: !isProfileComplete,
  });

  if (!isProfileComplete) {
    console.log('🟡 Profile incomplete - treating as new user');
    return {
      data: { ...authData, user: { ...authData.user, profile: existingProfile } },
      error: null,
      isNewUser: true,
    };
  }

  console.log('🟢 Profile complete - existing user');
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
