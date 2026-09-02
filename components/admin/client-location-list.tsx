"use client";

import * as React from "react";
import { Loader2, MapPin, MapPinOff, Pencil, Plus, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { DataTable } from "@/components/admin/ui/data-table";
import type { ClientLocationRow } from "@/lib/attendance/client-locations";
import { mapsLinkFor } from "@/lib/attendance/maps-link";
import {
  retireClientLocationAction,
  saveClientLocationAction,
} from "@/app/(admin)/admin/client-locations/actions";

/**
 * The Admin list of client sites, plus the add/edit form.
 *
 * `canEdit` hides the controls for everyone outside the three named people. That
 * is presentation only — every action re-checks the same predicate server-side,
 * so this can be wrong without being unsafe.
 *
 * COORDINATES ARE NEVER TYPED. The form takes a pasted Google Maps link and the
 * server derives lat/lng from it. Asking an admin to type a latitude is asking
 * for a transposed digit that puts a client site in the sea.
 */
export function ClientLocationList({
  rows,
  canEdit,
}: {
  rows: ClientLocationRow[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = React.useState<ClientLocationRow | null>(null);
  const [adding, setAdding] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      {canEdit && !adding && !editing && (
        <div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13.5px] font-bold text-white transition-colors"
            style={{ background: "var(--color-altus-red)" }}
          >
            <Plus size={15} strokeWidth={2.6} /> Add client location
          </button>
        </div>
      )}

      {(adding || editing) && (
        <LocationForm
          initial={editing}
          onDone={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      <DataTable
        rows={rows}
        getRowKey={(r) => r.id}
        searchText={(r) => `${r.name} ${r.address ?? ""}`}
        initialSort={{ key: "name", dir: "asc" }}
        filters={[
          {
            label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "retired", label: "Retired" },
            ],
            match: (r, v) => (v === "active" ? r.isActive : !r.isActive),
          },
          {
            label: "Map pin",
            options: [
              { value: "pinned", label: "Has a pin" },
              { value: "unpinned", label: "No pin" },
            ],
            match: (r, v) =>
              v === "pinned" ? r.lat != null && r.lng != null : r.lat == null || r.lng == null,
          },
        ]}
        columns={[
          {
            key: "name",
            label: "Client site",
            sortValue: (r) => r.name.toLowerCase(),
            render: (r) => (
              <span className="inline-flex items-center gap-2">
                <span className="font-semibold text-ink-strong">{r.name}</span>
                {!r.isActive && (
                  <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[11.5px] font-bold text-ink-subtle">
                    Retired
                  </span>
                )}
              </span>
            ),
          },
          {
            key: "address",
            label: "Address",
            sortValue: (r) => (r.address ?? "").toLowerCase(),
            render: (r) => r.address || <span className="text-ink-subtle">—</span>,
          },
          {
            key: "pin",
            label: "Map pin",
            render: (r) =>
              r.lat != null && r.lng != null ? (
                <a
                  href={mapsLinkFor(r.lat, r.lng)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold hover:underline"
                  style={{ color: "var(--color-altus-red)" }}
                >
                  <MapPin size={14} strokeWidth={2.4} />
                  {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                </a>
              ) : (
                <span className="text-ink-subtle inline-flex items-center gap-1.5 text-[13px]">
                  <MapPinOff size={14} /> No pin
                </span>
              ),
          },
          {
            key: "radius",
            label: "Radius",
            align: "right",
            sortValue: (r) => r.radiusM,
            render: (r) => <span className="tabular-nums">{r.radiusM} m</span>,
          },
        ]}
        rowActions={
          canEdit
            ? (r) => <RowActions row={r} onEdit={() => setEditing(r)} />
            : undefined
        }
      />
    </div>
  );
}

function RowActions({ row, onEdit }: { row: ClientLocationRow; onEdit: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  async function retire() {
    setBusy(true);
    try {
      const res = await retireClientLocationAction(row.id);
      if (!res.ok) fireToast({ message: res.error, type: "error" });
      else fireToast({ message: `${row.name} retired.` });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onEdit}
        className="text-ink-muted hover:text-ink-strong inline-flex h-8 w-8 items-center justify-center rounded-lg"
        aria-label={`Edit ${row.name}`}
      >
        <Pencil size={15} />
      </button>
      {row.isActive &&
        (confirming ? (
          <button
            type="button"
            disabled={busy}
            onClick={retire}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--color-altus-red)" }}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : "Confirm"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-ink-muted hover:text-ink-strong rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold"
          >
            Retire
          </button>
        ))}
    </span>
  );
}

function LocationForm({
  initial,
  onDone,
}: {
  initial: ClientLocationRow | null;
  onDone: () => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [address, setAddress] = React.useState(initial?.address ?? "");
  // Seeded from the stored link, or rebuilt from the coordinates so an existing
  // pin survives an edit that doesn't touch it.
  const [mapsUrl, setMapsUrl] = React.useState(
    initial?.mapsUrl ?? (initial?.lat != null && initial?.lng != null ? mapsLinkFor(initial.lat, initial.lng) : ""),
  );
  const [radius, setRadius] = React.useState(String(initial?.radiusM ?? 200));
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await saveClientLocationAction({
        id: initial?.id,
        name,
        address: address || null,
        mapsUrl: mapsUrl || null,
        radiusM: Number(radius) || 200,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: initial ? "Client location updated." : "Client location added." });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="bg-surface-card flex flex-col gap-3 rounded-[18px] p-5"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
    >
      <div className="flex items-center justify-between">
        <div className="text-ink-strong text-[15px] font-bold">
          {initial ? `Edit ${initial.name}` : "Add a client location"}
        </div>
        <button
          type="button"
          onClick={onDone}
          className="text-ink-muted hover:text-ink-strong"
          aria-label="Cancel"
        >
          <X size={17} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
        <Field label="Client / site name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            className="w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[13.5px]"
          />
        </Field>
        <Field label="Address (optional)">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={500}
            className="w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[13.5px]"
          />
        </Field>
      </div>

      <Field
        label="Google Maps link"
        hint="Drop a pin, tap Share → Copy link, and paste it here. A maps.app.goo.gl short link doesn't carry coordinates — use the full URL, or type “lat, lng”."
      >
        <input
          value={mapsUrl}
          onChange={(e) => setMapsUrl(e.target.value)}
          placeholder="https://www.google.com/maps/@19.0760,72.8777,17z"
          maxLength={2000}
          className="w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[13.5px]"
        />
      </Field>

      <Field label="Allowed radius (metres)" hint="How far from the pin still counts as being on site.">
        <input
          type="number"
          min={10}
          max={20000}
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
          className="w-40 rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[13.5px] tabular-nums"
        />
      </Field>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
          style={{ background: "var(--color-altus-red)" }}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {initial ? "Save changes" : "Add location"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-ink-muted hover:text-ink-strong rounded-lg px-4 py-2.5 text-[13.5px] font-semibold"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-ink-muted text-[12.5px] font-bold">{label}</span>
      {children}
      {hint && <span className="text-ink-subtle text-[12px] leading-relaxed">{hint}</span>}
    </label>
  );
}
