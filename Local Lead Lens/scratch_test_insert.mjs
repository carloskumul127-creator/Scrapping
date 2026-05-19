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

async function testInsert() {
  console.log('--- Testing insert to leads_raw with rating, reviews, sitio_web, maps_url ---');
  
  // 1. Create a dummy lote first to satisfy foreign key if needed
  const { data: lote, error: errorLote } = await supabase
    .from('lotes_importacion')
    .insert({
      nombre_archivo: 'test_lote_schema',
      origen: 'Test',
      total_registros: 1,
    })
    .select('*')
    .single();

  if (errorLote) {
    console.error('Error creating lote:', errorLote);
    return;
  }
  
  console.log('Lote created:', lote);
  const loteId = lote.identificacion || lote.id; // lotes_importacion uses either id or identificacion
  
  // 2. Try inserting to leads_raw with all columns
  const testRawRow = {
    lote_id: loteId,
    empresa_nombre_bruto: 'Test Business Name',
    telefono_bruto: '529999999999',
    categoria_sugerida: 'Test Category',
    direccion_bruta: 'Test Address',
    procesado: false,
    status: false,
    // Let's test these:
    rating: 4.5,
    reviews: 120,
    sitio_web: 'https://example.com',
    maps_url: 'https://maps.google.com/?cid=123',
    // also try different variations just in case
    stars: 4.5,
    google_maps_url: 'https://maps.google.com/?cid=123',
    website: 'https://example.com',
  };

  for (const col of ['rating', 'reviews', 'sitio_web', 'maps_url', 'stars', 'google_maps_url', 'website']) {
    console.log(`\nInserting single col ${col} to see if it is accepted...`);
    const payload = {
      lote_id: loteId,
      empresa_nombre_bruto: 'Test Business Name',
      telefono_bruto: '529999999999',
      [col]: col === 'reviews' ? 120 : (col === 'rating' || col === 'stars' ? 4.5 : 'https://example.com')
    };
    
    const { data, error } = await supabase
      .from('leads_raw')
      .insert(payload)
      .select('*');
      
    if (error) {
      console.log(`Col ${col} FAILED:`, error.message);
    } else {
      console.log(`Col ${col} SUCCEEDED! Row inserted:`, data[0]);
    }
  }

  // Clean up
  await supabase.from('lotes_importacion').delete().eq(lote.identificacion ? 'identificacion' : 'id', loteId);
}

testInsert();
