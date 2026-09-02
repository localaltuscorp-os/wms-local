// Seed the Policy CMS from the code-authored policies (registry POLICY_LIST +
// POLICY_CARDS). Creates a policy_documents row + a v1 policy_versions row for
// each. Idempotent: skips a policy that already has a documents row.
// pnpm tsx --env-file=.env.local scripts/seed-policy-cms.ts
import postgres from "postgres";
import { POLICY_LIST, POLICY_CARDS } from "@/lib/hr/policies/registry";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  let created = 0;
  for (const p of POLICY_LIST) {
    const card = POLICY_CARDS.find((c) => c.key === p.key);
    const existing = (await sql`select key from policy_documents where key = ${p.key}`) as unknown as {
      key: string;
    }[];
    if (existing.length > 0) continue;

    await sql`
      insert into policy_documents
        (key, title, doc_code, category, badge, blurb, summary, owner, registered_office, hr_email, entity_default, current_version, status)
      values
        (${p.key}, ${p.title}, ${p.docCode}, ${"policy"}, ${card?.badge ?? ""}, ${card?.blurb ?? ""},
         ${p.summary ?? ""}, ${p.owner}, ${p.registeredOffice}, ${p.hrEmail}, ${p.entityDefault ?? "altus-corp"}, 1, ${"published"})
      on conflict (key) do nothing
    `;
    await sql`
      insert into policy_versions
        (policy_key, version, title, doc_code, effective_date, summary, sections)
      values
        (${p.key}, 1, ${p.title}, ${p.docCode}, ${p.effectiveDate}, ${p.summary ?? ""}, ${sql.json(p.sections as unknown as Parameters<typeof sql.json>[0])})
      on conflict (policy_key, version) do nothing
    `;
    created += 1;
  }
  console.log(`OK — policy CMS seeded. New policies: ${created} / ${POLICY_LIST.length}.`);
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
