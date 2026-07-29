-- Meta Ads accounts per client (ad account ID + access token for Graph API)
CREATE TABLE public.meta_ads_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, ad_account_id)
);

ALTER TABLE public.meta_ads_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_ads_admin" ON public.meta_ads_accounts
  FOR ALL TO authenticated
  USING (is_admin());

CREATE POLICY "meta_ads_client_read" ON public.meta_ads_accounts
  FOR SELECT TO authenticated
  USING (is_own_client(client_id));

CREATE INDEX idx_meta_ads_accounts_client_id ON public.meta_ads_accounts(client_id);
