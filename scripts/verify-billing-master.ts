/**
 * PROVE the Billing Master's central promise against the live database,
 * changing nothing.
 *
 *   §7  "If the entity's address / GST / PAN / bank details / proprietor /
 *        signature / logo are changed later in Billing Master, old invoices
 *        must NOT unexpectedly change."
 *
 * ── WHY A SCRIPT AND NOT ONLY A UNIT TEST ──────────────────────────────────
 * The unit tests prove `snapshotBillingEntity()` freezes the right fields, and
 * that two snapshots of a changed entity differ. What they cannot prove is that
 * the freeze SURVIVES A ROUND TRIP THROUGH POSTGRES — that a jsonb column hands
 * back exactly what was stored, that editing the entity afterwards leaves the
 * stored row alone, and that deleting the entity takes its files with it while
 * sparing its history. Those are claims about the schema, and they are worth
 * checking against the real one.
 *
 * Everything runs inside a transaction that is ROLLED BACK. Nothing is left
 * behind, including the temporary entity.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/verify-billing-master.ts
 */
import postgres from "postgres";
import {
  snapshotBillingEntity,
  snapshotsDiffer,
  canonicalJson,
} from "../lib/billing/entity-snapshot";

const NAME = "__verify_billing_master__";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with --env-file=.env.local");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });

/** The entity columns, exactly as lib/queries/billing-entities.ts selects them. */
interface Row {
  id: string;
  name: string;
  proprietor_name: string | null;
  proprietor_designation: string | null;
  address: string | null;
  cell_no: string | null;
  email: string | null;
  website: string | null;
  pan_no: string | null;
  gst_no: string | null;
  sac_codes: string[] | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  ifsc: string | null;
  branch: string | null;
}

/** snake_case row → the camelCase shape the snapshot function takes. */
function toInput(r: Row) {
  return {
    id: r.id,
    name: r.name,
    proprietorName: r.proprietor_name,
    proprietorDesignation: r.proprietor_designation,
    address: r.address,
    cellNo: r.cell_no,
    email: r.email,
    website: r.website,
    panNo: r.pan_no,
    gstNo: r.gst_no,
    sacCodes: r.sac_codes,
    bankName: r.bank_name,
    accountName: r.account_name,
    accountNumber: r.account_number,
    ifsc: r.ifsc,
    branch: r.branch,
  };
}

