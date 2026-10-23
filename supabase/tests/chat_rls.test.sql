BEGIN;

SELECT plan(38);

-- Explicit least-privilege assertions for the server role and staff role.
SELECT ok(NOT has_table_privilege('service_role', 'public.chat_staff', 'SELECT'), 'service role cannot read staff membership table');
SELECT ok(NOT has_table_privilege('service_role', 'public.chat_rate_limits', 'SELECT'), 'service role cannot read rate-limit rows directly');
SELECT ok(has_table_privilege('service_role', 'public.chat_guest_sessions', 'SELECT'), 'server can verify guest sessions');
SELECT ok(has_column_privilege('service_role', 'public.chat_messages', 'conversation_id', 'INSERT'), 'server can insert API messages');
SELECT ok(NOT has_column_privilege('service_role', 'public.chat_messages', 'sender_user_id', 'INSERT'), 'server cannot set a staff sender UUID');
SELECT ok(NOT has_table_privilege('service_role', 'public.chat_messages', 'DELETE'), 'server cannot delete chat messages');
SELECT ok(has_function_privilege('authenticated', 'public.chat_claim_conversation(uuid)', 'EXECUTE'), 'authenticated role can call the staff claim RPC');
SELECT ok(NOT has_function_privilege('service_role', 'public.chat_claim_conversation(uuid)', 'EXECUTE'), 'server role cannot claim as a staff member');
SELECT ok(has_function_privilege('service_role', 'public.chat_create_guest_conversation(text,text,timestamptz)', 'EXECUTE'), 'server can create guest sessions through the RPC');
SELECT ok(has_function_privilege('service_role', 'public.chat_consume_rate_limit(text,text,integer,integer)', 'EXECUTE'), 'server can consume rate limits through the RPC');

-- Isolated fixtures for `supabase test db`; all rows are rolled back below.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'chat-staff-1@test.invalid', '', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'chat-staff-2@test.invalid', '', now(), now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chat_staff (user_id, is_active)
VALUES
  ('00000000-0000-4000-8000-000000000101', TRUE),
  ('00000000-0000-4000-8000-000000000102', TRUE)
ON CONFLICT (user_id) DO UPDATE SET is_active = EXCLUDED.is_active;

INSERT INTO public.chat_conversations (id, channel, status, assigned_staff_id)
VALUES
  ('00000000-0000-4000-8000-000000000201', 'staff', 'in_progress', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000202', 'staff', 'in_progress', '00000000-0000-4000-8000-000000000102'),
  ('00000000-0000-4000-8000-000000000203', 'staff', 'waiting', NULL);

INSERT INTO public.chat_guest_sessions (conversation_id, token_hash, expires_at)
VALUES
  ('00000000-0000-4000-8000-000000000201', repeat('a', 64), now() + interval '1 day'),
  ('00000000-0000-4000-8000-000000000202', repeat('b', 64), now() + interval '1 day');

INSERT INTO public.chat_messages (id, conversation_id, sender_kind, body)
VALUES
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 'customer', 'Fixture message 1'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000202', 'customer', 'Fixture message 2'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000203', 'customer', 'Unassigned queue fixture');

