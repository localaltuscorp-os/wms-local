import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { normalizeQuery, rankHits, type RankSignals } from "@/lib/search/rank";
import type { TaskStatus } from "@/db/enums";

// Isolated from next/cache so server actions can import this without pulling in
// the unstable_cache-wrapped list queries. Each entity is searched by its own
// GIN-indexed sub-query; results are ranked in JS (active before archived).

const PER_GROUP = 6;
const CANDIDATE_CAP = 30; // coarse SQL cap; JS re-ranks then slices to PER_GROUP
const FUZZY_MIN = 0.3;    // word_similarity floor for the small tables

export interface TaskHit {
  id: string;
  taskNo: number | null;
  title: string;
  client: string | null;
  subject: string | null;
  status: TaskStatus;
  doerName: string | null;
  archived: boolean;
}
export interface ClientHit { id: string; name: string }
export interface ProjectHit { id: string; rootId: string; name: string; kind: string }
export interface PersonHit { id: string; name: string; email: string; department: string | null; isActive: boolean }
export interface OutstandingHit { id: string; clientName: string; status: string }
export interface DocumentHit { id: string; title: string; taskId: string | null }

export interface GlobalSearchResult {
  tasks: TaskHit[];
  clients: ClientHit[];
  projects: ProjectHit[];
  people: PersonHit[];
  outstanding: OutstandingHit[];
  documents: DocumentHit[];
}

const EMPTY: GlobalSearchResult = {
  tasks: [], clients: [], projects: [], people: [], outstanding: [], documents: [],
};

type WithSignals<T> = T & { signals: RankSignals };

function take<T>(hits: WithSignals<T>[]): T[] {
  return rankHits(hits).slice(0, PER_GROUP).map(({ signals, ...rest }) => rest as unknown as T);
}

export async function globalSearch(rawQuery: string): Promise<GlobalSearchResult> {
  const { q, like, asNumber } = normalizeQuery(rawQuery);
  if (q.length < 2) return EMPTY;

  // Isolate per-group failures: one sub-query rejecting (e.g. a malformed
  // tsquery) must not blank the entire palette — that group just returns [].
  const safe = <T>(p: Promise<T[]>): Promise<T[]> => p.catch(() => []);

  const [tasks, clients, projects, people, outstanding, documents] = await Promise.all([
    safe(searchTasks(q, like, asNumber)),
    safe(searchClients(q, like)),
    safe(searchProjects(q, like)),
    safe(searchPeople(q, like)),
    safe(searchOutstanding(q, like)),
    safe(searchDocuments(q, like)),
  ]);

  return { tasks, clients, projects, people, outstanding, documents };
}

async function searchTasks(q: string, like: string, asNumber: number | null): Promise<TaskHit[]> {
  const rows = (await db.execute(sql`
    SELECT t.id, t.task_no, t.title, t.client, t.subject, t.status, t.archived,
           d.name AS doer_name,
           ts_rank(t.search_tsv, websearch_to_tsquery('english', ${q})) AS fts_rank,
           word_similarity(${q}, t.search_text) AS sim,
           (t.search_text ILIKE ${like}) AS ilike_hit,
           (${asNumber}::int IS NOT NULL AND t.task_no = ${asNumber}::int) AS exact_id,
           extract(epoch FROM t.created_at) * 1000 AS recency_ms
    FROM tasks t
    LEFT JOIN employees d ON d.id = t.doer_id
    WHERE t.search_tsv @@ websearch_to_tsquery('english', ${q})
       OR t.search_text ILIKE ${like}
       OR t.search_text %> ${q}
       OR (${asNumber}::int IS NOT NULL AND t.task_no = ${asNumber}::int)
    ORDER BY GREATEST(
      ts_rank(t.search_tsv, websearch_to_tsquery('english', ${q})),
      word_similarity(${q}, t.search_text)
    ) DESC
    LIMIT ${CANDIDATE_CAP}
  `)) as unknown as Array<{
    id: string; task_no: number | null; title: string; client: string | null;
    subject: string | null; status: TaskStatus; archived: boolean; doer_name: string | null;
    fts_rank: number; sim: number; ilike_hit: boolean; exact_id: boolean; recency_ms: number;
  }>;

  return take(
    rows.map((r) => ({
      id: r.id, taskNo: r.task_no, title: r.title, client: r.client, subject: r.subject,
      status: r.status, doerName: r.doer_name, archived: r.archived,
      signals: {
        similarity: Number(r.sim) || 0,
        ftsRank: Number(r.fts_rank) || 0,
        ilikeHit: r.ilike_hit,
        exactId: r.exact_id,
        archived: r.archived,
        recencyMs: Number(r.recency_ms) || 0,
      } satisfies RankSignals,
    })),
  );
}

