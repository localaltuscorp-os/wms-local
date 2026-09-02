import { db, tasks, employees } from "@/lib/db";

async function main() {
  console.log("Truncating tasks + employees...");
  await db.delete(tasks);
  await db.delete(employees);
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
