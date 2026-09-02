// One-off: create the private "avatars" Storage bucket (idempotent).
// Per-user profile pictures uploaded via /api/profile/avatar. Reads
// served via signed URLs (7-day TTL) so the bucket can stay private.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase URL / service role key not set");

const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: existing } = await admin.storage.getBucket("avatars");
  if (existing) {
    console.log("OK — bucket 'avatars' already exists.");
    return;
  }
  const { error } = await admin.storage.createBucket("avatars", {
    public: false,
    fileSizeLimit: "2MB",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error) throw error;
  console.log("OK — created private bucket 'avatars'.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
