import { getServiceAccountToken, GOOGLE_SCOPES } from "@/lib/google/service-account";
const ID = "1bN6ycsR8SwJDhSOPwzEau10MUqWFXiDB5zULAqN3hPM";
const TABS = ["Index","CA Handover","Accounts Tasks","Screenshots to Send","2. Wkly Checklist","3. Mth Qtr Annual Checklist","5. Due Date","6. SIP","7. Collection Master","8. FNO Income","9. Bank Balance","10. Cash Withdrawal Tracker","11. Vasa Family Interpersonal ","4. CC Master 25-26","12. CC Master 26-27"];
async function main() {
  const token = await getServiceAccountToken([GOOGLE_SCOPES.sheets]);
  const ranges = TABS.map((t) => `ranges=${encodeURIComponent(`'${t}'!A1:AB5`)}`).join("&");
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ID}/values:batchGet?${ranges}&majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { console.error(res.status, await res.text()); process.exit(1); }
  const j = await res.json() as { valueRanges?: { range:string; values?:string[][] }[] };
  (j.valueRanges ?? []).forEach((vr, i) => {
    console.log(`\n===== ${TABS[i]} =====`);
    (vr.values ?? []).forEach((row, r) => {
      const cells = row.map((c) => (c ?? "").toString().replace(/\s+/g," ").trim()).filter(Boolean);
      if (cells.length) console.log(`  r${r+1}: ${cells.join(" | ")}`);
    });
  });
}
main().catch((e)=>{console.error(e.message);process.exit(1);});
