// src/integrations/supabase/importarLote.ts
//
// USO:
//   import { importarLote } from '@/integrations/supabase/importarLote'
//
//   const resultado = await importarLote({
//     archivo: archivoCSV,
//     nombreLote: 'Merida_constructoras_2025-05',
//     ciudad: 'Mérida',
//     usuarioId: session.user.id,
//   })

import Papa from 'papaparse'
import { supabase } from './client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OpcionesImportar {
  archivo: File
  nombreLote: string
  ciudad: string
  usuarioId: string | null
}

interface ResultadoImportar {
  loteId: string
  totalInsertados: number
  totalIgnorados: number
  errores: string[]
  advertencias: string[]  // filas con datos parciales que igual se insertaron
}

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

interface LeadRawInsert {
  lote_id: string
  empresa_nombre_bruto: string
  telefono_bruto: string
  categoria_sugerida: string | null
  direccion_bruta: string | null
  procesado: boolean
  status: boolean               // false = pendiente, true = limpio/validado
}

// Cache local para no consultar la misma categoría múltiples veces en el mismo lote
const cacheCategoriasId = new Map<string, string>()

// ─── Función principal ────────────────────────────────────────────────────────

export async function importarLote(opciones: OpcionesImportar): Promise<ResultadoImportar> {
  const { archivo, nombreLote, ciudad, usuarioId } = opciones
  const errores: string[] = []
  const advertencias: string[] = []

  // Limpiar cache al inicio de cada importación
  cacheCategoriasId.clear()

  // ── PASO 1: Crear el lote en lotes_importacion ──────────────────────────────
  const { data, error: errorLote } = await (supabase.from('lotes_importacion') as any)
    .insert({
      nombre_archivo: nombreLote,
      origen: ciudad,
      total_registros: 0,
      usuario_id: usuarioId || null,
    })
    .select('identificacion')
    .single()

  const lote = data as any

  if (errorLote || !lote) {
    throw new Error(`No se pudo crear el lote: ${errorLote?.message}`)
  }

  const loteId = lote.identificacion

  // ── PASO 2: Parsear el CSV ──────────────────────────────────────────────────
  const filas = await parsearCSV(archivo)

  // ── PASO 3: Validar y mapear filas ─────────────────────────────────────────
  const leadsParaInsertar: LeadRawInsert[] = []
  let totalIgnorados = 0

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i]
    const numFila = i + 2 // +2 porque la fila 1 es el header del CSV

    // ── REGLA 1: Nombre de empresa obligatorio ──────────────────────────────
    const nombreEmpresa = fila.empresa_nombre_bruto?.trim()
    if (!nombreEmpresa) {
      totalIgnorados++
      errores.push(`Fila ${numFila}: sin nombre de empresa — fila ignorada`)
      continue
    }

    // ── REGLA 2: Teléfono obligatorio ───────────────────────────────────────
    const telefono = limpiarTelefono(fila.telefono_bruto)
    if (!telefono) {
      totalIgnorados++
      errores.push(`Fila ${numFila} ("${nombreEmpresa}"): sin teléfono válido — fila ignorada`)
      continue
    }

    // ── REGLA 3: Categoría — buscar o crear en tabla categorias ────────────
    const categoriaRaw = fila.categoria_sugerida?.trim() || null
    let categoriaId: string | null = null

    if (categoriaRaw) {
      categoriaId = await obtenerOCrearCategoria(categoriaRaw, advertencias)
    } else {
      advertencias.push(`Fila ${numFila} ("${nombreEmpresa}"): sin categoría — se insertará sin categoría`)
    }

    leadsParaInsertar.push({
      lote_id: loteId,
      empresa_nombre_bruto: nombreEmpresa,
      telefono_bruto: telefono,
      categoria_sugerida: categoriaRaw,
      direccion_bruta: normalizarDireccion(fila.direccion_bruta),
      procesado: false,
      status: false, // siempre empieza como pendiente
    })
  }

  // ── PASO 4: Insertar en chunks de 50 ───────────────────────────────────────
  const TAMANO_CHUNK = 50
  let totalInsertados = 0

  for (let i = 0; i < leadsParaInsertar.length; i += TAMANO_CHUNK) {
    const chunk = leadsParaInsertar.slice(i, i + TAMANO_CHUNK)

    const { error } = await (supabase.from('leads_raw') as any)
      .insert(chunk)

    if (error) {
      errores.push(`Error insertando filas ${i + 1}–${i + chunk.length}: ${error.message}`)
    } else {
      totalInsertados += chunk.length
    }
  }

  // ── PASO 5: Actualizar total_registros en el lote ──────────────────────────
  await (supabase.from('lotes_importacion') as any)
    .update({ total_registros: totalInsertados })
    .eq('identificacion', loteId)

  return {
    loteId,
    totalInsertados,
    totalIgnorados,
    errores,
    advertencias,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Busca la categoría en la tabla categorias.
 * Si no existe, la crea automáticamente.
 * Usa cache local para no hacer múltiples queries por la misma categoría.
 */
async function obtenerOCrearCategoria(
  nombre: string,
  advertencias: string[]
): Promise<string | null> {
  const nombreNormalizado = nombre.trim()

  // 1. Revisar cache primero
  if (cacheCategoriasId.has(nombreNormalizado)) {
    return cacheCategoriasId.get(nombreNormalizado)!
  }

  // 2. Buscar en la base de datos (case-insensitive)
  const { data } = await (supabase.from('categorias') as any)
    .select('id')
    .ilike('nombre', nombreNormalizado)
    .single()

  const existente = data as any

  if (existente) {
    cacheCategoriasId.set(nombreNormalizado, existente.id)
    return existente.id
  }

  // 3. No existe → crear automáticamente
  const { data: dataNueva, error } = await (supabase.from('categorias') as any)
    .insert({ nombre: nombreNormalizado, activa: true })
    .select('id')
    .single()

  const nueva = dataNueva as any

  if (error || !nueva) {
    advertencias.push(`No se pudo crear la categoría "${nombreNormalizado}": ${error?.message}`)
    return null
  }

  advertencias.push(`Categoría nueva creada automáticamente: "${nombreNormalizado}"`)
  cacheCategoriasId.set(nombreNormalizado, nueva.id)
  return nueva.id
}

function parsearCSV(archivo: File): Promise<FilaCSV[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<FilaCSV>(archivo, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete: (resultado) => resolve(resultado.data),
      error: (error) => reject(new Error(`Error al parsear CSV: ${error.message}`)),
    })
  })
}

function limpiarTelefono(valor: string | undefined | null): string | null {
  if (!valor) return null

  const soloDigitos = valor.replace(/\D/g, '')

  if (soloDigitos.length < 7) return null

  if (valor.toLowerCase().includes('calle') || valor.toLowerCase().includes('av.')) return null

  return soloDigitos
}

function normalizarDireccion(valor: string | undefined | null): string | null {
  if (!valor) return null

  const limpio = valor.trim()

  if (limpio === 'Cómo llegar' || limpio === '·' || limpio === '') return null

  return limpio
}