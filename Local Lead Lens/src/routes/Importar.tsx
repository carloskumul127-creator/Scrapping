// src/routes/ImportarLeads.tsx
//
// Página que usa importarLote.ts
// Agrega esta ruta en tu router: { path: '/importar', component: ImportarLeads }

import { importarLote } from '@/integrations/supabase/importarLote'
import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client' // tu hook de sesión existente

export default function ImportarLeads() {
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null)
    })
  }, [])

  const [archivo, setArchivo] = useState<File | null>(null)
  const [nombreLote, setNombreLote] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState<{
    loteId: string
    totalInsertados: number
    totalIgnorados: number
    errores: string[]
  } | null>(null)

  async function manejarImportar() {
    if (!archivo || !nombreLote || !ciudad || !userId) return

    setCargando(true)
    setResultado(null)

    try {
      const res = await importarLote({
        archivo,
        nombreLote,
        ciudad,
        usuarioId: userId!,
      })
      setResultado(res)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: '1.5rem' }}>
        Importar leads desde CSV
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Nombre del lote
          </label>
          <input
            type="text"
            placeholder="ej: Merida_constructoras_2025-05"
            value={nombreLote}
            onChange={(e) => setNombreLote(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4 }}
          />
        </div>

        <div>
          <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Ciudad
          </label>
          <input
            type="text"
            placeholder="ej: Mérida"
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4 }}
          />
        </div>

        <div>
          <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Archivo CSV
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            style={{ display: 'block', marginTop: 4 }}
          />
        </div>

        <button
          onClick={manejarImportar}
          disabled={cargando || !archivo || !nombreLote || !ciudad}
        >
          {cargando ? 'Importando...' : 'Importar'}
        </button>
      </div>

      {resultado && (
        <div style={{
          marginTop: '2rem',
          padding: '1rem 1.25rem',
          background: 'var(--color-background-secondary)',
          borderRadius: 'var(--border-radius-lg)',
          border: '0.5px solid var(--color-border-tertiary)',
        }}>
          <p style={{ fontWeight: 500, marginBottom: 8 }}>Importación completada</p>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            Lote ID: <code>{resultado.loteId}</code>
          </p>
          <p style={{ fontSize: 14, color: 'var(--color-text-success)' }}>
            ✓ {resultado.totalInsertados} leads insertados
          </p>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            ✗ {resultado.totalIgnorados} ignorados (sin teléfono)
          </p>
          {resultado.errores.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-danger)' }}>Errores:</p>
              {resultado.errores.map((e, i) => (
                <p key={i} style={{ fontSize: 12, color: 'var(--color-text-danger)' }}>{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