SET LOCAL ROLE anon;
SELECT throws_ok('SELECT id FROM public.chat_conversations', '42501', NULL, 'anon cannot read conversations');
SELECT throws_ok('SELECT id FROM public.chat_messages', '42501', NULL, 'anon cannot read messages');
SELECT throws_ok('SELECT token_hash FROM public.chat_guest_sessions', '42501', NULL, 'anon cannot read guest session hashes');
SELECT throws_ok('SELECT subject_hash FROM public.chat_rate_limits', '42501', NULL, 'anon cannot read rate-limit fingerprints');
SELECT throws_ok('INSERT INTO public.chat_messages (conversation_id, sender_kind, body) VALUES (''00000000-0000-4000-8000-000000000201'', ''customer'', ''x'')', '42501', NULL, 'anon cannot write messages');
SELECT throws_ok('INSERT INTO public.chat_conversations (channel) VALUES (''staff'')', '42501', NULL, 'anon cannot create a conversation directly');
SELECT throws_ok('UPDATE public.chat_conversations SET status = ''closed''', '42501', NULL, 'anon cannot update conversations');
SELECT throws_ok('DELETE FROM public.chat_messages', '42501', NULL, 'anon cannot delete messages');
SELECT throws_ok('SELECT public.chat_claim_conversation(''00000000-0000-4000-8000-000000000203'')', '42501', NULL, 'anon cannot call the staff claim RPC');
SELECT throws_ok('SELECT public.chat_create_guest_conversation(''staff'', repeat(''c'', 64), now() + interval ''1 day'')', '42501', NULL, 'anon cannot create sessions through the server-only RPC');
SELECT throws_ok('SELECT public.chat_consume_rate_limit(repeat(''c'', 64), ''session_create'', 8, 3600)', '42501', NULL, 'anon cannot call rate-limit RPC');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', TRUE);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::INT FROM public.chat_conversations), 2, 'staff sees assigned conversations and the unassigned staff queue');
SELECT is((SELECT count(*)::INT FROM public.chat_messages), 1, 'staff reads messages only for an assigned conversation');
SELECT lives_ok('INSERT INTO public.chat_messages (conversation_id, sender_kind, sender_user_id, body) VALUES (''00000000-0000-4000-8000-000000000201'', ''staff'', ''00000000-0000-4000-8000-000000000101'', ''Staff reply'')', 'assigned staff can send a message as themselves');
SELECT throws_ok('INSERT INTO public.chat_messages (conversation_id, sender_kind, body) VALUES (''00000000-0000-4000-8000-000000000201'', ''ai'', ''Pretend AI reply'')', '42501', NULL, 'staff cannot spoof an AI sender');
SELECT throws_ok('INSERT INTO public.chat_messages (conversation_id, sender_kind, sender_user_id, body) VALUES (''00000000-0000-4000-8000-000000000201'', ''staff'', ''00000000-0000-4000-8000-000000000102'', ''Pretend colleague'')', '42501', NULL, 'staff cannot set another sender UUID');
SELECT throws_ok('UPDATE public.chat_conversations SET assigned_staff_id = ''00000000-0000-4000-8000-000000000102'' WHERE id = ''00000000-0000-4000-8000-000000000201''', '42501', NULL, 'staff cannot reassign a conversation');
SELECT lives_ok('UPDATE public.chat_conversations SET status = ''closed'' WHERE id = ''00000000-0000-4000-8000-000000000201''', 'assigned staff can update its conversation status');
SELECT throws_ok('DELETE FROM public.chat_messages WHERE id = ''00000000-0000-4000-8000-000000000301''', '42501', NULL, 'staff cannot delete messages');
SELECT ok(public.chat_claim_conversation('00000000-0000-4000-8000-000000000203'), 'active staff can claim an unassigned staff conversation');
SELECT is((SELECT count(*)::INT FROM public.chat_conversations), 2, 'claimed conversation appears in staff inbox');
SELECT is((SELECT count(*)::INT FROM public.chat_messages), 3, 'staff can read messages after claiming a conversation');
SELECT throws_ok('SELECT public.chat_create_guest_conversation(''staff'', repeat(''c'', 64), now() + interval ''1 day'')', '42501', NULL, 'staff cannot create guest sessions directly');
SELECT throws_ok('SELECT public.chat_consume_rate_limit(repeat(''c'', 64), ''session_create'', 8, 3600)', '42501', NULL, 'staff cannot change rate-limit counters');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', TRUE);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::INT FROM public.chat_conversations), 1, 'other staff cannot see assigned conversations outside their access');
SELECT is((SELECT count(*)::INT FROM public.chat_messages), 1, 'other staff cannot read another staff member messages');
SELECT throws_ok('INSERT INTO public.chat_messages (conversation_id, sender_kind, sender_user_id, body) VALUES (''00000000-0000-4000-8000-000000000201'', ''staff'', ''00000000-0000-4000-8000-000000000102'', ''Unauthorized reply'')', '42501', NULL, 'staff cannot write to a colleague conversation');
SELECT ok(NOT public.chat_claim_conversation('00000000-0000-4000-8000-000000000203'), 'another staff member cannot claim an already claimed conversation');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
