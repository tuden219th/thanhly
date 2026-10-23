# Thanh Lý chat: architecture and security notes

## What is present in the workspace

- `src/components/ChatWidget.tsx` is mounted in the shared Next.js root layout.
  It has AI/staff entry points, message history, error/offline/loading states,
  a human handoff action, and polling while the panel is open.
- Guest routes live under `/api/chat/sessions`. They create a session, read and
  append messages, and move an AI conversation to the staff queue.
- The staff inbox is `/quanly/tin-nhan`. It uses existing Supabase Auth in the
  browser and depends on chat table grants/RLS for every read/write. Staff poll
  every five seconds; chat Realtime is intentionally not enabled.
- The AI adapter calls Groq from the server only when `GROQ_API_KEY` and
  `GROQ_MODEL` are configured. It reads at most 50 active product records from
  `public.products` and supplies their verified code, name, price, description,
  and stock quantity as context. A catalog query failure stops the AI answer.
- `.env.example` documents variable names with placeholders. No real credentials,
  account, AI SDK, or model download is included. Groq API calls can incur usage
  charges for the configured model.

## Workspace and Supabase limits

The repository contains no checked-in base schema for `public.products`,
project `supabase/config.toml`, local database connection, or production
credentials. The only pre-existing migrations alter `products`; they do not
show the current Auth profile model, grants, or production RLS. The operator
reported applying the chat migration in Supabase; this checkout does not verify
the resulting deployed schema or policies. The pgTAP test has not been run
because the Supabase CLI and Docker are unavailable here.

## Guest access and API

1. `POST /api/chat/sessions` accepts only `channel: "ai" | "staff"` from the
   same origin. The server generates a 32-byte cryptographically random
   base64url token. Only its SHA-256 hex digest is stored, with a 14-day expiry.
   The raw token is set as an HttpOnly, SameSite=Lax cookie scoped to that
   conversation's API path; it is not returned in JSON or readable by client JS.
2. Every guest `GET`/`POST /messages` and `POST /handoff` request must include
   the scoped cookie (legacy bearer authorization is also accepted). The server
   hashes it and queries the session using both the digest and requested
   conversation ID, checks expiry/revocation, then performs work with the
   service-role client. An ID alone never grants access.
3. The public and authenticated browser roles have no grants on guest sessions,
   rate-limit rows, or direct conversation creation. Customer and AI messages
   are inserted only by the API, which chooses `sender_kind` itself. The chat
   SQL revokes broad table access from `service_role`, then grants only session
   reads, conversation reads/limited updates, and message reads/inserts; RPCs
   perform session and rate-limit writes.
4. The API limits request body size and message length. A PostgreSQL RPC stores
   atomic rate counters. IP fingerprints are HMACs; message counters use the
   SHA-256 token digest. Session creation uses a trusted `x-real-ip` address
   supplied by the reverse proxy; production must configure the proxy to
   overwrite that header. If it is absent/invalid, session creation fails
   closed. In development, the local loopback address is used.
5. The browser stores only the conversation ID and channel in `sessionStorage`
   so the same tab can resume after refresh. The credential stays in the
   HttpOnly cookie; it is not exposed to page scripts or persisted in JS storage.

The service-role key bypasses RLS, so API handlers must continue to verify the
token, conversation, expiry, and rate limit before each operation. Never log
the cookie, Authorization header, raw token, service key, or message contents
for routine diagnostics.

## Staff access and assignment

- A staff user must first sign in through the existing Supabase Auth login and
  have an active row in `public.chat_staff`. The inbox checks this row before
  displaying data.
- RLS limits staff reads to their assigned conversations and metadata for the
  unassigned staff queue. Message reads become available only after a staff
  member claims an unassigned waiting staff conversation.
- `chat_claim_conversation` is atomic: only an active authenticated staff user
  can claim an unassigned waiting staff conversation. The first successful
  claim sets the authenticated user's UUID as assignee.
- Staff can change status and insert a message only into an assigned
  conversation. The policy requires `sender_kind = 'staff'` and
  `sender_user_id = auth.uid()`; the frontend values are not trusted on their
  own. Direct update of assignment, sender spoofing, message edits/deletes,
  and customer/AI writes are not granted.
