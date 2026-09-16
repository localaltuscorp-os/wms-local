/**
 * Download one person's complete HR record as a ZIP from the browser.
 *
 * Shared by HR Record and the Records Backup page. `fetch` + blob rather than a
 * plain link so a refusal ("nothing on file yet", "HR admins only") can be shown
 * as a toast instead of downloading an error page named .zip.
 */

function fileNameFrom(disposition: string | null): string | null {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? "");
  if (star) {
    try {
      return decodeURIComponent(star[1]!);
    } catch {
      /* fall through to the ASCII name */
    }
  }
  return /filename="([^"]+)"/i.exec(disposition ?? "")?.[1] ?? null;
}

export async function downloadRecordsZip(
  personId: string,
  personName: string,
): Promise<{ ok: true; fileName: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/hr/records/${encodeURIComponent(personId)}/zip`, { cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("application/zip")) {
      const data = type.includes("application/json")
        ? ((await res.json().catch(() => null)) as { error?: string } | null)
        : null;
      return { ok: false, error: data?.error || "Couldn't build the ZIP. Please sign in again and retry." };
    }
    const blob = await res.blob();
    const fileName = fileNameFrom(res.headers.get("content-disposition")) ?? `HR Records - ${personName}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ok: true, fileName };
  } catch {
    return { ok: false, error: "Couldn't download the ZIP — check your connection and try again." };
  }
}
