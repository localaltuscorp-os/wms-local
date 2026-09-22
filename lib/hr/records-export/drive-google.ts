import "server-only";
import { DriveAuthError, type DriveClient } from "./types";

/**
 * Google Drive REST, plain fetch — the same no-SDK approach as lib/google/calendar.ts
 * and lib/backup/drive.ts.
 *
 * Scope is `drive.file`: the app can see and change ONLY the files it created.
 * Nothing else in hr.altuscorp@gmail.com's Drive is readable through this token,
 * which is why the root "HR Records" folder is created by the app rather than
 * looked up by name — a folder HR made by hand is invisible to this scope.
 *
 * Uploads are resumable (two requests) for every size, because a multipart
 * upload caps out at 5 MB and a phone photo of an Aadhaar card can exceed that.
 */

const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

const RECONNECT = "Reconnect the HR Google account on the HR Records Backup page.";

async function describe(res: Response, what: string): Promise<Error> {
  const text = await res.text().catch(() => "");
  let message = text;
  try {
    message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
  } catch {
    /* not JSON */
  }
  if (res.status === 401 || (res.status === 403 && /insufficient|scope|not granted/i.test(message))) {
    return new DriveAuthError(`Google Drive refused the connection (${message.slice(0, 120)}). ${RECONNECT}`);
  }
  return new Error(`${what} failed — Google Drive said ${res.status}: ${message}`.slice(0, 300));
}

export function googleDriveClient(accessToken: string): DriveClient {
  async function call(url: string, init: RequestInit & { headers?: Record<string, string> }, auth = true): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        ...init,
        headers: { ...(auth ? { Authorization: `Bearer ${accessToken}` } : {}), ...(init.headers ?? {}) },
      });
      let retry = RETRY_STATUS.has(res.status);
      if (res.status === 403) retry = /rateLimitExceeded/i.test(await res.clone().text().catch(() => ""));
      if (retry && attempt < 3) {
        await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
        continue;
      }
      if (res.status === 401) throw new DriveAuthError(`Google Drive rejected the connection. ${RECONNECT}`);
      return res;
    }
  }

  /** The item's name and parent folders, or null when it no longer exists or is in the bin. */
  async function alive(id: string): Promise<{ name: string; parents: string[] } | null> {
    const res = await call(`${FILES}/${encodeURIComponent(id)}?fields=id,name,trashed,parents`, { method: "GET" });
    if (res.status === 404) return null;
    if (!res.ok) throw await describe(res, "Checking a Drive item");
    const json = (await res.json()) as { name: string; trashed?: boolean; parents?: string[] };
    return json.trashed ? null : { name: json.name, parents: json.parents ?? [] };
  }

  async function upload(method: "POST" | "PATCH", url: string, metadata: object, data: Uint8Array, mime: string): Promise<string> {
    const start = await call(url, {
      method,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mime,
        "X-Upload-Content-Length": String(data.byteLength),
      },
      body: JSON.stringify(metadata),
    });
    if (!start.ok) throw await describe(start, "Starting an upload");
    const session = start.headers.get("location");
    if (!session) throw new Error("Google Drive did not return an upload address.");
    // The session URL is itself the credential for this one upload.
    const put = await call(session, { method: "PUT", headers: { "Content-Type": mime }, body: data as unknown as BodyInit }, false);
    if (!put.ok) throw await describe(put, "Uploading a file");
    const json = (await put.json()) as { id?: string };
    if (!json.id) throw new Error("Google Drive accepted the upload but returned no file id.");
    return json.id;
  }

  return {
    async ensureFolder({ name, parentId, knownId }) {
      if (knownId) {
        const current = await alive(knownId);
        if (current !== null) {
          if (current.name !== name) {
            const res = await call(`${FILES}/${encodeURIComponent(knownId)}?fields=id`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json; charset=UTF-8" },
              body: JSON.stringify({ name }),
            });
            if (!res.ok) throw await describe(res, `Renaming folder "${name}"`);
          }
          return knownId;
        }
      }
      const res = await call(`${FILES}?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId ?? "root"] }),
      });
      if (!res.ok) throw await describe(res, `Creating folder "${name}"`);
      return ((await res.json()) as { id: string }).id;
    },

    async putFile({ name, parentId, data, mime, knownId }) {
      const current = knownId ? await alive(knownId) : null;
      if (knownId && current) {
        // Overwrite in place; if the file now belongs in a different folder,
        // move it in the same request so no copy is left behind.
        const params = new URLSearchParams({ uploadType: "resumable", fields: "id" });
        if (!current.parents.includes(parentId)) params.set("addParents", parentId);
        const stray = current.parents.filter((p) => p !== parentId);
        if (stray.length) params.set("removeParents", stray.join(","));
        return upload("PATCH", `${UPLOAD}/${encodeURIComponent(knownId)}?${params.toString()}`, { name }, data, mime);
      }
      return upload("POST", `${UPLOAD}?uploadType=resumable&fields=id`, { name, parents: [parentId] }, data, mime);
    },
  };
}
