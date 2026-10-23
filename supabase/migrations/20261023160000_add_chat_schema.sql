-- Additive chat schema. This file may be pasted in full into the Supabase SQL
-- Editor after verifying the target project. It is deliberately one-shot.
-- Manual SQL Editor execution does not record this migration in the Supabase
-- CLI migration history; reconcile history before later CLI deployments.
-- Guest/AI messages are handled by the server API after guest-token checks.

BEGIN;

-- Fail before making changes if this project does not have the app's expected
-- Auth roles/product schema, or if chat objects already exist. No product
-- table is modified by this script.
DO $$
DECLARE
  product_column_count INTEGER;
BEGIN
  IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'Supabase Auth schema/functions are missing; stop without applying chat SQL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS required_role(role_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles r
      WHERE r.rolname::TEXT = required_role.role_name
    )
  ) THEN
    RAISE EXCEPTION 'Expected Supabase API roles are missing; stop without applying chat SQL';
  END IF;

  IF to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION 'public.products is missing; verify this is the Thanh Ly project before applying chat SQL';
  END IF;

  SELECT count(DISTINCT column_name)::INTEGER
    INTO product_column_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'products'
    AND column_name IN (
      'product_code', 'name', 'price', 'description',
      'stock_quantity', 'deleted_at', 'created_at'
    );

  IF product_column_count <> 7 THEN
    RAISE EXCEPTION 'public.products is missing columns required by the app chat/catalog integration';
  END IF;

  IF to_regclass('public.chat_staff') IS NOT NULL
    OR to_regclass('public.chat_conversations') IS NOT NULL
    OR to_regclass('public.chat_guest_sessions') IS NOT NULL
    OR to_regclass('public.chat_rate_limits') IS NOT NULL
    OR to_regclass('public.chat_messages') IS NOT NULL
    OR to_regprocedure('public.chat_claim_conversation(uuid)') IS NOT NULL
    OR to_regprocedure('public.chat_create_guest_conversation(text,text,timestamptz)') IS NOT NULL
    OR to_regprocedure('public.chat_consume_rate_limit(text,text,integer,integer)') IS NOT NULL
  THEN
    RAISE EXCEPTION 'One or more chat tables/functions already exist; inspect the project before applying this one-shot script';
  END IF;
END;
$$;

CREATE TABLE public.chat_staff (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN ('ai', 'staff')),
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'in_progress', 'closed')),
  assigned_staff_id UUID REFERENCES public.chat_staff (user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_guest_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_rate_limits (
  subject_hash TEXT NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  bucket TEXT NOT NULL CHECK (bucket IN ('session_create', 'guest_message', 'ai_reply', 'handoff')),
  window_started_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL CHECK (hit_count >= 1),
  PRIMARY KEY (subject_hash, bucket)
);

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations (id) ON DELETE CASCADE,
  sender_kind TEXT NOT NULL CHECK (sender_kind IN ('customer', 'staff', 'ai', 'system')),
  -- Keep the staff UUID as an audit reference if the Auth account is removed.
  sender_user_id UUID,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_staff_identity_check CHECK (
    (sender_kind = 'staff' AND sender_user_id IS NOT NULL)
    OR (sender_kind <> 'staff' AND sender_user_id IS NULL)
  )
);

CREATE INDEX chat_conversations_assigned_status_idx
  ON public.chat_conversations (assigned_staff_id, status, created_at DESC);
CREATE INDEX chat_messages_conversation_created_idx
  ON public.chat_messages (conversation_id, created_at);
CREATE INDEX chat_guest_sessions_conversation_idx
  ON public.chat_guest_sessions (conversation_id);

ALTER TABLE public.chat_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_guest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_rate_limits ENABLE ROW LEVEL SECURITY;

-- Default privileges are explicitly closed. Browser clients never access
-- guest sessions or customer/AI message writes directly.
REVOKE ALL ON TABLE
  public.chat_staff,
  public.chat_conversations,
  public.chat_guest_sessions,
  public.chat_messages,
  public.chat_rate_limits
FROM PUBLIC, anon, authenticated, service_role;

-- Server API receives only the table/column privileges it currently uses.
-- Rate-limit and guest-session writes are owned by SECURITY DEFINER RPCs.
GRANT SELECT ON TABLE public.chat_guest_sessions TO service_role;
GRANT SELECT ON TABLE public.chat_conversations TO service_role;
GRANT UPDATE (channel, status, assigned_staff_id)
  ON TABLE public.chat_conversations TO service_role;
GRANT SELECT ON TABLE public.chat_messages TO service_role;
GRANT INSERT (conversation_id, sender_kind, body)
  ON TABLE public.chat_messages TO service_role;

GRANT SELECT ON TABLE
  public.chat_staff,
  public.chat_conversations,
  public.chat_messages
TO authenticated;
GRANT INSERT (conversation_id, sender_kind, sender_user_id, body)
  ON TABLE public.chat_messages TO authenticated;
GRANT UPDATE (status) ON TABLE public.chat_conversations TO authenticated;

CREATE POLICY chat_staff_read_self
  ON public.chat_staff FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND is_active);

