"use client";

import { useState, useTransition } from "react";
import { Info, Clock, Globe, Lock, ShieldCheck, MapPin, LocateFixed } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { updateOrgSettings } from "@/app/(admin)/admin/settings/actions";
import type { OrgSettings } from "@/db/schema";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const;

interface Props {
  current: OrgSettings;
}

export function SettingsForm({ current }: Props) {
  const [companyName, setCompanyName] = useState(current.companyName);
  const [logoUrl, setLogoUrl] = useState(current.logoUrl ?? "");
  const [digestHour, setDigestHour] = useState(current.digestHourIst);
  const [workingDays, setWorkingDays] = useState<number[]>(current.workingDays);
  const [timezone, setTimezone] = useState(current.timezone);
  const [idleTimeout, setIdleTimeout] = useState(current.idleTimeoutMinutes);
  const [allowSelfRegister, setAllowSelfRegister] = useState(
    current.allowSelfRegister,
  );
  const [officeLat, setOfficeLat] = useState(
    current.officeLat != null ? String(current.officeLat) : "",
  );
  const [officeLng, setOfficeLng] = useState(
    current.officeLng != null ? String(current.officeLng) : "",
  );
  const [radiusM, setRadiusM] = useState(current.attendanceRadiusM);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setError("This browser has no location support.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOfficeLat(pos.coords.latitude.toFixed(6));
        setOfficeLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setError("Couldn't read your location — allow location access and retry.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  }

  function toggleDay(d: number) {
    setWorkingDays((prev) =>
      prev.includes(d)
        ? prev.filter((x) => x !== d)
        : [...prev, d].sort((a, b) => a - b),
    );
  }

  function resetDefaults() {
    setCompanyName(current.companyName);
    setLogoUrl(current.logoUrl ?? "");
    setDigestHour(current.digestHourIst);
    setWorkingDays(current.workingDays);
    setTimezone(current.timezone);
    setIdleTimeout(current.idleTimeoutMinutes);
    setAllowSelfRegister(current.allowSelfRegister);
    setOfficeLat(current.officeLat != null ? String(current.officeLat) : "");
    setOfficeLng(current.officeLng != null ? String(current.officeLng) : "");
    setRadiusM(current.attendanceRadiusM);
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = companyName.trim();
    const trimmedLogo = logoUrl.trim();
    const trimmedTz = timezone.trim();

    const patch: {
      companyName?: string;
      logoUrl?: string | null;
      digestHourIst?: number;
      workingDays?: number[];
      timezone?: string;
      idleTimeoutMinutes?: number;
      allowSelfRegister?: boolean;
      officeLat?: number | null;
      officeLng?: number | null;
      attendanceRadiusM?: number;
    } = {};

    if (trimmedName !== current.companyName) patch.companyName = trimmedName;
    if (trimmedLogo !== (current.logoUrl ?? "")) {
      patch.logoUrl = trimmedLogo === "" ? null : trimmedLogo;
    }
    if (digestHour !== current.digestHourIst) patch.digestHourIst = digestHour;
    if (!sameDays(workingDays, current.workingDays))
      patch.workingDays = workingDays;
    if (trimmedTz !== current.timezone) patch.timezone = trimmedTz;
    if (idleTimeout !== current.idleTimeoutMinutes)
      patch.idleTimeoutMinutes = idleTimeout;
    if (allowSelfRegister !== current.allowSelfRegister)
      patch.allowSelfRegister = allowSelfRegister;

    // Geofence: both blank = clear; otherwise both must parse as numbers.
    // NB: Number("") is 0, which would silently anchor the office on the
    // equator — half-filled pairs must be a hard error, not a coercion.
    const latStr = officeLat.trim();
    const lngStr = officeLng.trim();
    if (latStr === "" && lngStr === "") {
      if (current.officeLat != null || current.officeLng != null) {
        patch.officeLat = null;
        patch.officeLng = null;
      }
    } else if (latStr === "" || lngStr === "") {
      setError("Office latitude and longitude must both be set (or both blank to disable the fence).");
      return;
    } else {
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setError("Latitude/longitude must be plain decimal numbers, e.g. 19.076090.");
        return;
      }
      if (lat !== current.officeLat) patch.officeLat = lat;
      if (lng !== current.officeLng) patch.officeLng = lng;
    }
    if (radiusM !== current.attendanceRadiusM) patch.attendanceRadiusM = radiusM;

    if (Object.keys(patch).length === 0) {
      setError("No changes to save.");
      return;
    }

    startTransition(async () => {
      const res = await updateOrgSettings(patch);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: "Settings saved." });
    });
  }

  // Deterministic format (explicit locale + tz) — bare toLocaleString()
  // differs between the server and the browser, which made this exact text
  // a hydration mismatch that re-rendered (and could wipe) the whole form.
  const updatedAtLabel =
    current.updatedAt instanceof Date && current.updatedAt.getTime() > 0
      ? new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }).format(current.updatedAt)
      : "never";

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 max-lg:grid-cols-1"
    >
      {/* LEFT — fieldsets */}
      <div className="space-y-5 min-w-0">
        <Section
          title="Identity"
          icon={<ShieldCheck size={14} strokeWidth={2.2} />}
        >
          <Field label="Company name">
            <Input
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field
            label="Logo URL"
            hint="Optional. Absolute URL — shown in email headers and the dashboard."
          >
            <Input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://"
              maxLength={2048}
            />
          </Field>
        </Section>

        <Section
          title="Daily digest"
          icon={<Clock size={14} strokeWidth={2.2} />}
        >
          <Field
            label="Digest hour (IST)"
            hint="Hour of day (0–23 IST) when the overdue digest is intended to fire. The Vercel cron schedule lives in vercel.json — change this value here AND there if you want a different time."
          >
            <Input
              type="number"
              min={0}
              max={23}
              value={digestHour}
              onChange={(e) => setDigestHour(Number(e.target.value))}
              className="w-28 tabular-nums"
            />
          </Field>
          <Field
            label="Auto sign-out after (minutes idle)"
            hint="Users get a 30-second warning before sign-out. 5–60 minutes."
          >
            <Input
              type="number"
              min={5}
              max={60}
              step={1}
              value={idleTimeout}
              onChange={(e) => setIdleTimeout(Number(e.target.value))}
              className="w-28 tabular-nums"
            />
          </Field>
          <Field
            label="Working days"
            hint="Days when the digest fires. Weekend days unchecked = no digest on those days."
          >
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const active = workingDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className="rounded-md border px-3.5 py-2 text-[13px] font-semibold transition-all"
                    style={
                      active
                        ? {
                            borderColor: "transparent",
                            background:
                              "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                            color: "#ffffff",
                            boxShadow:
                              "0 4px 10px -4px rgba(225, 6, 0, 0.40)",
                          }
                        : {
                            borderColor: "var(--color-hairline-strong)",
                            background: "var(--color-surface-card)",
                            color: "var(--color-ink-soft)",
                          }
                    }
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </Field>
        </Section>

        <Section title="Locale" icon={<Globe size={14} strokeWidth={2.2} />}>
          <Field
            label="Timezone"
            hint="IANA timezone (e.g. Asia/Kolkata, America/Los_Angeles)."
          >
            <Input
              required
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Asia/Kolkata"
            />
          </Field>
        </Section>

        <Section
          title="Attendance geofence"
          icon={<MapPin size={14} strokeWidth={2.2} />}
        >
          <Field
            label="Office location"
            hint="Punches only register within the radius of this point. Leave both blank to accept punches from anywhere. Tip: stand at the office entrance and tap the locate button."
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                value={officeLat}
                onChange={(e) => setOfficeLat(e.target.value)}
                placeholder="Latitude (e.g. 19.076090)"
                className="w-56 tabular-nums"
                inputMode="decimal"
              />
              <Input
                value={officeLng}
                onChange={(e) => setOfficeLng(e.target.value)}
                placeholder="Longitude (e.g. 72.877426)"
                className="w-56 tabular-nums"
                inputMode="decimal"
              />
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                title="Use my current location"
                className="inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50"
                style={{
                  borderColor: "var(--color-hairline-strong)",
                  background: "var(--color-surface-card)",
                  color: "var(--color-ink-soft)",
                }}
              >
                <LocateFixed size={14} strokeWidth={2.2} />
                {locating ? "Locating…" : "Use my location"}
              </button>
            </div>
          </Field>
          <Field
            label="Allowed radius (metres)"
            hint="How far from the office point a punch is accepted. 100m recommended — GPS itself wobbles 10–30m."
          >
            <Input
              type="number"
              min={25}
              max={5000}
              step={5}
              value={radiusM}
              onChange={(e) => setRadiusM(Number(e.target.value))}
              className="w-28 tabular-nums"
            />
          </Field>
        </Section>

        <Section title="Access" icon={<Lock size={14} strokeWidth={2.2} />}>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={allowSelfRegister}
              onChange={(e) => setAllowSelfRegister(e.target.checked)}
              className="mt-1 h-4 w-4 accent-altus-red"
            />
            <span>
              <span className="block text-[15px] font-semibold text-ink-strong">
                Allow public sign-up
              </span>
              <span className="block text-[13px] text-ink-subtle mt-0.5" style={{ lineHeight: 1.5 }}>
                When off, only admins can create accounts (invite-only).
                Default and recommended.
              </span>
            </span>
          </label>
        </Section>

        {error && (
          <div
            role="alert"
            className="rounded-md border px-3.5 py-2.5 text-[14px]"
            style={{
              borderColor: "color-mix(in srgb, var(--color-red) 30%, transparent)",
              background: "var(--color-red-bg)",
              color: "var(--color-red-deep)",
            }}
          >
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg py-3 px-6 text-[15px] font-semibold text-white disabled:opacity-50 transition-transform hover:-translate-y-px"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 8px 22px -10px rgba(225, 6, 0, 0.55)",
            }}
          >
            {pending ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>

      {/* RIGHT — info panel (sticky) */}
      <aside className="max-lg:order-first">
        <div className="lg:sticky lg:top-10 flex flex-col gap-4">
          <section
            className="rounded-section border border-hairline bg-surface-card p-5"
            style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
          >
            <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] text-ink-subtle font-bold">
              <Info size={13} strokeWidth={2.4} />
              Why this matters
            </div>
            <h3
              className="mt-2 text-ink-strong"
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: 20,
                letterSpacing: "-0.015em",
              }}
            >
              Org-wide knobs
            </h3>
            <p className="mt-2 text-[14px] text-ink-soft" style={{ lineHeight: 1.6 }}>
              Identity values show up in transactional emails and the
              dashboard header. The digest schedule controls when the daily
              overdue summary lands in everyone's inbox. Access controls
              decide whether new teammates self-register or wait for an
              invite.
            </p>
          </section>

          <section
            className="rounded-section border border-hairline bg-surface-card p-5"
            style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
          >
            <div className="text-[12px] uppercase tracking-[0.12em] text-ink-subtle font-bold">
              Last updated
            </div>
            <div className="mt-1.5 text-[14px] text-ink-strong tabular-nums">
              {updatedAtLabel}
            </div>
            <button
              type="button"
              onClick={resetDefaults}
              className="mt-3 text-[13px] font-semibold text-altus-red hover:underline underline-offset-2"
            >
              Reset to current values
            </button>
          </section>
        </div>
      </aside>
    </form>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <fieldset
      className="rounded-section border border-hairline bg-surface-card p-6 space-y-5"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <legend
        className="inline-flex items-center gap-1.5 px-2 text-[12px] uppercase tracking-[0.12em] text-ink-subtle font-bold"
      >
        {icon}
        {title}
      </legend>
      {children}
    </fieldset>
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
    <div>
      <label className="block text-[14px] font-semibold text-ink-strong mb-1.5">
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1.5 text-[13px] text-ink-subtle" style={{ lineHeight: 1.55 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Input({
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={`w-full rounded-md border px-3.5 py-3 text-[15px] bg-white transition-colors focus:outline-none ${className}`}
      style={{
        borderColor: "var(--color-hairline-strong)",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--color-altus-red)";
        e.currentTarget.style.boxShadow =
          "0 0 0 3px color-mix(in srgb, var(--color-altus-red) 14%, transparent)";
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--color-hairline-strong)";
        e.currentTarget.style.boxShadow = "none";
        rest.onBlur?.(e);
      }}
    />
  );
}

function sameDays(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}
