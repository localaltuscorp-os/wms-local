import { getServiceAccountToken, GOOGLE_SCOPES } from "@/lib/google/service-account";
const ID = "1bN6ycsR8SwJDhSOPwzEau10MUqWFXiDB5zULAqN3hPM";
async function main() {
  const token = await getServiceAccountToken([GOOGLE_SCOPES.sheets]);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ID}?fields=properties.title,sheets.properties(title,gridProperties(rowCount,columnCount))`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { console.error(`ACCESS=NO  ${res.status}: ${(await res.text()).slice(0,200)}`); process.exit(2); }
  const j = await res.json() as { properties?:{title?:string}; sheets?:{properties:{title:string;gridProperties?:{rowCount:number;columnCount:number}}}[] };
  console.log("ACCESS=YES  title:", j.properties?.title);
  console.log("TABS (", j.sheets?.length, "):");
  for (const s of j.sheets ?? []) console.log(`  - ${s.properties.title}  [${s.properties.gridProperties?.rowCount}x${s.properties.gridProperties?.columnCount}]`);
}
main().catch((e)=>{console.error("ERR", e.message); process.exit(1);});
