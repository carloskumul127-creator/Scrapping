-- Agregar columnas a la tabla de leads sucios (leads_raw)
ALTER TABLE public.leads_raw
  ADD COLUMN IF NOT EXISTS rating NUMERIC,
  ADD COLUMN IF NOT EXISTS reviews INTEGER,
  ADD COLUMN IF NOT EXISTS sitio_web TEXT,
  ADD COLUMN IF NOT EXISTS maps_url TEXT;

-- Agregar columnas a la tabla de leads limpios/validados (leads_final)
ALTER TABLE public.leads_final
  ADD COLUMN IF NOT EXISTS rating NUMERIC,
  ADD COLUMN IF NOT EXISTS reviews INTEGER,
  ADD COLUMN IF NOT EXISTS sitio_web TEXT,
  ADD COLUMN IF NOT EXISTS maps_url TEXT;
