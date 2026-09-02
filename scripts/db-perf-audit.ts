// Read-only DB performance audit. Connects on its OWN max:1 connection
// (NOT the app pool) and reads Postgres' own statistics catalogs to find
// real optimization opportunities — no writes, no DDL, no pool changes.
//
//   pnpm tsx --env-file=.env.local scripts/db-perf-audit.ts
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5 });

function h(title: string) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

async function main() {
  // 1) Table scan profile: tables where Postgres falls back to seq scans a
  //    lot relative to index scans, weighted by size — the prime index targets.
  h("1. TABLE SCAN PROFILE (seq vs index, by live rows)");
  const tables = await sql.unsafe(`
    select
      relname                                  as table,
      n_live_tup                               as rows,
      seq_scan,
      coalesce(idx_scan, 0)                    as idx_scan,
      seq_tup_read,
      case when seq_scan > 0
           then round(seq_tup_read::numeric / seq_scan, 0)
           else 0 end                          as avg_rows_per_seqscan,
      pg_size_pretty(pg_total_relation_size(relid)) as total_size
    from pg_stat_user_tables
    order by seq_tup_read desc nulls last
    limit 30;
  `);
  console.table(tables);

  // 2) pg_stat_statements — the REAL slow queries by cumulative time.
  h("2. TOP QUERIES BY TOTAL EXEC TIME (pg_stat_statements)");
  try {
    const stmts = await sql.unsafe(`
      select
        round(total_exec_time::numeric)::int       as total_ms,
        calls,
        round(mean_exec_time::numeric, 1)          as mean_ms,
        round(stddev_exec_time::numeric, 1)        as stddev_ms,
        rows,
        left(regexp_replace(query, '\\s+', ' ', 'g'), 150) as query
      from pg_stat_statements
      where query not ilike '%pg_stat%'
        and query not ilike '%pg_catalog%'
        and query not ilike '%information_schema%'
      order by total_exec_time desc
      limit 25;
    `);
    console.table(stmts);
  } catch (e) {
    console.log("  pg_stat_statements not available:", (e as Error).message);
    console.log("  (extension not enabled — relying on scan profile + static analysis)");
  }

  // 3) Existing indexes per table (so we don't propose duplicates).
  h("3. EXISTING INDEXES (per table)");
  const idx = await sql.unsafe(`
    select tablename as table, indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
    order by tablename, indexname;
  `);
  const byTable: Record<string, string[]> = {};
  for (const r of idx as unknown as Array<{ table: string; indexname: string; indexdef: string }>) {
    (byTable[r.table] ??= []).push(
      `${r.indexname}: ${r.indexdef.replace(/^CREATE (UNIQUE )?INDEX \S+ ON \S+ USING /, "")}`,
    );
  }
  for (const [t, list] of Object.entries(byTable)) {
    console.log(`\n  ${t} (${list.length})`);
    for (const l of list) console.log(`    - ${l}`);
  }

  // 4) Unused indexes (idx_scan = 0) — write-amplification bloat candidates.
  h("4. UNUSED INDEXES (idx_scan = 0, excl. PK/unique constraints)");
  const unused = await sql.unsafe(`
    select
      s.relname as table,
      s.indexrelname as index,
      pg_size_pretty(pg_relation_size(s.indexrelid)) as size,
      s.idx_scan
    from pg_stat_user_indexes s
    join pg_index i on i.indexrelid = s.indexrelid
    where s.idx_scan = 0
      and not i.indisprimary
      and not i.indisunique
    order by pg_relation_size(s.indexrelid) desc
    limit 30;
  `);
  console.table(unused);

  // 5) Cache hit ratio sanity — is the working set in memory?
  h("5. CACHE HIT RATIO (heap)");
  const cache = await sql.unsafe(`
    select
      sum(heap_blks_read) as disk_reads,
      sum(heap_blks_hit)  as cache_hits,
      round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) as hit_pct
    from pg_statio_user_tables;
  `);
  console.table(cache);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
