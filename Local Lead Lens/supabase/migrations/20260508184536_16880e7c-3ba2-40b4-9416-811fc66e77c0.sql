
-- Download history
CREATE TABLE public.downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry TEXT NOT NULL,
  city TEXT,
  scope TEXT NOT NULL DEFAULT 'city', -- 'city' | 'industry' | 'all' | 'single'
  contact_count INT NOT NULL DEFAULT 0,
  contact_titles TEXT[] NOT NULL DEFAULT '{}',
  filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.downloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "downloads_public_read"   ON public.downloads FOR SELECT USING (true);
CREATE POLICY "downloads_public_insert" ON public.downloads FOR INSERT WITH CHECK (true);
CREATE POLICY "downloads_public_delete" ON public.downloads FOR DELETE USING (true);

CREATE INDEX downloads_created_at_idx ON public.downloads (created_at DESC);

-- Per-contact overrides (WhatsApp type, hidden)
CREATE TABLE public.contact_overrides (
  phone TEXT PRIMARY KEY,
  title TEXT,
  whatsapp_type TEXT, -- 'business' | 'normal' | 'fixed' | null
  hidden BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "overrides_public_read"   ON public.contact_overrides FOR SELECT USING (true);
CREATE POLICY "overrides_public_insert" ON public.contact_overrides FOR INSERT WITH CHECK (true);
CREATE POLICY "overrides_public_update" ON public.contact_overrides FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "overrides_public_delete" ON public.contact_overrides FOR DELETE USING (true);
