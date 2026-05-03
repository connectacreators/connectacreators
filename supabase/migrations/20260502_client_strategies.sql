-- client_strategies: one row per client, stores content strategy config
CREATE TABLE IF NOT EXISTS client_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  -- Monthly targets
  posts_per_month integer NOT NULL DEFAULT 20,
  scripts_per_month integer NOT NULL DEFAULT 20,
  videos_edited_per_month integer NOT NULL DEFAULT 20,
  stories_per_week integer NOT NULL DEFAULT 10,
  -- Content mix percentages (must sum to 100)
  mix_reach integer NOT NULL DEFAULT 60,
  mix_trust integer NOT NULL DEFAULT 30,
  mix_convert integer NOT NULL DEFAULT 10,
  -- Platform
  primary_platform text NOT NULL DEFAULT 'instagram',
  -- ManyChat
  manychat_active boolean NOT NULL DEFAULT false,
  manychat_keyword text,
  cta_goal text NOT NULL DEFAULT 'manychat',
  -- Ads
  ads_active boolean NOT NULL DEFAULT false,
  ads_budget integer NOT NULL DEFAULT 0,
  ads_goal text,
  -- Audience alignment scores (0-10, set manually by agency)
  audience_score integer NOT NULL DEFAULT 5,
  uniqueness_score integer NOT NULL DEFAULT 5,
  -- Monetization
  monthly_revenue_goal integer NOT NULL DEFAULT 0,
  monthly_revenue_actual integer NOT NULL DEFAULT 0,
  -- Content pillars
  content_pillars jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

CREATE OR REPLACE FUNCTION update_client_strategies_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER client_strategies_updated_at
  BEFORE UPDATE ON client_strategies
  FOR EACH ROW EXECUTE FUNCTION update_client_strategies_updated_at();

ALTER TABLE client_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_strategies_access" ON client_strategies FOR ALL USING (
  client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
    UNION
    SELECT id FROM clients c WHERE EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'user', 'videographer')
    )
  )
);
