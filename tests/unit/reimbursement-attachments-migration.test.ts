import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/**
 * MIGRATION 0216, EXECUTED.
 *
 * The SQL is run against a throwaway in-memory Postgres (PGlite, already a
 * dependency for DUMMY_MODE) rather than eyeballed, because the failures that
 * matter here are not spelling: a foreign key pointed at the wrong column, a
 * cascade that does not cascade, an index that never gets created because the
 * `IF NOT EXISTS` was on the wrong statement. None of those show up in review
 * and all of them show up in production.
 *
 * It is also run TWICE, because `pnpm db:migrate` applies un-ledgered files
 * unattended and a half-applied migration gets re-run by hand. Idempotency is
 * a property this file claims, so it is a property this test checks.
 */

const SQL = readFileSync("db/migrations/0216_module_submission_attachments.sql", "utf8");

/**
 * The bare minimum of the existing schema that 0216 references.
 *
 * No `CREATE EXTENSION pgcrypto` — `gen_random_uuid()` has been in core
 * Postgres since 13, which is also why the migration itself does not ask for
 * the extension. (PGlite does not ship pgcrypto, so requesting it here failed
 * on a function that was available all along.)
 */
const PREREQS = `
  CREATE TABLE employees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL
  );
  CREATE TABLE module_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    module text NOT NULL,
    employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    fields jsonb NOT NULL DEFAULT '{}',
    admin_fields jsonb NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'pending',
    archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  );
`;

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(PREREQS);
  await db.exec(SQL);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function seedClaim(): Promise<{ empId: string; subId: string }> {
  const emp = await db.query<{ id: string }>(
    "INSERT INTO employees (name) VALUES ('Om Jadhav') RETURNING id",
  );
  const empId = emp.rows[0]!.id;
  const sub = await db.query<{ id: string }>(
    "INSERT INTO module_submissions (module, employee_id) VALUES ('reimbursement', $1) RETURNING id",
    [empId],
  );
  return { empId, subId: sub.rows[0]!.id };
}

