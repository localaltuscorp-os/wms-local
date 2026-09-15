import { describe, it, expect } from "vitest";
import { checkDccItemDelete, DCC_GIVEN_KPI_LOCKED } from "@/lib/dcc/item-lock";

/**
 * A KPI MANAN SIR GAVE IS HIS ALONE TO DELETE (account holder, 2026-09-15).
 *
 * Team Leads add KPIs for themselves and their team, and delete the rest.
 */

const MANAN = "manan@unleashed.in";
const LEAD = "ruchitaambre.altuscorp@gmail.com";
const ROHAN = "rohanchoudhary.altuscorp@gmail.com";
const OWNER = "shreyarandhe.altuscorp@gmail.com";
const LOCKED = { ok: false, error: DCC_GIVEN_KPI_LOCKED };

describe("deleting a KPI Manan Sir gave", () => {
  it("is refused to the Team Lead, the owner, and the other super-admin", () => {
    expect(checkDccItemDelete({ actorEmail: LEAD, creatorEmail: MANAN })).toEqual(LOCKED);
    expect(checkDccItemDelete({ actorEmail: OWNER, creatorEmail: MANAN })).toEqual(LOCKED);
    expect(checkDccItemDelete({ actorEmail: ROHAN, creatorEmail: MANAN })).toEqual(LOCKED);
  });

  it("is allowed to Manan Sir, whatever the casing", () => {
    expect(checkDccItemDelete({ actorEmail: " MANAN@unleashed.in", creatorEmail: "Manan@Unleashed.in" })).toEqual({ ok: true });
  });

  it("is refused to a signed-out or unknown actor", () => {
    expect(checkDccItemDelete({ actorEmail: null, creatorEmail: MANAN })).toEqual(LOCKED);
  });
});

describe("deleting any other KPI", () => {
  it("is allowed — the Team Lead's own, another lead's, or one with no recorded creator", () => {
    expect(checkDccItemDelete({ actorEmail: LEAD, creatorEmail: LEAD })).toEqual({ ok: true });
    expect(checkDccItemDelete({ actorEmail: LEAD, creatorEmail: ROHAN })).toEqual({ ok: true });
    expect(checkDccItemDelete({ actorEmail: LEAD, creatorEmail: null })).toEqual({ ok: true });
  });
});
