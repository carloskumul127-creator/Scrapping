import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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

console.log('Using Supabase URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
  console.log('--- checking lotes_importacion ---');
  const { data: lotes, error: errLotes } = await supabase
    .from('lotes_importacion')
    .select('*')
    .limit(1);
  if (errLotes) console.error(errLotes);
  else console.log('lotes:', lotes);

  console.log('--- checking leads_raw ---');
  const { data: raw, error: errRaw } = await supabase
    .from('leads_raw')
    .select('*')
    .limit(1);
  if (errRaw) console.error(errRaw);
  else console.log('raw:', raw);

  console.log('--- checking leads_final ---');
  const { data: final, error: errFinal } = await supabase
    .from('leads_final')
    .select('*')
    .limit(1);
  if (errFinal) console.error(errFinal);
  else console.log('final:', final);

  console.log('--- checking categorias ---');
  const { data: cats, error: errCats } = await supabase
    .from('categorias')
    .select('*')
    .limit(1);
  if (errCats) console.error(errCats);
  else console.log('categorias:', cats);

  console.log('--- checking joined query ---');
  const { data: joined, error: errJoined } = await supabase
    .from('leads_final')
    .select(`
      id,
      nombre_empresa,
      telefono_e164,
      tipo_whatsapp,
      leads_raw (
        direccion_bruta,
        categoria_sugerida,
        lotes_importacion (
          origen,
          nombre_archivo
        )
      ),
      categorias (
        nombre
      )
    `)
    .limit(3);
  if (errJoined) console.error(errJoined);
  else console.log('joined sample:', JSON.stringify(joined, null, 2));
}

checkColumns();
