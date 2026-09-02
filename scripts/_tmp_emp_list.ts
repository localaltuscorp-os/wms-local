import { db } from "../lib/db";
import { employees } from "../db/schema";
async function main() {
  const emps = await db.select({ name: employees.name, active: employees.isActive }).from(employees);
  emps.sort((a,b)=>a.name.localeCompare(b.name));
  for (const e of emps) console.log(`${e.active ? " " : "x"} ${e.name}`);
  process.exit(0);
}
main().catch((e)=>{console.error(e);process.exit(1);});
