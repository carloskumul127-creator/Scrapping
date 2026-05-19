import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env manually
const envContent = fs.readFileSync('.env', 'utf-8');

let supabaseUrl = '';
let supabaseKey = '';

for (const line of envContent.split('\n')) {
  if (line.trim().startsWith('VITE_SUPABASE_URL=')) {
    supabaseUrl = line.split('=')[1].trim().replace(/['"]/g, '');
  }
  if (line.trim().startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) {
    supabaseKey = line.split('=')[1].trim().replace(/['"]/g, '');
  }
}

async function fetchSchema() {
  const url = `${supabaseUrl}/rest/v1/?apikey=${supabaseKey}`;
  console.log('Fetching OpenAPI schema from:', url);
  try {
    const res = await fetch(url);
    const json = await res.json();
    
    console.log('=== Definitions keys ===');
    console.log(Object.keys(json.definitions || {}));
  } catch (err) {
    console.error('Error fetching schema:', err);
  }
}

fetchSchema();
