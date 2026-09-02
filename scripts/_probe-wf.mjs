import { readFileSync } from "node:fs";
const [OUT, JOURNAL] = process.argv.slice(2);
console.log("=== .output top-level ===");
try { const d = JSON.parse(readFileSync(OUT,"utf8")); console.log("keys:", Object.keys(d)); console.log("preview:", JSON.stringify(d).slice(0,300)); }
catch(e){ const r = readFileSync(OUT,"utf8"); console.log("not pure JSON; first 200:", r.slice(0,200)); }
console.log("\n=== journal.jsonl ===");
const lines = readFileSync(JOURNAL,"utf8").trim().split("\n");
console.log("lines:", lines.length);
for (const ln of lines) {
  try { const o = JSON.parse(ln);
    const label = o.label ?? o.agentLabel ?? o.name ?? "?";
    const type = o.type ?? "?";
    let vlen = 0, vkind = typeof o.value;
    if (o.value != null) vlen = (typeof o.value === "string" ? o.value : JSON.stringify(o.value)).length;
    console.log(`type=${type} label=${label} valueKind=${vkind} valueLen=${vlen} keys=[${Object.keys(o).join(",")}]`);
  } catch { console.log("(unparseable line)"); }
}
