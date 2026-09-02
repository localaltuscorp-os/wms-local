// One-off: create the private "documents" Storage bucket (idempotent).
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase URL / service role key not set");

const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: existing } = await admin.storage.getBucket("documents");
  if (existing) {
    console.log("OK — bucket 'documents' already exists.");
    return;
  }
  const { error } = await admin.storage.createBucket("documents", {
    public: false,
    fileSizeLimit: "25MB",
  });
  if (error) throw error;
  console.log("OK — created private bucket 'documents'.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
