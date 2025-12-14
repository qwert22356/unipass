-- UniPass OAuth Gateway - Database Schema
-- Run this in your MASTER Supabase project SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Developers Table
-- ============================================================================
-- Stores developer accounts with their subscription plans
CREATE TABLE IF NOT EXISTS developers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business', 'enterprise')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment
COMMENT ON TABLE developers IS 'Developer accounts with subscription plans';
COMMENT ON COLUMN developers.plan IS 'Subscription plan: free, pro, business, or enterprise';

-- ============================================================================
-- Projects Table
-- ============================================================================
-- Stores developer applications that use the OAuth gateway
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  frontend_base_url TEXT NOT NULL,
  supabase_url TEXT NOT NULL,
  supabase_service_role_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment
COMMENT ON TABLE projects IS 'Developer applications using UniPass OAuth Gateway';
COMMENT ON COLUMN projects.owner_id IS 'Supabase Auth user ID of the project owner';
COMMENT ON COLUMN projects.frontend_base_url IS 'Base URL of the frontend application';
COMMENT ON COLUMN projects.supabase_url IS 'Supabase project URL for this app';
COMMENT ON COLUMN projects.supabase_service_role_key IS 'Supabase service role key (encrypted at rest)';

-- ============================================================================
-- OAuth Credentials Table
-- ============================================================================
-- Stores OAuth provider credentials for each project
CREATE TABLE IF NOT EXISTS oauth_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  extra JSONB DEFAULT '{}'::JSONB,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, provider)
);

-- Add comment
COMMENT ON TABLE oauth_credentials IS 'OAuth provider credentials for each project';
COMMENT ON COLUMN oauth_credentials.provider IS 'Provider name: wechat, qq, douyin, dingtalk, weibo, etc.';
COMMENT ON COLUMN oauth_credentials.client_id IS 'OAuth client ID (AppID)';
COMMENT ON COLUMN oauth_credentials.client_secret IS 'OAuth client secret (AppSecret)';
COMMENT ON COLUMN oauth_credentials.extra IS 'Additional provider-specific configuration';
COMMENT ON COLUMN oauth_credentials.enabled IS 'Whether this provider is active';

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_developers_email ON developers(email);
CREATE INDEX IF NOT EXISTS idx_developers_plan ON developers(plan);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_oauth_creds_project ON oauth_credentials(project_id);
CREATE INDEX IF NOT EXISTS idx_oauth_creds_provider ON oauth_credentials(provider);
CREATE INDEX IF NOT EXISTS idx_oauth_creds_enabled ON oauth_credentials(enabled);

-- ============================================================================
-- Updated Timestamp Trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_developers_updated_at
  BEFORE UPDATE ON developers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_credentials_updated_at
  BEFORE UPDATE ON oauth_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
ALTER TABLE developers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_credentials ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role has full access to developers"
  ON developers FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to projects"
  ON projects FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to oauth_credentials"
  ON oauth_credentials FOR ALL
  USING (auth.role() = 'service_role');

-- Users can view and update their own developer record
CREATE POLICY "Users can view own developer record"
  ON developers FOR SELECT
  USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own developer record"
  ON developers FOR UPDATE
  USING (auth.uid()::text = id::text);

-- Users can only see their own projects
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = owner_id);

-- Users can only manage credentials for their own projects
CREATE POLICY "Users can view credentials for own projects"
  ON oauth_credentials FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = oauth_credentials.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert credentials for own projects"
  ON oauth_credentials FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = oauth_credentials.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update credentials for own projects"
  ON oauth_credentials FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = oauth_credentials.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete credentials for own projects"
  ON oauth_credentials FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = oauth_credentials.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- Example Data (for testing)
-- ============================================================================
-- Uncomment to insert test data:

-- INSERT INTO developers (id, email, plan)
-- VALUES (
--   'your-developer-uuid',
--   'developer@example.com',
--   'free'
-- );

-- INSERT INTO projects (id, owner_id, name, frontend_base_url, supabase_url, supabase_service_role_key)
-- VALUES (
--   'abc123-test-app',
--   'your-developer-uuid',
--   'Test Application',
--   'https://yourapp.com',
--   'https://your-app-project.supabase.co',
--   'your-app-service-role-key'
-- );

-- INSERT INTO oauth_credentials (project_id, provider, client_id, client_secret, enabled)
-- VALUES 
--   ('abc123-test-app', 'wechat', 'wx1234567890', 'your-wechat-secret', TRUE),
--   ('abc123-test-app', 'qq', '1234567890', 'your-qq-secret', TRUE),
--   ('abc123-test-app', 'douyin', 'dy1234567890', 'your-douyin-secret', TRUE);