describe("migration 0216 applies", () => {
  it("creates the table with the columns the app writes", async () => {
    const res = await db.query<{ column_name: string; is_nullable: string; data_type: string }>(
      `SELECT column_name, is_nullable, data_type
         FROM information_schema.columns
        WHERE table_name = 'module_submission_attachments'
        ORDER BY ordinal_position`,
    );
    const cols = new Map(res.rows.map((r) => [r.column_name, r]));
    expect([...cols.keys()]).toEqual([
      "id",
      "submission_id",
      "storage_path",
      "file_name",
      "mime",
      "size_bytes",
      "uploaded_by_id",
      "created_at",
    ]);
    // The two things that must never be null: what the row points at, and the
    // uploader's original filename (the object key is a uuid, so this row is
    // the only place the real name survives).
    expect(cols.get("storage_path")!.is_nullable).toBe("NO");
    expect(cols.get("file_name")!.is_nullable).toBe("NO");
    expect(cols.get("submission_id")!.is_nullable).toBe("NO");
    // Metadata we may genuinely not have for an older row.
    expect(cols.get("mime")!.is_nullable).toBe("YES");
    expect(cols.get("size_bytes")!.is_nullable).toBe("YES");
    expect(cols.get("uploaded_by_id")!.is_nullable).toBe("YES");
  });

  it("creates the one index the app's only query needs", async () => {
    const res = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'module_submission_attachments'`,
    );
    expect(res.rows.map((r) => r.indexname)).toContain(
      "module_submission_attachments_submission_idx",
    );
  });

  it("is IDEMPOTENT — re-running it changes nothing and does not throw", async () => {
    const { subId } = await seedClaim();
    await db.query(
      `INSERT INTO module_submission_attachments (submission_id, storage_path, file_name)
       VALUES ($1, 'reimbursements/x/y/bill.pdf', 'bill.pdf')`,
      [subId],
    );
    await db.exec(SQL); // second application
    const after = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM module_submission_attachments",
    );
    expect(after.rows[0]!.n).toBe(1);
  });
});

describe("the row's referential behaviour", () => {
  it("stores a document against a claim, filename verbatim", async () => {
    const { empId, subId } = await seedClaim();
    await db.query(
      `INSERT INTO module_submission_attachments
         (submission_id, storage_path, file_name, mime, size_bytes, uploaded_by_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        subId,
        `reimbursements/${empId}/2f1c/Uber receipt (Sep).pdf`,
        "Uber receipt (Sep).pdf",
        "application/pdf",
        204_800,
        empId,
      ],
    );
    const res = await db.query<{ file_name: string; size_bytes: number }>(
      "SELECT file_name, size_bytes FROM module_submission_attachments WHERE submission_id = $1",
      [subId],
    );
    // The name is NOT sanitised on the way in — spaces and brackets survive, so
    // the claim can still say what the file was actually called.
    expect(res.rows[0]!.file_name).toBe("Uber receipt (Sep).pdf");
    expect(res.rows[0]!.size_bytes).toBe(204_800);
  });

  it("REFUSES a document pointed at a claim that does not exist", async () => {
    await expect(
      db.query(
        `INSERT INTO module_submission_attachments (submission_id, storage_path, file_name)
         VALUES ('00000000-0000-0000-0000-000000000000', 'p', 'f.pdf')`,
      ),
    ).rejects.toThrow();
  });

  it("CASCADES — deleting a claim takes its documents with it", async () => {
    const { subId } = await seedClaim();
    await db.query(
      `INSERT INTO module_submission_attachments (submission_id, storage_path, file_name)
       VALUES ($1, 'p1', 'a.pdf'), ($1, 'p2', 'b.pdf')`,
      [subId],
    );
    await db.query("DELETE FROM module_submissions WHERE id = $1", [subId]);
    const left = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM module_submission_attachments WHERE submission_id = $1",
      [subId],
    );
    expect(left.rows[0]!.n).toBe(0);
  });

  it("keeps the document when its UPLOADER is removed — the record outlives the login", async () => {
    const { empId, subId } = await seedClaim();
    // A second employee uploads, then leaves.
    const other = await db.query<{ id: string }>(
      "INSERT INTO employees (name) VALUES ('Leaver') RETURNING id",
    );
    const otherId = other.rows[0]!.id;
    await db.query(
      `INSERT INTO module_submission_attachments
         (submission_id, storage_path, file_name, uploaded_by_id)
       VALUES ($1, 'p3', 'c.pdf', $2)`,
      [subId, otherId],
    );
    await db.query("DELETE FROM employees WHERE id = $1", [otherId]);
    const res = await db.query<{ uploaded_by_id: string | null; file_name: string }>(
      "SELECT uploaded_by_id, file_name FROM module_submission_attachments WHERE storage_path = 'p3'",
    );
    // ON DELETE SET NULL: the receipt survives, its uploader becomes unknown.
    expect(res.rows[0]!.file_name).toBe("c.pdf");
    expect(res.rows[0]!.uploaded_by_id).toBeNull();
    expect(empId).toBeTruthy();
  });

  it("allows many documents on one claim", async () => {
    const { subId } = await seedClaim();
    for (let i = 0; i < 10; i++) {
      await db.query(
        `INSERT INTO module_submission_attachments (submission_id, storage_path, file_name)
         VALUES ($1, $2, $3)`,
        [subId, `many/${i}`, `bill-${i}.pdf`],
      );
    }
    const res = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM module_submission_attachments WHERE submission_id = $1",
      [subId],
    );
    // The 10-per-claim cap is an application rule (CLAIM_MAX_FILES), not a DB
    // constraint — deliberately, so the limit can change without a migration.
    expect(res.rows[0]!.n).toBe(10);
  });
});

describe("what 0216 does NOT do", () => {
  it("leaves module_submissions untouched — bill_url keeps working", async () => {
    // BACKWARD COMPATIBILITY. `fields` is jsonb and the migration does not
    // rewrite a single submission, so an existing Drive-link claim reads back
    // exactly as it did before.
    const { empId } = await seedClaim();
    const legacy = await db.query<{ id: string }>(
      `INSERT INTO module_submissions (module, employee_id, fields)
       VALUES ('reimbursement', $1, '{"amount":"1500","bill_url":"https://drive.google.com/abc"}')
       RETURNING id`,
      [empId],
    );
    const res = await db.query<{ fields: Record<string, string> }>(
      "SELECT fields FROM module_submissions WHERE id = $1",
      [legacy.rows[0]!.id],
    );
    expect(res.rows[0]!.fields.bill_url).toBe("https://drive.google.com/abc");
    expect(res.rows[0]!.fields.amount).toBe("1500");
  });

  it("stores no file bytes — the row is a POINTER, the document lives elsewhere", async () => {
    const res = await db.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'module_submission_attachments'
          AND data_type IN ('bytea', 'oid')`,
    );
    // If a bytea column ever appears here, receipts have started living in
    // Postgres and the storage design has been abandoned by accident.
    expect(res.rows).toHaveLength(0);
  });
});
