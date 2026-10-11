-- =============================================================================
-- LAMAVI — SUPABASE POSTGRESQL SCHEMA MIGRATION
-- =============================================================================
-- Run this SQL script in your Supabase Project -> SQL Editor before switching
-- LAMAVI_DB_PROVIDER from "local" to "supabase".
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lamavi_users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  recovery_code_salt TEXT NOT NULL,
  recovery_code_hash TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  username_change_timestamps JSONB NOT NULL DEFAULT '[]'::jsonb,
  privacy JSONB NOT NULL DEFAULT '{}'::jsonb,
  notifications JSONB NOT NULL DEFAULT '{}'::jsonb,
  chat_settings JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_lamavi_users_username_lower ON public.lamavi_users (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_lamavi_users_email_lower ON public.lamavi_users (LOWER(email));

CREATE TABLE IF NOT EXISTS public.lamavi_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.lamavi_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lamavi_sessions_user_id ON public.lamavi_sessions (user_id);

CREATE TABLE IF NOT EXISTS public.lamavi_conversations (
  id TEXT PRIMARY KEY,
  participant_ids JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by JSONB NOT NULL DEFAULT '[]'::jsonb,
  cleared_at JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.lamavi_messages (
  id TEXT PRIMARY KEY,
  client_temp_id TEXT,
  conversation_id TEXT NOT NULL REFERENCES public.lamavi_conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES public.lamavi_users(id) ON DELETE CASCADE,
  recipient_id TEXT,
  text TEXT NOT NULL DEFAULT '',
  image_id TEXT,
  reply_to_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  deleted_for JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_lamavi_messages_conversation_id ON public.lamavi_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.lamavi_media (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES public.lamavi_users(id) ON DELETE CASCADE,
  conversation_id TEXT,
  status_id TEXT,
  mime_type TEXT NOT NULL,
  data_base64 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public.lamavi_statuses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.lamavi_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  background_color TEXT NOT NULL DEFAULT '#F2F2F7',
  text_color TEXT NOT NULL DEFAULT '#1C1C1E',
  image_id TEXT,
  privacy TEXT NOT NULL DEFAULT 'everyone',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public.lamavi_status_views (
  id TEXT PRIMARY KEY,
  status_id TEXT NOT NULL REFERENCES public.lamavi_statuses(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES public.lamavi_users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (status_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS public.lamavi_contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.lamavi_users(id) ON DELETE CASCADE,
  contact_user_id TEXT NOT NULL REFERENCES public.lamavi_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_user_id)
);

CREATE TABLE IF NOT EXISTS public.lamavi_blocks (
  id TEXT PRIMARY KEY,
  blocker_id TEXT NOT NULL REFERENCES public.lamavi_users(id) ON DELETE CASCADE,
  blocked_user_id TEXT NOT NULL REFERENCES public.lamavi_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_user_id)
);

CREATE TABLE IF NOT EXISTS public.lamavi_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES public.lamavi_users(id) ON DELETE CASCADE,
  reported_user_id TEXT NOT NULL REFERENCES public.lamavi_users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS) on all tables so only the backend service_role key can read/write directly
ALTER TABLE public.lamavi_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lamavi_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lamavi_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lamavi_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lamavi_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lamavi_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lamavi_status_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lamavi_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lamavi_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lamavi_reports ENABLE ROW LEVEL SECURITY;
