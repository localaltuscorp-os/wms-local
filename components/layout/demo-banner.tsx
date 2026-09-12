import { FlaskConical } from "lucide-react";

/**
 * "You are looking at sample data."
 *
 * Shown whenever a page has fallen back to lib/demo/* because its migration is
 * not applied yet. It is not decoration: a fully working screen full of
 * plausible names and dates is indistinguishable from the real thing, and
 * somebody will screenshot it into a meeting. The banner is what stops that
 * screenshot from being a false claim.
 */
export function DemoBanner({ migration, what }: { migration: string; what: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-200 text-amber-900">
        <FlaskConical className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-amber-900">
          Sample data &mdash; {what} is running on a demo dataset
        </p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-amber-800">
          Migration{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px]">
            {migration}
          </code>{" "}
          has not been applied, so nothing here is saved to the database. Every button still
          works and your edits hold until the server restarts. Run{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px]">
            db/RUN-IN-SUPABASE-0221-0222.sql
          </code>{" "}
          in Supabase and this page switches to real rows on its own.
        </p>
      </div>
    </div>
  );
}
