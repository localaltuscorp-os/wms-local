import { describe, it, expect } from "vitest";
import { syncChunk, ROOT_FOLDER_NAME, type SyncDeps } from "@/lib/hr/records-export/sync-core";
import {
  DriveAuthError,
  emptySummary,
  type DriveClient,
  type LedgerItem,
  type PersonRef,
  type RecordEntry,
  type RunSummary,
} from "@/lib/hr/records-export/types";

interface Node {
  name: string;
  parent: string | null;
  folder: boolean;
  data?: string;
  trashed: boolean;
}

/** An in-memory Drive with the semantics the real client promises. */
function fakeDrive() {
  const nodes = new Map<string, Node>();
  let seq = 0;
  const calls = { ensureFolder: 0, putFile: 0 };
  // Like Drive: anything inside a trashed folder counts as trashed too.
  const inBin = (id: string): boolean => {
    for (let cur: string | null = id; cur; cur = nodes.get(cur)?.parent ?? null) if (nodes.get(cur)?.trashed) return true;
    return false;
  };
  const alive = (id: string | null) => (id && nodes.get(id) && !inBin(id) ? nodes.get(id)! : null);
  const client: DriveClient = {
    async ensureFolder({ name, parentId, knownId }) {
      calls.ensureFolder++;
      const hit = alive(knownId);
      if (hit && knownId) {
        hit.name = name;
        return knownId;
      }
      const id = `d${++seq}`;
      nodes.set(id, { name, parent: parentId, folder: true, trashed: false });
      return id;
    },
    async putFile({ name, parentId, data, knownId }) {
      calls.putFile++;
      const text = new TextDecoder().decode(data);
      const hit = alive(knownId);
      if (hit && knownId) {
        hit.name = name;
        hit.data = text;
        hit.parent = parentId;
        return knownId;
      }
      const id = `d${++seq}`;
      nodes.set(id, { name, parent: parentId, folder: false, data: text, trashed: false });
      return id;
    },
  };
  /** "HR Records/Asha (a@x)/Forms/Form.pdf" → contents, for every live file. */
  const tree = () => {
    const pathOf = (id: string): string | null => {
      const n = nodes.get(id)!;
      if (n.trashed) return null;
      if (n.parent === null) return n.name;
      const p = pathOf(n.parent);
      return p === null ? null : `${p}/${n.name}`;
    };
    const out: Record<string, string> = {};
    for (const [id, n] of nodes) {
      const p = pathOf(id);
      if (!n.folder && p) out[p] = n.data!;
    }
    return out;
  };
  const trash = (name: string) => {
    for (const n of nodes.values()) if (n.name === name) n.trashed = true;
  };
  return { client, calls, tree, trash, nodes };
}

const ASHA: PersonRef = { id: "1", name: "Asha", email: "a@x", isActive: true };
const RAVI: PersonRef = { id: "2", name: "Ravi", email: "r@x", isActive: true };
const MEERA: PersonRef = { id: "3", name: "Meera", email: "m@x", isActive: false };

function entry(key: string, folder: RecordEntry["folder"], name: string, version: string, body = `${key}@${version}`): RecordEntry {
  return { key, folder, name, mime: "application/pdf", version, load: async () => new TextEncoder().encode(body) };
}

function harness(records: Record<string, RecordEntry[]>, people = [ASHA, RAVI, MEERA]) {
  const drive = fakeDrive();
  const ledger = new Map<string, LedgerItem>();
  let clock = 1_000;
  const progress: string[] = [];
  const deps: SyncDeps = {
    drive: drive.client,
    listPeople: async (after) => people.filter((p) => after === null || p.id > after),
    collect: async (p) => records[p.id] ?? [],
    ledgerGet: async (keys) => new Map(keys.filter((k) => ledger.has(k)).map((k) => [k, ledger.get(k)!])),
    ledgerPut: async (item) => void ledger.set(item.key, item),
    saveProgress: async (cursor) => void progress.push(cursor),
    now: () => clock,
  };
  const run = async (summary: RunSummary = emptySummary("manual", clock), cursor: string | null = null, deadline = Infinity) =>
    syncChunk(deps, { cursor, summary, deadline });
  return { deps, drive, ledger, progress, run, tick: (ms: number) => void (clock += ms) };
}