CREATE POLICY chat_staff_read_assigned_conversations
  ON public.chat_conversations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_staff s
      WHERE s.user_id = (SELECT auth.uid()) AND s.is_active
    )
    AND (
      assigned_staff_id = (SELECT auth.uid())
      OR (assigned_staff_id IS NULL AND channel = 'staff' AND status = 'waiting')
    )
  );

CREATE POLICY chat_staff_update_assigned_status
  ON public.chat_conversations FOR UPDATE TO authenticated
  USING (
    assigned_staff_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.chat_staff s
      WHERE s.user_id = (SELECT auth.uid()) AND s.is_active
    )
  )
  WITH CHECK (
    assigned_staff_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.chat_staff s
      WHERE s.user_id = (SELECT auth.uid()) AND s.is_active
    )
  );

CREATE POLICY chat_staff_read_assigned_messages
  ON public.chat_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_conversations c
      JOIN public.chat_staff s ON s.user_id = c.assigned_staff_id
      WHERE c.id = chat_messages.conversation_id
        AND c.assigned_staff_id = (SELECT auth.uid())
        AND s.is_active
    )
  );

CREATE POLICY chat_staff_insert_own_messages
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_kind = 'staff'
    AND sender_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.chat_conversations c
      JOIN public.chat_staff s ON s.user_id = c.assigned_staff_id
      WHERE c.id = chat_messages.conversation_id
        AND c.assigned_staff_id = (SELECT auth.uid())
        AND s.is_active
    )
  );

-- Staff may claim only an unassigned waiting conversation. The update is
-- atomic, so two staff members cannot both claim the same conversation.
CREATE FUNCTION public.chat_claim_conversation(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_staff s
    WHERE s.user_id = auth.uid() AND s.is_active
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.chat_conversations
  SET assigned_staff_id = auth.uid(), status = 'in_progress'
  WHERE id = p_conversation_id
    AND assigned_staff_id IS NULL
    AND channel = 'staff'
    AND status = 'waiting';

  RETURN FOUND;
END;
$$;

-- Server-only transactional conversation/session creation.
CREATE FUNCTION public.chat_create_guest_conversation(
  p_channel TEXT,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_conversation_id UUID;
BEGIN
  IF p_channel NOT IN ('ai', 'staff')
    OR p_token_hash !~ '^[a-f0-9]{64}$'
    OR p_expires_at <= pg_catalog.now()
    OR p_expires_at > pg_catalog.now() + INTERVAL '14 days'
  THEN
    RAISE EXCEPTION 'Invalid chat session parameters' USING ERRCODE = '22023';
  END IF;

  -- Remove only expired/revoked bearer hashes; retain the conversation history.
  DELETE FROM public.chat_guest_sessions
  WHERE expires_at <= pg_catalog.now()
    OR revoked_at <= pg_catalog.now() - INTERVAL '1 day';

  INSERT INTO public.chat_conversations (channel, status)
  VALUES (p_channel, 'waiting')
  RETURNING id INTO new_conversation_id;

  INSERT INTO public.chat_guest_sessions (conversation_id, token_hash, expires_at)
  VALUES (new_conversation_id, p_token_hash, p_expires_at);

  RETURN new_conversation_id;
END;
$$;

-- Durable per-subject counters avoid per-process memory limits on serverless.
CREATE FUNCTION public.chat_consume_rate_limit(
  p_subject_hash TEXT,
  p_bucket TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_hits INTEGER;
BEGIN
  IF p_subject_hash !~ '^[a-f0-9]{64}$'
    OR p_bucket NOT IN ('session_create', 'guest_message', 'ai_reply', 'handoff')
    OR p_max_requests < 1 OR p_max_requests > 1000
    OR p_window_seconds < 1 OR p_window_seconds > 86400
  THEN
    RAISE EXCEPTION 'Invalid rate limit parameters' USING ERRCODE = '22023';
  END IF;

  -- Opportunistically remove stale hashed counters without storing raw IPs.
  IF pg_catalog.random() < 0.01 THEN
    DELETE FROM public.chat_rate_limits
    WHERE window_started_at < pg_catalog.now() - INTERVAL '2 days';
  END IF;

  INSERT INTO public.chat_rate_limits (subject_hash, bucket, window_started_at, hit_count)
  VALUES (p_subject_hash, p_bucket, pg_catalog.clock_timestamp(), 1)
  ON CONFLICT (subject_hash, bucket) DO UPDATE
  SET window_started_at = CASE
        WHEN public.chat_rate_limits.window_started_at
          <= pg_catalog.clock_timestamp() - pg_catalog.make_interval(secs => p_window_seconds)
        THEN pg_catalog.clock_timestamp()
        ELSE public.chat_rate_limits.window_started_at
      END,
      hit_count = CASE
        WHEN public.chat_rate_limits.window_started_at
          <= pg_catalog.clock_timestamp() - pg_catalog.make_interval(secs => p_window_seconds)
        THEN 1
        ELSE public.chat_rate_limits.hit_count + 1
      END
  RETURNING hit_count INTO current_hits;

  RETURN current_hits <= p_max_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_claim_conversation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_claim_conversation(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.chat_create_guest_conversation(TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_create_guest_conversation(TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;
REVOKE ALL ON FUNCTION public.chat_consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;

COMMIT;
