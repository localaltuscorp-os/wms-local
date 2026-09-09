"use client";

import * as React from "react";
import { LookupSelect } from "@/components/ui/lookup-select";
import { addInterviewPosition, deleteInterviewPosition } from "@/app/(app)/hr/candidate-actions";

/**
 * "Position Applied For" — the professional searchable combobox (the standardised
 * LookupSelect used across the app) whose options ARE the live Interview
 * Positions master. For authorised users (canManage) each option carries a Delete
 * control and an inline "Add" row; changes persist via the candidate-actions
 * server actions. Styled to sit inside the intake form's floating-label box, so
 * it matches every other field (and the Department dropdown) exactly.
 */
export function IntakePositionSelect({
  value,
  onChange,
  seed,
  canManage,
  error,
  label = "Position Applied For",
}: {
  value: string;
  onChange: (v: string) => void;
  seed: string[];
  canManage: boolean;
  autoFocus?: boolean;
  error?: boolean;
  label?: string;
}) {
  const options = React.useMemo(() => seed.map((s) => ({ id: s, name: s })), [seed]);

  const onAdd = canManage
    ? async (name: string) => {
        const res = await addInterviewPosition(name);
        if (!res.ok) return { ok: false as const, error: res.error };
        onChange(res.label);
        return { ok: true as const, option: { id: res.label, name: res.label } };
      }
    : undefined;

  const onDelete = canManage
    ? async (id: string) => {
        const res = await deleteInterviewPosition(id);
        if (!res.ok) return { ok: false as const, error: res.error };
        if (value === id) onChange("");
        return { ok: true as const };
      }
    : undefined;

  return (
    <div className={`iwf is-float${error ? " is-error" : ""}`}>
      <LookupSelect
        label="position"
        value={value || null}
        onChange={(v) => onChange(v ?? "")}
        options={options}
        onAdd={onAdd}
        onDelete={onDelete}
        placeholder="— Select —"
        className="iwf-control iwf-lookup"
      />
      <label className="iwf-label">
        {label}
        <span className="iwf-req" aria-hidden>*</span>
      </label>
    </div>
  );
}
