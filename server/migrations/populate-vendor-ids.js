// server/migrations/populate-vendor-ids.js
// One-time migration to set vendor_id = id for all users where vendor_id is NULL
// Run with: node -r dotenv/config server/migrations/populate-vendor-ids.js

const { createClient } = require('@supabase/supabase-js');

async function populateVendorIds() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('Fetching users with NULL vendor_id...');

  const { data: users, error: fetchError } = await supabase
    .from('users')
    .select('id, username, vendor_id')
    .is('vendor_id', null);

  if (fetchError) {
    console.error('Error fetching users:', fetchError);
    return;
  }

  console.log(`Found ${users.length} users without vendor_id`);

  for (const user of users) {
    console.log(`Updating user ${user.username} (${user.id})...`);

    const { error: updateError } = await supabase
      .from('users')
      .update({ vendor_id: user.id })
      .eq('id', user.id);

    if (updateError) {
      console.error(`Error updating user ${user.id}:`, updateError);
    } else {
      console.log(`✓ Set vendor_id = ${user.id} for ${user.username}`);
    }
  }

  console.log('Done!');
}

populateVendorIds();