- Staff membership must be provisioned by a trusted database administrator
  after the target Supabase Auth account is created. Do not create a default
  staff user or password in the application.

## AI provider and product grounding

The adapter calls Groq's OpenAI-compatible chat completions endpoint using
server-only `GROQ_API_KEY` and `GROQ_MODEL`; it has no provider SDK. The example
model is `openai/gpt-oss-120b`. Groq currently lists it at $0.15 per million
input tokens and $0.60 per million output tokens. Configure account spending
limits before enabling real AI requests. Without either variable, AI requests
return an explicit configuration error. The prompt directs the model
to use only the supplied current catalog facts for price/stock, and to ask the
customer to contact staff when facts are missing. This is a grounding measure,
not a mathematical guarantee against model error; production needs human
review/monitoring before relying on generated product claims. Chat history and
catalog context leave the app host for processing by Groq; review its current
privacy and retention terms before enabling it for customers.

## Local setup and review

1. Copy `.env.example` to `.env.local`. In the Supabase Dashboard, use the
   project's **Project URL** and an `anon`/publishable public key for
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Use a
   server-only service-role key for `SUPABASE_SERVICE_ROLE_KEY`. Generate a
   unique random `CHAT_RATE_LIMIT_SECRET` locally (at least 32 characters).
   Keep `.env.local` out of Git. Never use a service-role key in a
   `NEXT_PUBLIC_*` variable.
2. The repository has no `supabase/config.toml` and no baseline migration that
   creates `public.products`. Existing product migrations assume that table
   already exists. A clean `supabase db reset` may therefore fail before the
   chat migration. Do not delete or skip those migrations to force a green
   reset: first obtain/review the project's baseline schema, then use an
   isolated local database or staging project with that schema. Supabase CLI
   local development requires a container runtime such as Docker Desktop.
   The chat SQL preflights the required Supabase roles/Auth function, expected
   product columns, and absence of existing chat objects; it aborts before DDL
   if these checks fail. It does not alter `products`.

   Pasting this script in Dashboard SQL Editor does not record the migration
   version in `supabase_migrations.schema_migrations`. Reconcile the CLI history
   before a later `supabase db push` so the migration is not applied twice.
3. Apply the migration and run `supabase test db` only against local/disposable
   or staging Supabase. The test file uses fixed fixture UUIDs and rolls back;
   still run it in an isolated test DB after reviewing the schema baseline.
   The CLI and Docker were unavailable during this implementation, so the RLS
   suite remains unexecuted; no RLS pass is claimed.
4. For Groq AI, configure the server-only `GROQ_API_KEY` and an active
   `GROQ_MODEL`. The adapter sends non-streaming JSON to
   `https://api.groq.com/openai/v1/chat/completions` and aborts after 30 seconds.
   Requests can incur model usage charges; check current pricing and account
   spending limits before enabling AI. Missing credentials, unavailable models,
   rate limits, network errors, and provider failures return safe API errors;
   no AI response is fabricated.
5. Create/invite staff through Supabase Auth in the same local/staging project.
   A trusted DB administrator then inserts that account UUID into
   `public.chat_staff` with `is_active = true`. Staff sign in through
   `/quanly/login` and open `/quanly/tin-nhan`; disabling the row revokes inbox
   access. Never share service-role credentials with staff accounts.
6. Start the app with `npm run dev`. Test a guest staff message, claim and reply
   from the staff inbox, then verify the reply appears in the guest tab. For AI,
   verify the configured Groq model is available and review usage pricing before
   sending a test prompt; test handoff while confirming the same
   conversation history remains visible. Run `npm run test:chat-security` for
   local token/message unit tests. The guest token remains in tab memory, so a
   full page reload loses that guest session credential.

## Remaining launch choices

- The reverse proxy must provide a trustworthy `x-real-ip` header.
- Decide transcript retention/deletion, privacy wording, and who may provision
  staff accounts.
- Review Groq pricing, retention/privacy terms, and spending limits before
  enabling the configured model in a public environment.
- Run the migration and pgTAP suite in a non-production Supabase environment,
  then test guest A/B isolation and staff permissions end to end before launch.
