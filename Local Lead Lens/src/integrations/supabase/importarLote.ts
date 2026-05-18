// src/integrations/supabase/importarLote.ts
//
// USO:
//   import { importarLote } from '@/integrations/supabase/importarLote'
//
//   const resultado = await importarLote({
//     archivo: archivoCSV,       // File object del <input type="file">
//     nombreLote: 'Merida_constructoras_2025-05',
//     ciudad: 'Mérida',
//     usuarioId: session.user.id,
//   })

import Papa from 'papaparse'
import { supabase } from './client' // tu cliente supabase ya existente

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OpcionesImportar {
  archivo: File
  nombreLote: string
  ciudad: string
  usuarioId: string
}

interface ResultadoImportar {
  loteId: string
  totalInsertados: number
  totalIgnorados: number  // filas sin teléfono
  errores: string[]
}

// Así viene cada fila de TU CSV de Google Maps
interface FilaCSV {
  'Google maps href': string
  empresa_nombre_bruto: string
  Estrella: string
  'Reseña': string
  categoria_sugerida: string
  direccion_bruta: string
  'Sitio Web': string
  telefono_bruto: string
}

// Así espera la tabla leads_raw en Supabase
interface LeadRawInsert {
  lote_id: string
  empresa_nombre_bruto: string | null
  telefono_bruto: string | null
  categoria_sugerida: string | null
  direccion_bruta: string | null
  procesado: boolean
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function importarLote(opciones: OpcionesImportar): Promise<ResultadoImportar> {
  const { archivo, nombreLote, ciudad, usuarioId } = opciones
  const errores: string[] = []

  // ── PASO 1: Crear el lote en lotes_importacion ──────────────────────────────
  const { data: lote, error: errorLote } = await supabase
    .from('lotes_importacion')
    .insert({
      nombre: nombreLote,
      ciudad,
      creado_por: usuarioId,
      total_registros: 0, // se actualiza al final
    })
    .select('id')
    .single()

  if (errorLote || !lote) {
    throw new Error(`No se pudo crear el lote: ${errorLote?.message}`)
  }

  const loteId = (lote as any).id

  // ── PASO 2: Parsear el CSV ──────────────────────────────────────────────────
  const filas = await parsearCSV(archivo)

  // ── PASO 3: Mapear y filtrar filas ─────────────────────────────────────────
  const leadsParaInsertar: LeadRawInsert[] = []
  let totalIgnorados = 0

  for (const fila of filas) {
    const telefono = limpiarTelefono(fila.telefono_bruto)

    // Regla de oro: sin teléfono, se ignora
    if (!telefono) {
      totalIgnorados++
      continue
    }

    leadsParaInsertar.push({
      lote_id: loteId,
      empresa_nombre_bruto: fila.empresa_nombre_bruto?.trim() || null,
      telefono_bruto: telefono,
      categoria_sugerida: fila.categoria_sugerida?.trim() || null,
      direccion_bruta: normalizarDireccion(fila.direccion_bruta),
      procesado: false,
    })
  }

  // ── PASO 4: Insertar en lotes de 50 (evita timeout en Supabase) ────────────
  const TAMANO_LOTE = 50
  let totalInsertados = 0

  for (let i = 0; i < leadsParaInsertar.length; i += TAMANO_LOTE) {
    const chunk = leadsParaInsertar.slice(i, i + TAMANO_LOTE)

    const { error } = await supabase
      .from('leads_raw')
      .insert(chunk)

    if (error) {
      errores.push(`Error en filas ${i}–${i + chunk.length}: ${error.message}`)
    } else {
      totalInsertados += chunk.length
    }
  }

  // ── PASO 5: Actualizar total_registros en el lote ──────────────────────────
  await supabase
    .from('lotes_importacion')
    .update({ total_registros: totalInsertados })
    .eq('id', loteId)

  return {
    loteId,
    totalInsertados,
    totalIgnorados,
    errores,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsearCSV(archivo: File): Promise<FilaCSV[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<FilaCSV>(archivo, {
      header: true,         // usa la primera fila como keys
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete: (resultado) => resolve(resultado.data),
      error: (error) => reject(new Error(`Error al parsear CSV: ${error.message}`)),
    })
  })
}

function limpiarTelefono(valor: string | undefined | null): string | null {
  if (!valor) return null

  // Quita espacios, guiones, paréntesis — deja solo dígitos
  const soloDigitos = valor.replace(/\D/g, '')

  // Descarta si tiene menos de 7 dígitos (no es un teléfono real)
  if (soloDigitos.length < 7) return null

  // Descarta si parece una dirección que se coló en el campo teléfono
  if (valor.toLowerCase().includes('calle') || valor.toLowerCase().includes('av.')) return null

  return soloDigitos
}

function normalizarDireccion(valor: string | undefined | null): string | null {
  if (!valor) return null

  const limpio = valor.trim()

  // El scraper a veces pone "Cómo llegar" o "·" cuando no hay dirección
  if (limpio === 'Cómo llegar' || limpio === '·' || limpio === '') return null

  return limpio
}
