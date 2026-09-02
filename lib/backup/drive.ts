import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GOOGLE_SCOPES, getServiceAccountToken } from "@/lib/google/service-account";

/**
 * Mirrors Supabase Storage files (document library, task/outstanding
 * attachments, salary-policy PDFs, e-signatures, avatars) into the backup
 * Shared Drive folder. Incremental: lists what's already in Drive and uploads
 * only the missing files (Storage objects are effectively immutable). Drive
 * REST + service-account token, fetch-only. Self-contained Supabase client (no
 * server-only import) so the manual backup script can run it too.
 */
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const BUCKETS = ["documents", "avatars"] as const;

function supabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Recursively list every object path in a bucket (Storage `list` is one level). */
async function listBucket(sb: SupabaseClient, bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`Storage list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders come back with a null id; recurse into them.
      if (entry.id === null) out.push(...(await listBucket(sb, bucket, path)));
      else out.push(path);
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

async function existingDriveNames(token: string, folderId: string): Promise<Set<string>> {
  const names = new Set<string>();
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken,files(name)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "allDrives",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${DRIVE_FILES}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Drive list: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { files?: { name: string }[]; nextPageToken?: string };
    for (const f of json.files ?? []) names.add(f.name);
    pageToken = json.nextPageToken;
  } while (pageToken);
  return names;
}

async function uploadToDrive(token: string, folderId: string, name: string, blob: Blob): Promise<void> {
  const boundary = "altusbackup" + name.length;
  const metadata = JSON.stringify({ name, parents: [folderId] });
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      metadata,
      `\r\n--${boundary}\r\nContent-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  );
  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload ${name}: ${res.status} ${await res.text()}`);
}

export async function backupStorageToDrive(
  folderId: string,
): Promise<{ uploaded: number; skipped: number; total: number }> {
  const token = await getServiceAccountToken([GOOGLE_SCOPES.drive]);
  const sb = supabaseAdmin();
  const already = await existingDriveNames(token, folderId);

  let uploaded = 0;
  let skipped = 0;
  let total = 0;

  for (const bucket of BUCKETS) {
    const paths = await listBucket(sb, bucket);
    for (const path of paths) {
      total++;
      // Flatten bucket + path into a unique, collision-free Drive file name.
      const driveName = `${bucket}__${path.replace(/\//g, "__")}`;
      if (already.has(driveName)) {
        skipped++;
        continue;
      }
      const { data: blob, error } = await sb.storage.from(bucket).download(path);
      if (error || !blob) continue; // best-effort; skip unreadable objects
      await uploadToDrive(token, folderId, driveName, blob as Blob);
      uploaded++;
    }
  }

  return { uploaded, skipped, total };
}
