// src/types/database.ts
// Tipos generados manualmente basados en el schema real de Supabase
// Actualizar cuando se agreguen columnas nuevas

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Enums / Literales ────────────────────────────────────────────────────────

export type TipoWhatsapp = 'business' | 'normal' | 'fijo' | null

// ─── Tablas ───────────────────────────────────────────────────────────────────

export interface Categoria {
  id: string
  nombre: string
  activa: boolean
  created_at: string
  updated_at: string
}

export interface LoteImportacion {
  id: string
  nombre_archivo: string
  origen: string | null         // ciudad
  total_registros: number
  usuario_id: string | null
  importado_en: string          // timestamptz
}

export interface LeadRaw {
  id: string
  lote_id: string
  empresa_nombre_bruto: string
  telefono_bruto: string
  categoria_sugerida: string | null   // texto libre tal como vino del CSV
  categoria_id: string | null         // FK → categorias.id
  direccion_bruta: string | null
  procesado: boolean                  // true = ya pasó a leads_final
  status: boolean                     // false = pendiente | true = limpio/validado
  created_at: string
  updated_at: string
}

export interface LeadFinal {
  id: string
  raw_id: string                      // FK → leads_raw.id
  nombre_empresa: string
  telefono_e164: string               // formato +52XXXXXXXXXX
  tipo_whatsapp: TipoWhatsapp
  categoria_id: string | null         // FK → categorias.id
  // más columnas pueden existir en Supabase — agregar según necesites
}

export interface ApiCredencial {
  id: string
  nombre: string
  proveedor: 'whatsapp'
  token: string
  phone_number_id: string | null
  waba_id: string | null
  activa: boolean
  requests_por_dia: number
  requests_usados_hoy: number
  ultimo_reset: string              // date
  created_at: string
  updated_at: string
}

export interface Usuario {
  id: string
  // completar según tu tabla usuarios en Supabase
}

export interface Rol {
  id: string
  // completar según tu tabla roles en Supabase
}

// ─── Tipos de inserción (sin id ni timestamps, los pone Supabase) ─────────────

export type LeadRawInsert = Omit<LeadRaw, 'id' | 'created_at' | 'updated_at'>
export type LeadFinalInsert = Omit<LeadFinal, 'id'>
export type CategoriaInsert = Omit<Categoria, 'id' | 'created_at' | 'updated_at'>
export type ApiCredencialInsert = Omit<ApiCredencial, 'id' | 'created_at' | 'updated_at'>
export type LoteImportacionInsert = Omit<LoteImportacion, 'id' | 'importado_en'>

// ─── Tipo Database (para el cliente de Supabase tipado) ───────────────────────

export interface Database {
  public: {
    Tables: {
      categorias: {
        Row: Categoria
        Insert: CategoriaInsert
        Update: Partial<CategoriaInsert>
      }
      leads_raw: {
        Row: LeadRaw
        Insert: LeadRawInsert
        Update: Partial<LeadRawInsert>
      }
      leads_final: {
        Row: LeadFinal
        Insert: LeadFinalInsert
        Update: Partial<LeadFinalInsert>
      }
      lotes_importacion: {
        Row: LoteImportacion
        Insert: LoteImportacionInsert
        Update: Partial<LoteImportacionInsert>
      }
      api_credenciales: {
        Row: ApiCredencial
        Insert: ApiCredencialInsert
        Update: Partial<ApiCredencialInsert>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
