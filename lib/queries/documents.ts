import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, employees } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedByName: string | null;
  createdAt: Date;
  /** Short-lived signed download URL (null if signing failed). */
  url: string | null;
}

/** Document library, newest first, each with a fresh signed download URL. */
export async function listDocuments(): Promise<DocumentRow[]> {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      description: documents.description,
      storagePath: documents.storagePath,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      uploadedByName: employees.name,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .leftJoin(employees, eq(documents.uploadedById, employees.id))
    .orderBy(desc(documents.createdAt))
    .limit(500);

  // createSignedUrl is a network call to Supabase Storage; serial
  // awaits inside a `for` loop turn 500 docs into 500 sequential HTTP
  // round-trips. createSignedUrls (plural) takes a path array and
  // returns the same signed URLs in one call.
  const admin = getSupabaseAdmin();
  const paths = rows.map((r) => r.storagePath);
  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data, error } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrls(paths, 3600);
    if (!error && data) {
      for (const entry of data) {
        if (entry.signedUrl && entry.path) {
          signedByPath.set(entry.path, entry.signedUrl);
        }
      }
    }
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    uploadedByName: r.uploadedByName ?? null,
    createdAt: r.createdAt,
    url: signedByPath.get(r.storagePath) ?? null,
  }));
}
