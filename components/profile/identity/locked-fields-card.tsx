"use client";

import { SectionHeader } from "./avatar-and-name";

interface Props {
  email: string;
  role: string;
  department: string | null;
  isAdmin: boolean;
}

export function LockedFieldsCard({ email, role, department, isAdmin }: Props) {
  const roleLabel =
    role === "both"
      ? "Doer + Initiator"
      : role === "doer"
        ? "Doer"
        : "Initiator";

  const rows: { label: string; value: string }[] = [
    { label: "Work email", value: email },
    { label: "Role", value: roleLabel },
    { label: "Department", value: department ?? "—" },
    { label: "Admin", value: isAdmin ? "Yes" : "No" },
  ];

  return (
    <section
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-hairline)",
        borderRadius: 16,
        padding: 32,
      }}
    >
      <SectionHeader
        title="Account details"
        description="Managed by your admin. Ask if you need any of these changed."
        savedAt={null}
      />

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "16px 32px",
          margin: 0,
          fontSize: 16,
        }}
      >
        {rows.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} />
        ))}
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--color-ink-soft)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          alignSelf: "center",
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          color: "var(--color-ink-strong)",
          fontSize: 16,
          fontWeight: 600,
        }}
      >
        {value}
      </dd>
    </>
  );
}