async function searchClients(q: string, like: string): Promise<ClientHit[]> {
  const rows = (await db.execute(sql`
    SELECT id, name,
           word_similarity(${q}, name) AS sim,
           (name ILIKE ${like}) AS ilike_hit,
           extract(epoch FROM created_at) * 1000 AS recency_ms
    FROM clients
    WHERE name ILIKE ${like} OR word_similarity(${q}, name) > ${FUZZY_MIN}
    ORDER BY word_similarity(${q}, name) DESC
    LIMIT ${CANDIDATE_CAP}
  `)) as unknown as Array<{ id: string; name: string; sim: number; ilike_hit: boolean; recency_ms: number }>;

  return take(
    rows.map((r) => ({
      id: r.id, name: r.name,
      signals: { similarity: Number(r.sim) || 0, ilikeHit: r.ilike_hit, exactId: false, recencyMs: Number(r.recency_ms) || 0 },
    })),
  );
}

async function searchProjects(q: string, like: string): Promise<ProjectHit[]> {
  // Match any node by name/description, then climb parent_id to the kind='project'
  // root so every hit navigates to /projects/<rootId>.
  const rows = (await db.execute(sql`
    WITH matched AS (
      SELECT id, name, kind, parent_id,
             GREATEST(word_similarity(${q}, name), word_similarity(${q}, coalesce(description,''))) AS sim,
             (name ILIKE ${like} OR coalesce(description,'') ILIKE ${like}) AS ilike_hit,
             extract(epoch FROM created_at) * 1000 AS recency_ms
      FROM project_nodes
      WHERE is_archived = false
        AND (name ILIKE ${like}
          OR coalesce(description,'') ILIKE ${like}
          OR word_similarity(${q}, name) > ${FUZZY_MIN}
          OR word_similarity(${q}, coalesce(description,'')) > ${FUZZY_MIN})
      ORDER BY sim DESC
      LIMIT ${CANDIDATE_CAP}
    ),
    roots AS (
      SELECT m.id AS match_id,
             (WITH RECURSIVE climb(id, parent_id, kind, depth) AS (
                SELECT pn.id, pn.parent_id, pn.kind, 0 FROM project_nodes pn WHERE pn.id = m.id
                UNION ALL
                SELECT pn.id, pn.parent_id, pn.kind, c.depth + 1
                FROM project_nodes pn JOIN climb c ON pn.id = c.parent_id
                WHERE c.depth < 20
              )
              SELECT id FROM climb WHERE kind = 'project' LIMIT 1) AS root_id
      FROM matched m
    )
    SELECT m.id, m.name, m.kind, m.sim, m.ilike_hit, m.recency_ms,
           coalesce(r.root_id, m.id) AS root_id
    FROM matched m JOIN roots r ON r.match_id = m.id
  `)) as unknown as Array<{
    id: string; name: string; kind: string; sim: number; ilike_hit: boolean; recency_ms: number; root_id: string;
  }>;

  return take(
    rows.map((r) => ({
      id: r.id, rootId: r.root_id, name: r.name, kind: r.kind,
      signals: { similarity: Number(r.sim) || 0, ilikeHit: r.ilike_hit, exactId: false, recencyMs: Number(r.recency_ms) || 0 },
    })),
  );
}

