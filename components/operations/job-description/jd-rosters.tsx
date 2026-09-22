"use client";

import * as React from "react";

/**
 * THE WMS TASKS ROSTERS, for every JD screen (account holder, 2026-09-18).
 *
 * A JD's Subject and Client are picked from the same lists a WMS task's are —
 * Admin Panel → Subjects and → Clients — so a JD is filed in the words a task
 * is. The Bank provides them once; the form, the drawer and a person's JD read
 * them here rather than having them threaded through every layer between.
 */
export interface JdRosters {
  clients: string[];
  subjects: string[];
  /** May this viewer add a new client or subject from the picker? (Admin Panel rule.) */
  canAdd: boolean;
  /** Who is looking — Doer Notes are theirs to write on their own JD. */
  viewerId: string | null;
  /** HR keeps the JDs, so HR may write anyone's Doer Notes. */
  viewerIsHr: boolean;
}

export const EMPTY_JD_ROSTERS: JdRosters = {
  clients: [],
  subjects: [],
  canAdd: false,
  viewerId: null,
  viewerIsHr: false,
};

const Ctx = React.createContext<JdRosters>(EMPTY_JD_ROSTERS);

export const JdRostersProvider = Ctx.Provider;

export function useJdRosters(): JdRosters {
  return React.useContext(Ctx);
}
