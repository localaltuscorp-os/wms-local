import { formatDistanceToNow } from "date-fns";
import { FilePlus2, FilePen, FileText, RefreshCw, Trash2 } from "lucide-react";
import type { DocumentEventRow } from "@/lib/queries/document-events";

interface Props {
  rows: DocumentEventRow[];
}

/**
 * Phase 3.5 surface — recent document mutations rendered as a vertical
 * timeline. Sits below the document library so admins can see at a
 * glance who renamed / replaced / deleted what, and when. Read-only;
 * the audit log itself is append-only (deletes write `event_type =
 * 'deleted'` and leave the row behind).
 */
export function RecentDocumentEvents({ rows }: Props) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-10">
      <header className="mb-4">
        <h3 className="text-display-xs">Recent document activity</h3>
        <p className="text-body text-ink-subtle mt-1">
          Append-only audit trail. Who renamed / replaced / deleted what.
        </p>
      </header>
      <ol
        className="rounded-section border border-hairline bg-surface-card divide-y divide-hairline"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-3 flex items-start gap-3">
            <span
              className="shrink-0 inline-flex items-center justify-center rounded-full"
              style={{
                width: 32,
                height: 32,
                background: kindBg(r.eventType),
                color: kindFg(r.eventType),
              }}
              aria-hidden
            >
              {kindIcon(r.eventType)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px]">
                <strong className="text-ink-strong">{r.actorName ?? "Someone"}</strong>{" "}
                <span className="text-ink-soft">{describe(r)}</span>
              </div>
              {r.eventType === "renamed" && (
                <div className="mt-1 text-[12.5px] text-ink-subtle font-mono">
                  {readField(r.fromValue, "title") ?? "?"} → {readField(r.toValue, "title") ?? "?"}
                </div>
              )}
              {r.eventType === "file_replaced" && (
                <div className="mt-1 text-[12.5px] text-ink-subtle">
                  {prettyBytes(readNumber(r.toValue, "sizeBytes"))} ·{" "}
                  {readField(r.toValue, "mimeType") ?? "unknown type"}
                </div>
              )}
            </div>
            <span className="shrink-0 text-[12px] text-ink-subtle tabular-nums">
              {formatDistanceToNow(r.createdAt, { addSuffix: true })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function describe(r: DocumentEventRow): string {
  switch (r.eventType) {
    case "created":
      return `uploaded "${r.documentTitle}"`;
    case "renamed":
      return `renamed a document`;
    case "description_changed":
      return `edited the description of "${r.documentTitle}"`;
    case "file_replaced":
      return `replaced the file of "${r.documentTitle}"`;
    case "deleted":
      return `deleted "${r.documentTitle}"`;
  }
}

function kindIcon(k: DocumentEventRow["eventType"]) {
  switch (k) {
    case "created":            return <FilePlus2 size={15} strokeWidth={2.2} />;
    case "renamed":            return <FilePen size={15} strokeWidth={2.2} />;
    case "description_changed":return <FileText size={15} strokeWidth={2.2} />;
    case "file_replaced":      return <RefreshCw size={15} strokeWidth={2.2} />;
    case "deleted":            return <Trash2 size={15} strokeWidth={2.2} />;
  }
}

function kindBg(k: DocumentEventRow["eventType"]): string {
  if (k === "deleted") return "var(--color-red-bg)";
  if (k === "created") return "var(--color-green-bg)";
  return "var(--color-blue-bg)";
}
function kindFg(k: DocumentEventRow["eventType"]): string {
  if (k === "deleted") return "var(--color-red-deep)";
  if (k === "created") return "var(--color-green-deep)";
  return "var(--color-blue-deep)";
}

function readField(value: unknown, key: string): string | undefined {
  if (value && typeof value === "object" && key in (value as Record<string, unknown>)) {
    const v = (value as Record<string, unknown>)[key];
    return typeof v === "string" ? v : v == null ? undefined : String(v);
  }
  return undefined;
}

function readNumber(value: unknown, key: string): number | null {
  if (value && typeof value === "object" && key in (value as Record<string, unknown>)) {
    const v = (value as Record<string, unknown>)[key];
    return typeof v === "number" ? v : null;
  }
  return null;
}

function prettyBytes(b: number | null): string {
  if (b == null) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
