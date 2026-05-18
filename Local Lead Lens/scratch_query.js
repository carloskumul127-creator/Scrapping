import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lngkslnffxpfiviizaox.supabase.co';
const supabaseKey = 'sb_publishable_aaVYGIOsANmVvlTQJNy-pg_eXwmaXDh';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: finalData, error: finalError } = await supabase.from('leads_final').select('*').limit(1);
  const { data: rawData, error: rawError } = await supabase.from('leads_raw').select('*').limit(1);

  console.log('leads_final keys:', finalData ? Object.keys(finalData[0] || {}) : finalError);
  console.log('leads_raw keys:', rawData ? Object.keys(rawData[0] || {}) : rawError);
}

main();