describe("HR records Drive save", () => {
  it("builds HR Records / person / folder and uploads everything on the first save", async () => {
    const h = harness({
      "1": [entry("form:a", "Forms", "Onboarding Form.pdf", "v1"), entry("doc:b", "Documents", "Aadhaar Card.png", "p1")],
      "2": [entry("letter:c", "Letters", "Offer Letter.pdf", "v1")],
    });
    const res = await h.run();
    expect(res.done).toBe(true);
    expect(res.cursor).toBeNull();
    expect(res.summary).toMatchObject({ peopleDone: 3, peopleWithFiles: 2, uploaded: 3, updated: 0, unchanged: 0, failed: 0 });
    expect(res.summary.finishedAt).not.toBeNull();
    expect(h.drive.tree()).toEqual({
      [`${ROOT_FOLDER_NAME}/Asha (a@x)/Forms/Onboarding Form.pdf`]: "form:a@v1",
      [`${ROOT_FOLDER_NAME}/Asha (a@x)/Documents/Aadhaar Card.png`]: "doc:b@p1",
      [`${ROOT_FOLDER_NAME}/Ravi (r@x)/Letters/Offer Letter.pdf`]: "letter:c@v1",
    });
    // Meera has nothing on file: no folder for her.
    expect([...h.drive.nodes.values()].some((n) => n.name.startsWith("Meera"))).toBe(false);
  });

  it("skips unchanged files and overwrites changed ones in place", async () => {
    const records = { "1": [entry("form:a", "Forms", "Onboarding Form.pdf", "v1"), entry("doc:b", "Documents", "Aadhaar Card.png", "p1")] };
    const h = harness(records);
    await h.run();
    const fileIds = [...h.ledger.values()].filter((i) => i.key.startsWith("file:")).map((i) => i.driveId).sort();
    const puts = h.drive.calls.putFile;

    const second = await h.run();
    expect(second.summary).toMatchObject({ uploaded: 0, updated: 0, unchanged: 2 });
    expect(h.drive.calls.putFile).toBe(puts);

    records["1"][0] = entry("form:a", "Forms", "Onboarding Form.pdf", "v2");
    const third = await h.run();
    expect(third.summary).toMatchObject({ uploaded: 0, updated: 1, unchanged: 1 });
    expect(h.drive.tree()[`${ROOT_FOLDER_NAME}/Asha (a@x)/Forms/Onboarding Form.pdf`]).toBe("form:a@v2");
    // Same Drive ids — nothing duplicated.
    expect([...h.ledger.values()].filter((i) => i.key.startsWith("file:")).map((i) => i.driveId).sort()).toEqual(fileIds);
    expect(Object.keys(h.drive.tree())).toHaveLength(2);
  });

  it("follows a person's rename without re-uploading their files", async () => {
    const people = [{ ...ASHA }];
    const h = harness({ "1": [entry("form:a", "Forms", "Onboarding Form.pdf", "v1")] }, people);
    await h.run();
    people[0]!.name = "Asha K";
    const res = await h.run();
    expect(res.summary).toMatchObject({ uploaded: 0, updated: 0, unchanged: 1 });
    expect(Object.keys(h.drive.tree())).toEqual([`${ROOT_FOLDER_NAME}/Asha K (a@x)/Forms/Onboarding Form.pdf`]);
  });

  it("recreates a folder someone deleted in Drive and puts its files back", async () => {
    const h = harness({ "1": [entry("form:a", "Forms", "Onboarding Form.pdf", "v1"), entry("doc:b", "Documents", "Aadhaar Card.png", "p1")] });
    await h.run();
    h.drive.trash("Asha (a@x)");
    expect(h.drive.tree()).toEqual({});
    const res = await h.run();
    expect(res.summary).toMatchObject({ uploaded: 0, updated: 2, unchanged: 0 });
    expect(Object.keys(h.drive.tree()).sort()).toEqual([
      `${ROOT_FOLDER_NAME}/Asha (a@x)/Documents/Aadhaar Card.png`,
      `${ROOT_FOLDER_NAME}/Asha (a@x)/Forms/Onboarding Form.pdf`,
    ]);
  });

  it("moves a file whose folder changed instead of leaving a copy behind", async () => {
    const records = { "1": [entry("empdoc:a", "Documents", "Appointment Letter.pdf", "p1")] };
    const h = harness(records);
    await h.run();
    records["1"][0] = entry("empdoc:a", "Letters", "Appointment Letter.pdf", "p1");
    const res = await h.run();
    expect(res.summary).toMatchObject({ uploaded: 0, updated: 1, unchanged: 0 });
    expect(Object.keys(h.drive.tree())).toEqual([`${ROOT_FOLDER_NAME}/Asha (a@x)/Letters/Appointment Letter.pdf`]);
  });

  it("stops at the deadline and resumes from the next person", async () => {
    const h = harness({
      "1": [entry("form:a", "Forms", "A.pdf", "v1")],
      "2": [entry("form:b", "Forms", "B.pdf", "v1")],
      "3": [entry("form:c", "Forms", "C.pdf", "v1")],
    });
    const origCollect = h.deps.collect;
    h.deps.collect = async (p) => {
      h.tick(10);
      return origCollect(p);
    };
    const summary = emptySummary("schedule", 1_000);
    const first = await h.run(summary, null, 1_015); // time for two people, not three
    expect(first.done).toBe(false);
    expect(first.cursor).toBe("2");
    expect(first.summary).toMatchObject({ peopleDone: 2, uploaded: 2 });
    expect(h.progress).toEqual(["1", "2"]);

    const second = await h.run(first.summary, first.cursor);
    expect(second.done).toBe(true);
    expect(second.summary).toMatchObject({ peopleDone: 3, uploaded: 3 });
    expect(Object.keys(h.drive.tree())).toHaveLength(3);
  });

  it("records a broken file, carries on, and retries it next time", async () => {
    const broken: RecordEntry = { ...entry("doc:x", "Documents", "Missing.png", "p1"), load: async () => null };
    const records = { "1": [broken, entry("form:a", "Forms", "A.pdf", "v1")] };
    const h = harness(records);
    const res = await h.run();
    expect(res.done).toBe(true);
    expect(res.summary).toMatchObject({ uploaded: 1, failed: 1 });
    expect(res.summary.failures[0]).toMatchObject({ person: "Asha", file: "Documents/Missing.png" });
    expect(h.ledger.has("file:1/doc:x")).toBe(false);

    records["1"][0] = entry("doc:x", "Documents", "Missing.png", "p1");
    const again = await h.run();
    expect(again.summary).toMatchObject({ uploaded: 1, unchanged: 1, failed: 0 });
  });

  it("records a person whose record could not be read, and carries on", async () => {
    const h = harness({ "2": [entry("form:b", "Forms", "B.pdf", "v1")] });
    const origCollect = h.deps.collect;
    h.deps.collect = async (p) => {
      if (p.id === "1") throw new Error("database timeout");
      return origCollect(p);
    };
    const res = await h.run();
    expect(res.done).toBe(true);
    expect(res.summary).toMatchObject({ peopleDone: 3, uploaded: 1, failed: 1 });
    expect(res.summary.failures[0]).toMatchObject({ person: "Asha", error: "database timeout" });
  });

  it("stops the whole save when the Drive connection itself is broken", async () => {
    const h = harness({ "1": [entry("form:a", "Forms", "A.pdf", "v1")], "2": [entry("form:b", "Forms", "B.pdf", "v1")] });
    h.deps.drive = {
      ...h.drive.client,
      putFile: async () => {
        throw new DriveAuthError("Reconnect Google Drive.");
      },
    };
    await expect(h.run()).rejects.toBeInstanceOf(DriveAuthError);
    expect(h.progress).toEqual([]);
  });
});
