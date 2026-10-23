-- Add soft delete support for products.
-- Safe, additive migration: does not delete or overwrite existing product rows.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at
  ON public.products (deleted_at);

CREATE INDEX IF NOT EXISTS idx_products_deleted_by
  ON public.products (deleted_by);

-- Optional: allow easy listing/filtering by active/inactive rows.
CREATE INDEX IF NOT EXISTS idx_products_active
  ON public.products (created_at DESC)
  WHERE deleted_at IS NULL;

-- RLS notes:
-- The existing public.products policies should remain in place.
-- This migration does not open more privileges than the current authenticated-admin flow.
-- The app itself must continue using the authenticated session and not the service-role key.

-- Example policy for admin-only soft delete/restore with the current auth model:
-- This is a template to apply in Supabase SQL editor after verifying auth roles/users.
--
-- CREATE POLICY "Admins can soft delete products"
-- ON public.products
-- FOR UPDATE
-- USING (
--   auth.role() = 'authenticated'
--   AND EXISTS (
--     SELECT 1
--     FROM public.profiles p
--     WHERE p.id = auth.uid()
--       AND p.is_admin = true
--   )
-- )
-- WITH CHECK (
--   auth.role() = 'authenticated'
--   AND EXISTS (
--     SELECT 1
--     FROM public.profiles p
--     WHERE p.id = auth.uid()
--       AND p.is_admin = true
--   )
-- );
--
-- CREATE POLICY "Authenticated users can view active products"
-- ON public.products
-- FOR SELECT
-- USING (deleted_at IS NULL);
--
-- CREATE POLICY "Authenticated users can view deleted products for restore"
-- ON public.products
-- FOR SELECT
-- USING (
--   auth.role() = 'authenticated'
--   AND EXISTS (
--     SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
--   )
-- );
