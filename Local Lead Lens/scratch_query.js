const supabaseUrl = 'https://lngkslnffxpfiviizaox.supabase.co';
const supabaseKey = 'sb_publishable_aaVYGIOsANmVvlTQJNy-pg_eXwmaXDh';

async function main() {
  console.log('Fetching OpenAPI schema from root...');
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    method: 'GET',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    }
  });

  console.log('Response Status:', res.status, res.statusText);
  const text = await res.text();
  console.log('Body length:', text.length);
  if (text.length > 0) {
    try {
      const parsed = JSON.parse(text);
      console.log('=== Definitions keys ===');
      console.log(Object.keys(parsed.definitions || {}));
      
      if (parsed.definitions) {
        if (parsed.definitions.leads_raw) {
          console.log('--- leads_raw properties ---');
          console.log(Object.keys(parsed.definitions.leads_raw.properties || {}));
        }
        if (parsed.definitions.leads_final) {
          console.log('--- leads_final properties ---');
          console.log(Object.keys(parsed.definitions.leads_final.properties || {}));
        }
      }
    } catch (e) {
      console.log('Body is not JSON:', text.substring(0, 500));
    }
  }
}

main();

