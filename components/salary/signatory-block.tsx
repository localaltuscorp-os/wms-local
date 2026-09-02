"use client";

import { useState } from "react";
import type { Signatory } from "@/lib/salary/signatories";

/**
 * WS-5 — Reusable Signatory Block.
 *
 * Renders EXACTLY, top to bottom:
 *   For <Entity>
 *   [signature image]
 *   Authorised Signatory
 *   Date:  <date>
 *   Place: <place>
 *
 * NO rubber-stamp text anywhere (by design). Signature images are PENDING from
 * Sir — if the asset 404s at runtime, we degrade to a ruled line with the
 * signatory's typed name + a small "signature pending" caption rather than
 * showing a broken image.
 *
 * On-brand: Altus display/serif tokens, hairline rules, red baseline accent.
 */
export function SignatoryBlock({
  entity,
  signatory,
  date,
  place,
  className,
}: {
  entity: string;
  signatory: Signatory;
  /** Formatted date string (already localised) or blank. */
  date?: string;
  place?: string;
  className?: string;
}) {
  const [imgOk, setImgOk] = useState(true);

  return (
    <div
      className={className}
      style={{
        display: "inline-block",
        minWidth: 260,
        maxWidth: 340,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 800,
          fontSize: 15,
          letterSpacing: "-0.01em",
          color: "var(--color-ink-strong)",
        }}
      >
        For {entity}
      </div>

      {/* Signature image (or graceful placeholder) */}
      <div
        style={{
          height: 84,
          marginTop: 8,
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        {imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={signatory.assetSrc}
            alt={`${signatory.name} signature`}
            onError={() => setImgOk(false)}
            style={{ maxHeight: 84, maxWidth: "100%", objectFit: "contain" }}
          />
        ) : (
          <div style={{ width: "100%" }}>
            <div
              style={{
                fontFamily: "var(--font-serif), Georgia, serif",
                fontStyle: "italic",
                fontSize: 22,
                color: "var(--color-ink-muted)",
                paddingBottom: 4,
              }}
            >
              {signatory.name}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--color-ink-subtle)",
              }}
            >
              signature image pending
            </div>
          </div>
        )}
      </div>

      {/* Red baseline */}
      <div
        style={{
          height: 2,
          background: "var(--color-altus-red)",
          opacity: 0.85,
          borderRadius: 1,
        }}
      />

      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--color-ink-soft)",
        }}
      >
        Authorised Signatory
      </div>

      <div style={{ marginTop: 10, fontSize: 13, color: "var(--color-ink-muted)" }}>
        <div>
          <span style={{ fontWeight: 700, color: "var(--color-ink-soft)" }}>Date:</span>{" "}
          {date || "____________"}
        </div>
        <div style={{ marginTop: 3 }}>
          <span style={{ fontWeight: 700, color: "var(--color-ink-soft)" }}>Place:</span>{" "}
          {place || "____________"}
        </div>
      </div>
    </div>
  );
}