async function main() {
  console.log("Verifying the Billing Master against the live database.\n");
  let failed = false;
  const fail = (m: string) => {
    failed = true;
    console.error(`  FAIL  ${m}`);
  };
  const pass = (m: string) => console.log(`  ✓ ${m}`);

  await sql
    .begin(async (tx) => {
      // ── 1 · CREATE ────────────────────────────────────────────────────────
      const [created] = await tx<{ id: string }[]>`
        INSERT INTO paying_entities (name) VALUES (${NAME}) RETURNING id`;
      const id = created!.id;
      pass(`created an entity (${id.slice(0, 8)}…)`);

      // ── 2 · DUPLICATE PREVENTION ──────────────────────────────────────────
      let dupRefused = false;
      try {
        await tx.savepoint(async (sp) => {
          await sp`INSERT INTO paying_entities (name) VALUES (${NAME})`;
        });
      } catch {
        dupRefused = true;
      }
      if (!dupRefused) fail("a duplicate entity name was accepted");
      else pass("a duplicate entity name is refused by the database");

      // ── 3 · FILL IN THE BILLING DETAILS ───────────────────────────────────
      await tx`
        UPDATE paying_entities SET
          proprietor_name = 'Original Proprietor',
          proprietor_designation = 'Proprietor',
          address = 'Sacred Space, C-6, Mumbai 63',
          cell_no = '+91 80970 10410',
          email = 'billing@example.com',
          website = 'www.example.com',
          pan_no = 'AAAPL1234C',
          gst_no = '27AAAPL1234C1Z5',
          sac_codes = ARRAY['998313','9983'],
          bank_name = 'HDFC Bank',
          account_name = ${NAME},
          account_number = '50200012345678',
          ifsc = 'HDFC0001234',
          branch = 'Goregaon East'
        WHERE id = ${id}`;

      // A logo, a signature and a document.
      await tx`
        INSERT INTO billing_entity_files (entity_id, kind, storage_path, file_name, mime_type, size_bytes)
        VALUES
          (${id}, 'logo',      ${`billing-entities/${id}/logo/v1/logo.png`}, 'logo.png', 'image/png', 1234),
          (${id}, 'signature', ${`billing-entities/${id}/signature/v1/sign.png`}, 'sign.png', 'image/png', 555),
          (${id}, 'document',  ${`billing-entities/${id}/document/v1/gst.pdf`}, 'gst.pdf', 'application/pdf', 9999)`;
      pass("filled in tax, banking and contact details + 3 files");

      // ── 4 · SNAPSHOT (what an invoice would embed today) ──────────────────
      const [rowV1] = await tx<Row[]>`SELECT * FROM paying_entities WHERE id = ${id}`;
      const filesV1 = await tx<
        { kind: "logo" | "signature" | "document"; storage_path: string; file_name: string; mime_type: string | null }[]
      >`SELECT kind, storage_path, file_name, mime_type FROM billing_entity_files WHERE entity_id = ${id}`;

      const snapV1 = snapshotBillingEntity(
        toInput(rowV1!),
        filesV1.map((f) => ({
          kind: f.kind,
          storagePath: f.storage_path,
          fileName: f.file_name,
          mimeType: f.mime_type,
        })),
      );

      await tx`
        INSERT INTO billing_entity_versions (entity_id, entity_name, snapshot, reason)
        VALUES (${id}, ${NAME}, ${tx.json(snapV1 as never)}, 'created')`;
      pass("stored the snapshot an invoice issued today would carry");

      if (snapV1.gstNo !== "27AAAPL1234C1Z5") fail("the snapshot did not capture the GST No.");
      if (snapV1.accountNumber !== "50200012345678") fail("the snapshot did not capture the bank account");
      if (snapV1.logo?.storagePath !== `billing-entities/${id}/logo/v1/logo.png`) {
        fail("the snapshot did not capture the logo path");
      }
      if (snapV1.signature == null) fail("the snapshot did not capture the signature");
      if (JSON.stringify(snapV1).includes("gst.pdf")) {
        fail("the snapshot wrongly included a billing DOCUMENT");
      }
      pass("snapshot carries GST, bank, logo and signature — and not the documents");

      // ── 5 · THE ENTITY CHANGES, AS ENTITIES DO ────────────────────────────
      await tx`
        UPDATE paying_entities SET
          proprietor_name = 'New Proprietor',
          address = 'A completely different address',
          gst_no = '29AAAPL1234C1Z5',
          account_number = '99999999999999',
          ifsc = 'ICIC0005678',
          bank_name = 'ICICI Bank'
        WHERE id = ${id}`;
      // …and the logo is replaced with a new object at a new path.
      await tx`DELETE FROM billing_entity_files WHERE entity_id = ${id} AND kind = 'logo'`;
      await tx`
        INSERT INTO billing_entity_files (entity_id, kind, storage_path, file_name, mime_type)
        VALUES (${id}, 'logo', ${`billing-entities/${id}/logo/v2/logo2.png`}, 'logo2.png', 'image/png')`;
      pass("changed the GST, bank account, proprietor, address and logo");

      // ── 6 · THE OLD SNAPSHOT MUST BE UNTOUCHED. This is the requirement. ──
      const [storedV1] = await tx<{ snapshot: unknown }[]>`
        SELECT snapshot FROM billing_entity_versions
         WHERE entity_id = ${id} AND reason = 'created'`;
      const readBack = storedV1!.snapshot as typeof snapV1;

      /**
       * Compared by VALUE, not by `JSON.stringify`.
       *
       * The first version of this check used `JSON.stringify` and failed —
       * correctly. Postgres `jsonb` stores object keys sorted by length and
       * then alphabetically rather than in insertion order, so the read-back
       * snapshot has the same values in a different order and the two strings
       * never match.
       *
       * That failure was worth having: the same mistake was in
       * `snapshotsDiffer`, where it meant every save wrote a version row
       * claiming the entity had changed. The function now compares
       * canonically; this compares field by field, which is the claim actually
       * being made — the VALUES survived the round trip.
       */
      const drifted = (Object.keys(snapV1) as (keyof typeof snapV1)[]).filter(
        // `canonicalJson`, not `JSON.stringify` — `logo` and `signature` are
        // nested objects, so their keys are reordered by jsonb too.
        (k) => canonicalJson(readBack[k]) !== canonicalJson(snapV1[k]),
      );
      if (drifted.length > 0) {
        fail(`these fields changed in the jsonb round-trip: ${drifted.join(", ")}`);
      } else {
        pass(`all ${Object.keys(snapV1).length} snapshot fields survive jsonb by value`);
      }

      if (snapshotsDiffer(readBack, snapV1)) {
        fail("snapshotsDiffer reports a change between a stored snapshot and its own source");
      } else {
        pass("snapshotsDiffer is order-independent — a no-op save writes no version row");
      }

      const expectations: [string, unknown, unknown][] = [
        ["GST No.", readBack.gstNo, "27AAAPL1234C1Z5"],
        ["bank account", readBack.accountNumber, "50200012345678"],
        ["IFSC", readBack.ifsc, "HDFC0001234"],
        ["bank name", readBack.bankName, "HDFC Bank"],
        ["proprietor", readBack.proprietorName, "Original Proprietor"],
        ["address", readBack.address, "Sacred Space, C-6, Mumbai 63"],
        ["logo path", readBack.logo?.storagePath, `billing-entities/${id}/logo/v1/logo.png`],
      ];
      let allHeld = true;
      for (const [label, got, want] of expectations) {
        if (got !== want) {
          fail(`the old snapshot's ${label} changed: expected ${String(want)}, got ${String(got)}`);
          allHeld = false;
        }
      }
      if (allHeld) {
        pass("EVERY old value is intact — an old invoice would still print correctly");
      }

      // And the entity itself really did move on.
      const [rowV2] = await tx<Row[]>`SELECT * FROM paying_entities WHERE id = ${id}`;
      if (rowV2!.gst_no !== "29AAAPL1234C1Z5") fail("the entity's own GST did not update");
      else pass("the entity itself carries the NEW values — future invoices use them");

      const filesV2 = await tx<
        { kind: "logo" | "signature" | "document"; storage_path: string; file_name: string; mime_type: string | null }[]
      >`SELECT kind, storage_path, file_name, mime_type FROM billing_entity_files WHERE entity_id = ${id}`;
      const snapV2 = snapshotBillingEntity(
        toInput(rowV2!),
        filesV2.map((f) => ({
          kind: f.kind,
          storagePath: f.storage_path,
          fileName: f.file_name,
          mimeType: f.mime_type,
        })),
      );
      if (!snapshotsDiffer(readBack, snapV2)) fail("the two snapshots were reported identical");
      else pass("the change is detected, so a version row is warranted");

      await tx`
        INSERT INTO billing_entity_versions (entity_id, entity_name, snapshot, reason)
        VALUES (${id}, ${NAME}, ${tx.json(snapV2 as never)}, 'updated')`;

      // ── 7 · POINT-IN-TIME: the newest version at or before a moment ───────
      const history = await tx<{ reason: string; created_at: Date }[]>`
        SELECT reason, created_at FROM billing_entity_versions
         WHERE entity_id = ${id} ORDER BY created_at DESC`;
      if (history.length !== 2) fail(`expected 2 version rows, got ${history.length}`);
      else pass("the change history has both versions, newest first");

      // ── 8 · RESOLVE BY NAME (§6) ──────────────────────────────────────────
      const byName = await tx<{ id: string }[]>`
        SELECT id FROM paying_entities WHERE lower(name) = lower(${NAME}) LIMIT 1`;
      if (byName[0]?.id !== id) fail("the entity could not be resolved by name");
      else pass("resolves by name, case-insensitively — the key billing surfaces hold");

      const unknown = await tx<{ id: string }[]>`
        SELECT id FROM paying_entities WHERE lower(name) = lower(${"__no_such_entity__"}) LIMIT 1`;
      if (unknown.length !== 0) fail("an unknown name matched something");
      else pass("an unknown name matches NOTHING — no silent fallback to a default entity");

      // ── 9 · DELETE: files go, history stays (§5 + §7) ─────────────────────
      const pathsBefore = filesV2.length;
      await tx`DELETE FROM paying_entities WHERE id = ${id}`;

      const orphans = Number(
        (
          await tx<{ n: string }[]>`
        SELECT count(*) AS n FROM billing_entity_files WHERE entity_id = ${id}`
        )[0]!.n,
      );
      if (orphans !== 0) fail(`${orphans} of ${pathsBefore} file rows survived the delete`);
      else pass(`all ${pathsBefore} file rows cascaded away with the entity`);

      const survivors = await tx<{ snapshot: unknown; reason: string }[]>`
        SELECT snapshot, reason FROM billing_entity_versions WHERE entity_id = ${id}`;
      if (survivors.length !== 2) {
        fail(`the version history did not survive the delete (${survivors.length} of 2 rows)`);
      } else {
        pass("the version history SURVIVES the delete — old invoices remain explicable");
      }

      const postDelete = survivors.find((s) => s.reason === "created")?.snapshot as
        | typeof snapV1
        | undefined;
      if (postDelete?.gstNo !== "27AAAPL1234C1Z5") {
        fail("the surviving snapshot lost its values");
      } else {
        pass("and it still reads back the GST the original invoice was issued under");
      }

      throw new Error("__ROLLBACK__");
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "__ROLLBACK__") {
        console.log("\nRolled back. The database is unchanged.");
        return;
      }
      failed = true;
      console.error("\nAborted (and rolled back):", msg);
    });

  await sql.end();
  if (failed) {
    console.error("\nVERIFICATION FAILED");
    process.exit(1);
  }
  console.log("VERIFICATION PASSED — editing the master does not rewrite the past.");
}

void main();