async function searchPeople(q: string, like: string): Promise<PersonHit[]> {
  const rows = (await db.execute(sql`
    SELECT id, name, email, department, is_active,
           GREATEST(word_similarity(${q}, name), word_similarity(${q}, email),
                    word_similarity(${q}, coalesce(department,''))) AS sim,
           (name ILIKE ${like} OR email ILIKE ${like} OR coalesce(department,'') ILIKE ${like}) AS ilike_hit,
           extract(epoch FROM created_at) * 1000 AS recency_ms
    FROM employees
    WHERE name ILIKE ${like} OR email ILIKE ${like} OR coalesce(department,'') ILIKE ${like}
       OR word_similarity(${q}, name) > ${FUZZY_MIN}
    ORDER BY sim DESC
    LIMIT ${CANDIDATE_CAP}
  `)) as unknown as Array<{
    id: string; name: string; email: string; department: string | null; is_active: boolean;
    sim: number; ilike_hit: boolean; recency_ms: number;
  }>;

  return take(
    rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, department: r.department, isActive: r.is_active,
      signals: { similarity: Number(r.sim) || 0, ilikeHit: r.ilike_hit, exactId: false, inactive: !r.is_active, recencyMs: Number(r.recency_ms) || 0 },
    })),
  );
}

async function searchOutstanding(q: string, like: string): Promise<OutstandingHit[]> {
  const rows = (await db.execute(sql`
    SELECT id, client_name, status,
           GREATEST(word_similarity(${q}, client_name),
                    word_similarity(${q}, coalesce(first_name,'')),
                    word_similarity(${q}, coalesce(last_name,''))) AS sim,
           (client_name ILIKE ${like} OR coalesce(first_name,'') ILIKE ${like}
             OR coalesce(last_name,'') ILIKE ${like}) AS ilike_hit,
           extract(epoch FROM created_at) * 1000 AS recency_ms
    FROM outstanding_contracts
    WHERE client_name ILIKE ${like} OR coalesce(first_name,'') ILIKE ${like}
       OR coalesce(last_name,'') ILIKE ${like} OR word_similarity(${q}, client_name) > ${FUZZY_MIN}
    ORDER BY sim DESC
    LIMIT ${CANDIDATE_CAP}
  `)) as unknown as Array<{ id: string; client_name: string; status: string; sim: number; ilike_hit: boolean; recency_ms: number }>;

  return take(
    rows.map((r) => ({
      id: r.id, clientName: r.client_name, status: r.status,
      signals: { similarity: Number(r.sim) || 0, ilikeHit: r.ilike_hit, exactId: false, recencyMs: Number(r.recency_ms) || 0 },
    })),
  );
}

async function searchDocuments(q: string, like: string): Promise<DocumentHit[]> {
  const rows = (await db.execute(sql`
    SELECT id, title, task_id,
           GREATEST(word_similarity(${q}, title), word_similarity(${q}, coalesce(description,''))) AS sim,
           (title ILIKE ${like} OR coalesce(description,'') ILIKE ${like}) AS ilike_hit,
           extract(epoch FROM created_at) * 1000 AS recency_ms
    FROM documents
    WHERE title ILIKE ${like} OR coalesce(description,'') ILIKE ${like}
       OR word_similarity(${q}, title) > ${FUZZY_MIN}
    ORDER BY sim DESC
    LIMIT ${CANDIDATE_CAP}
  `)) as unknown as Array<{ id: string; title: string; task_id: string | null; sim: number; ilike_hit: boolean; recency_ms: number }>;

  return take(
    rows.map((r) => ({
      id: r.id, title: r.title, taskId: r.task_id,
      signals: { similarity: Number(r.sim) || 0, ilikeHit: r.ilike_hit, exactId: false, recencyMs: Number(r.recency_ms) || 0 },
    })),
  );
}
