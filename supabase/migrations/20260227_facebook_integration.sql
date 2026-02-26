-- Facebook Lead Ads Integration
-- Tables for storing connected FB pages, cached lead forms, and extending existing tables

-- Stores each connected Facebook Page per client (page tokens never expire)
CREATE TABLE public.facebook_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  connected_by UUID REFERENCES auth.users(id),
  is_subscribed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, page_id)
);

ALTER TABLE public.facebook_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facebook_pages_admin" ON public.facebook_pages
  FOR ALL TO authenticated
  USING (is_admin());

CREATE POLICY "facebook_pages_client" ON public.facebook_pages
  FOR SELECT TO authenticated
  USING (is_own_client(client_id));

CREATE INDEX idx_facebook_pages_client_id ON public.facebook_pages(client_id);
CREATE INDEX idx_facebook_pages_page_id ON public.facebook_pages(page_id);

-- Caches available lead forms per page (refreshed on demand from Graph API)
CREATE TABLE public.facebook_lead_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  form_id TEXT NOT NULL,
  form_name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, form_id)
);

ALTER TABLE public.facebook_lead_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facebook_lead_forms_admin" ON public.facebook_lead_forms
  FOR ALL TO authenticated
  USING (is_admin());

CREATE POLICY "facebook_lead_forms_client" ON public.facebook_lead_forms
  FOR SELECT TO authenticated
  USING (is_own_client(client_id));

CREATE INDEX idx_facebook_lead_forms_client_id ON public.facebook_lead_forms(client_id);
CREATE INDEX idx_facebook_lead_forms_page_id ON public.facebook_lead_forms(page_id);

-- Extend leads table for dedup and tracking
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS facebook_lead_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS facebook_form_id TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_facebook_lead_id ON public.leads(facebook_lead_id)
  WHERE facebook_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_facebook_form_id ON public.leads(facebook_form_id)
  WHERE facebook_form_id IS NOT NULL;

-- Extend client_workflows with page filter
ALTER TABLE public.client_workflows
  ADD COLUMN IF NOT EXISTS facebook_page_id TEXT;
