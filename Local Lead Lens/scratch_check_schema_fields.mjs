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

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFields() {
  console.log('--- Checking leads_raw columns by selecting them ---');
  
  const possibleRawFields = ['rating', 'reviews', 'sitio_web', 'website', 'stars', 'maps_url', 'google_maps_url', 'maps_link'];
  
  for (const field of possibleRawFields) {
    const { data, error } = await supabase
      .from('leads_raw')
      .select(field)
      .limit(1);
      
    if (error) {
      console.log(`leads_raw has NO column: ${field} (Error: ${error.message})`);
    } else {
      console.log(`leads_raw HAS column: ${field}`);
    }
  }

  console.log('\n--- Checking leads_final columns by selecting them ---');
  
  const possibleFinalFields = ['rating', 'reviews', 'sitio_web', 'website', 'stars', 'maps_url', 'google_maps_url', 'maps_link'];
  
  for (const field of possibleFinalFields) {
    const { data, error } = await supabase
      .from('leads_final')
      .select(field)
      .limit(1);
      
    if (error) {
      console.log(`leads_final has NO column: ${field} (Error: ${error.message})`);
    } else {
      console.log(`leads_final HAS column: ${field}`);
    }
  }
}

checkFields();
