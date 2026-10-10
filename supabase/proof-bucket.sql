-- CK Grounds — payment-proof bucket (run later in Supabase SQL editor).
-- ADR-02/ADR-06: private bucket, jpg/png/webp, <=5MB, 1 file per booking,
-- immutable, no public read. Admin views via server-minted signed URLs
-- (createSignedUrl); customer bytes travel browser -> Storage direct.
--
-- NOTE on anon insert: the strictest safe default below grants writes to
-- service_role only. The booking-submit path mints short-TTL signed upload
-- URLs server-side (later lane), so anon needs NO direct INSERT policy.
-- Do NOT add a public/anon INSERT policy: proof upload stays gated behind
-- the submit transaction's server-minted URL (app-enforced per ADR-06).

-- Private bucket `proofs`, 5 MiB cap, image allowlist.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proofs',
  'proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Service role: full access (server mints upload + signed-read URLs).
DROP POLICY IF EXISTS "proofs_service_role_all" ON storage.objects;
CREATE POLICY "proofs_service_role_all"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'proofs')
WITH CHECK (bucket_id = 'proofs');

-- No public read: belt-and-braces explicit deny for anon/authenticated.
-- (Signed URLs bypass RLS via service_role, so admin/customer reads keep
-- working while direct bucket access stays closed.)
DROP POLICY IF EXISTS "proofs_no_public_read" ON storage.objects;
CREATE POLICY "proofs_no_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (false);
