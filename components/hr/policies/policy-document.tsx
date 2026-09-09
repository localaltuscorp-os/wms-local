/**
 * <PolicyDocument> — renders a declarative `PolicyDoc` on the Altus letterhead.
 *
 * The policy sibling of the letter renderer. It wraps the whole document in the
 * shared <Letterhead> (so it carries the paying-entity brand, header band and
 * footer) and walks the doc: a title + doc-code KEY:VALUE box, an optional
 * summary, then each numbered section and its body nodes (paragraphs, sub-
 * headings, bullet lists, bordered tables, a committee roster, a numbered
 * workflow with a "case closure" end cap), and finally the shared declaration
 * block (heading + acknowledgement statement — no printed sign-off lines).
 *
 * PURE presentational component — NO hooks, NO "use client", NO framer-motion
 * (CSS only). Safe to render from a server OR client parent, and print/PDF
 * friendly: long policies flow across pages, tables keep their borders in print,
 * and the letterhead header/footer repeat on every printed page.
 *
 * The interactive shell (entity picker, Sign / Acknowledge, Export PDF) lives in
 * the client wrapper (components/hr/policies/policy-view.tsx); this component is
 * deliberately state-free so it renders identically on screen and on paper.
 */

import { Letterhead } from "@/components/hr/letterhead/letterhead";
import type { EntityId, Entity } from "@/lib/hr/entities";
import { applyFirm } from "@/lib/hr/firm";
import type {
  PolicyDoc,
  PolicySection,
  PolicyNode,
  DeclarationBlock,
} from "@/lib/hr/policies/types";

/** Resolve `{firm}` tokens against the issuing entity — a string transformer. */
type Fx = (s: string) => string;

const RED = "#E10600";
const RED_DEEP = "#A80400";

export interface PolicyDocumentProps {
  doc: PolicyDoc;
  /** Which paying entity brands the letterhead (defaults to the doc's entityDefault). */
  entity?: EntityId | Entity | string | null;
}

export function PolicyDocument({ doc, entity }: PolicyDocumentProps) {
  const brand = entity ?? doc.entityDefault ?? "altus-corp";
  // Resolve firm-name tokens against the chosen issuing entity — so the whole
  // policy re-brands live when the reader swaps the entity in the toolbar.
  const fx: Fx = (s) => applyFirm(s, brand);
  const codeRows: Array<[string, string]> = [
    ["Document Code", doc.docCode],
    ["Version", doc.version],
    ["Effective Date", doc.effectiveDate],
    ["Policy Owner", doc.owner],
    ["Registered Office", doc.registeredOffice],
    ["HR Contact", doc.hrEmail],
  ];

  return (
    <div className="apd-wrap">
      <style>{POLICY_CSS}</style>
      <Letterhead entity={brand}>
        {/* ── Title + doc-code box ─────────────────────────────── */}
        <div className="apd-titlewrap">
          <p className="apd-eyebrow">Firm Policy</p>
          <h1 className="apd-title">{fx(doc.title)}</h1>
        </div>

        <table className="apd-codebox">
          <tbody>
            {codeRows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {doc.summary && <p className="apd-summary">{fx(doc.summary)}</p>}

        {/* ── Sections ─────────────────────────────────────────── */}
        {doc.sections.map((section, i) => (
          <SectionView key={i} index={i + 1} section={section} fx={fx} />
        ))}

        {/* ── Declaration / sign-off ───────────────────────────── */}
        {doc.declaration && <DeclarationView block={doc.declaration} fx={fx} />}
      </Letterhead>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section + node rendering                                             */
/* ------------------------------------------------------------------ */

function SectionView({ index, section, fx }: { index: number; section: PolicySection; fx: Fx }) {
  return (
    <section className="apd-section">
      <h2 className="apd-h2">
        <span className="apd-h2-num">{index}.</span>
        {fx(section.heading)}
      </h2>
      {section.nodes.map((node, i) => (
        <NodeView key={i} node={node} fx={fx} />
      ))}
    </section>
  );
}

function NodeView({ node, fx }: { node: PolicyNode; fx: Fx }) {
  switch (node.kind) {
    case "p":
      return (
        <p className="apd-p">
          {node.lead && <strong className="apd-lead">{fx(node.lead)}</strong>}
          {fx(node.text)}
        </p>
      );
    case "sub":
      return <h3 className="apd-h3">{fx(node.text)}</h3>;
    case "ul":
      return (
        <ul className="apd-ul">
          {node.items.map((item, i) => (
            <li key={i}>{fx(item)}</li>
          ))}
        </ul>
      );
    case "table":
      return <TableView node={node} fx={fx} />;
    case "committee":
      return <CommitteeView node={node} fx={fx} />;
    case "workflow":
      return <WorkflowView node={node} fx={fx} />;
    case "legend":
      return <LegendView node={node} fx={fx} />;
  }
}

/**
 * A LEGEND grid — each code rendered as a gradient brand chip beside its meaning.
 * A premium reference key (used for the attendance status codes). Responsive:
 * three columns on a wide page, collapsing gracefully; every chip is fixed-width
 * so the meanings align into clean columns. Print-safe (chips keep their fill).
 */
function LegendView({ node, fx }: { node: Extract<PolicyNode, { kind: "legend" }>; fx: Fx }) {
  return (
    <div className="apd-legend-wrap">
      {node.caption && <p className="apd-caption">{fx(node.caption)}</p>}
      <div className="apd-legend">
        {node.items.map((it, i) => (
          <div key={i} className="apd-legend-item">
            <span className="apd-legend-chip">{it.code}</span>
            <span className="apd-legend-mean">{fx(it.meaning)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableView({ node, fx }: { node: Extract<PolicyNode, { kind: "table" }>; fx: Fx }) {
  const cls =
    node.variant === "keyval"
      ? "apd-table apd-table-keyval"
      : node.variant === "principle"
        ? "apd-table apd-table-principle"
        : "apd-table apd-table-grid";
  return (
    <div className="apd-tablewrap">
      <table className={cls}>
        {node.columns && node.columns.length > 0 && (
          <thead>
            <tr>
              {node.columns.map((c, i) => (
                <th key={i}>{fx(c)}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {node.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) =>
                node.variant === "keyval" && ci === 0 ? (
                  <th key={ci} scope="row">
                    {fx(cell)}
                  </th>
                ) : (
                  <td key={ci}>{fx(cell)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommitteeView({ node, fx }: { node: Extract<PolicyNode, { kind: "committee" }>; fx: Fx }) {
  return (
    <div className="apd-tablewrap">
      {node.caption && <p className="apd-caption">{fx(node.caption)}</p>}
      <table className="apd-table apd-table-committee">
        <thead>
          <tr>
            <th>Position</th>
            <th>Name</th>
            <th>Email</th>
            <th>Contact</th>
          </tr>
        </thead>
        <tbody>
          {node.members.map((m, i) => (
            <tr key={i}>
              <td className="apd-cell-pos">{fx(m.position)}</td>
              <td>{fx(m.name)}</td>
              <td>{m.email ?? "—"}</td>
              <td>{m.contact ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkflowView({ node, fx }: { node: Extract<PolicyNode, { kind: "workflow" }>; fx: Fx }) {
  return (
    <ol className="apd-flow">
      {node.steps.map((step, i) => (
        <li key={i} className="apd-flow-step">
          <span className="apd-flow-num">{i + 1}</span>
          <span className="apd-flow-body">
            <span className="apd-flow-text">{fx(step.text)}</span>
            {step.note && <span className="apd-flow-note">{fx(step.note)}</span>}
          </span>
        </li>
      ))}
      {node.closure && (
        <li className="apd-flow-step apd-flow-closure">
          <span className="apd-flow-num apd-flow-num-end" aria-hidden>
            ✓
          </span>
          <span className="apd-flow-body">
            <span className="apd-flow-text">{fx(node.closure)}</span>
            <span className="apd-flow-note">Case Closure</span>
          </span>
        </li>
      )}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Declaration / sign-off                                               */
/* ------------------------------------------------------------------ */

/**
 * Heading + acknowledgement statement only.
 *
 * The printed sign-off used to follow it — Employee Name / ID / Department /
 * Signature / Date rules plus the "Received By (HR Representative)" and
 * "Enterprise Approval" boxes. Removed: a policy is acknowledged through the
 * in-app Sign flow (document_signatures / DigiLocker), so blank pen-and-paper
 * lines were a second, unsigned record of the same consent.
 */
function DeclarationView({ block, fx }: { block: DeclarationBlock; fx: Fx }) {
  return (
    <section className="apd-section apd-decl">
      <h2 className="apd-h2 apd-h2-decl">{fx(block.heading)}</h2>
      <p className="apd-p apd-decl-statement">{fx(block.statement)}</p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Styles — scoped `apd-*`, brand tokens, print-friendly                */
/* ------------------------------------------------------------------ */

const POLICY_CSS = `
.apd-wrap{width:100%;}
.apd-wrap .alh-body{
  font-family:var(--font-display, Georgia, "Times New Roman", serif);
}

/* Title */
.apd-titlewrap{margin-bottom:18px;}
.apd-eyebrow{
  margin:0 0 6px;font-family:var(--font-display, system-ui, sans-serif);
  font-size:10.5px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;
  color:${RED_DEEP};
}
.apd-title{
  margin:0;font-family:var(--font-display, Georgia, serif);
  font-weight:900;font-size:26px;line-height:1.15;letter-spacing:-.015em;
  color:var(--color-ink-strong, #0f172a);
}

/* Doc-code KEY:VALUE box */
.apd-codebox{
  width:100%;border-collapse:collapse;margin:0 0 20px;
  border:1.5px solid var(--color-hairline-strong, #cbd5e1);
  border-radius:8px;overflow:hidden;
  font-family:var(--font-display, system-ui, sans-serif);
}
.apd-codebox tr{border-bottom:1px solid var(--color-hairline, #e2e8f0);}
.apd-codebox tr:last-child{border-bottom:none;}
.apd-codebox th{
  text-align:left;vertical-align:top;
  width:190px;padding:8px 14px;
  background:var(--color-surface-soft, #f8fafc);
  font-size:11.5px;font-weight:800;letter-spacing:.02em;
  color:var(--color-ink-muted, #64748b);
  border-right:1px solid var(--color-hairline, #e2e8f0);
}
.apd-codebox td{
  padding:8px 14px;font-size:13px;font-weight:700;
  color:var(--color-ink-strong, #0f172a);
}

/* Summary */
.apd-summary{
  margin:0 0 22px;padding:12px 16px;border-left:3px solid ${RED};
  background:color-mix(in srgb, ${RED} 5%, transparent);
  border-radius:0 8px 8px 0;
  font-size:14px;line-height:1.7;font-style:italic;
  color:var(--color-ink-strong, #0f172a);
}

/* Sections */
.apd-section{margin:0 0 22px;break-inside:avoid-page;}
.apd-h2{
  display:flex;gap:8px;align-items:baseline;
  margin:0 0 10px;padding-bottom:6px;
  border-bottom:2px solid color-mix(in srgb, ${RED} 22%, transparent);
  font-family:var(--font-display, Georgia, serif);
  font-weight:800;font-size:17px;letter-spacing:-.01em;
  color:var(--color-ink-strong, #0f172a);
}
.apd-h2-num{color:${RED_DEEP};font-weight:900;}
.apd-h3{
  margin:14px 0 6px;font-family:var(--font-display, system-ui, sans-serif);
  font-weight:800;font-size:13.5px;letter-spacing:.01em;
  color:${RED_DEEP};
}
.apd-p{
  margin:0 0 11px;font-size:14px;line-height:1.75;
  color:var(--color-ink-strong, #0f172a);text-align:justify;
}
.apd-lead{font-weight:800;color:var(--color-ink-strong, #0f172a);}

/* Bullets */
.apd-ul{margin:0 0 12px;padding-left:2px;list-style:none;}
.apd-ul li{
  position:relative;padding-left:20px;margin-bottom:6px;
  font-size:14px;line-height:1.7;color:var(--color-ink-strong, #0f172a);
}
.apd-ul li::before{
  content:"";position:absolute;left:2px;top:.62em;
  width:6px;height:6px;border-radius:9999px;background:${RED};
}

/* Tables */
.apd-tablewrap{margin:6px 0 16px;overflow-x:auto;}
.apd-table{
  width:100%;border-collapse:collapse;
  border:1px solid var(--color-hairline-strong, #cbd5e1);
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:13px;
}
.apd-table th,.apd-table td{
  border:1px solid var(--color-hairline, #e2e8f0);
  padding:8px 12px;text-align:left;vertical-align:top;line-height:1.55;
  color:var(--color-ink-strong, #0f172a);
}
.apd-table thead th{
  background:linear-gradient(135deg, ${RED}, ${RED_DEEP});
  color:#fff;font-weight:800;letter-spacing:.02em;font-size:12px;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.apd-table tbody tr:nth-child(even) td,
.apd-table tbody tr:nth-child(even) th{
  background:var(--color-surface-soft, #f8fafc);
}
.apd-table-keyval th[scope="row"]{
  width:38%;font-weight:800;color:var(--color-ink-muted, #64748b);
  background:var(--color-surface-soft, #f8fafc);
}
.apd-table-principle td:first-child,
.apd-table-committee .apd-cell-pos{font-weight:800;color:${RED_DEEP};}

.apd-caption{
  margin:0 0 6px;font-family:var(--font-display, system-ui, sans-serif);
  font-size:12px;font-weight:600;font-style:italic;
  color:var(--color-ink-muted, #64748b);
}

/* Legend — premium code-chip grid (attendance codes, etc.) */
.apd-legend-wrap{margin:8px 0 18px;}
.apd-legend{
  display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));
  gap:9px 16px;
  padding:16px;border-radius:14px;
  border:1px solid color-mix(in srgb, ${RED} 16%, #e2e8f0);
  background:
    radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, ${RED} 6%, transparent), transparent 60%),
    linear-gradient(180deg, #ffffff, var(--color-surface-soft, #f8fafc));
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.apd-legend-item{
  display:flex;align-items:center;gap:10px;min-width:0;
  padding:5px 4px;
}
.apd-legend-chip{
  flex:0 0 auto;min-width:44px;height:30px;padding:0 10px;
  display:inline-flex;align-items:center;justify-content:center;
  border-radius:9px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:13px;font-weight:900;letter-spacing:.03em;color:#fff;
  background:linear-gradient(135deg, ${RED}, ${RED_DEEP});
  box-shadow:0 6px 14px -8px rgba(168,4,0,.75), inset 0 1px 0 rgba(255,255,255,.22);
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.apd-legend-mean{
  min-width:0;font-size:13px;line-height:1.35;font-weight:600;
  color:var(--color-ink-strong, #0f172a);overflow-wrap:break-word;
}
@media (max-width:720px){ .apd-legend{grid-template-columns:repeat(2, minmax(0,1fr));} }
@media print{ .apd-legend{grid-template-columns:repeat(3, minmax(0,1fr));break-inside:avoid;} }

/* Workflow */
.apd-flow{list-style:none;margin:6px 0 16px;padding:0;counter-reset:none;}
.apd-flow-step{
  display:flex;gap:12px;align-items:flex-start;
  padding:0 0 14px;position:relative;
}
.apd-flow-step::before{
  content:"";position:absolute;left:13px;top:26px;bottom:-2px;
  width:2px;background:color-mix(in srgb, ${RED} 26%, transparent);
}
.apd-flow-step:last-child::before{display:none;}
.apd-flow-num{
  flex:0 0 auto;width:28px;height:28px;border-radius:9999px;
  display:inline-flex;align-items:center;justify-content:center;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:13px;font-weight:900;color:#fff;
  background:linear-gradient(135deg, ${RED}, ${RED_DEEP});
  box-shadow:0 4px 10px -4px rgba(168,4,0,.7);
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
  position:relative;z-index:1;
}
.apd-flow-num-end{background:linear-gradient(135deg,#16a34a,#15803d);box-shadow:0 4px 10px -4px rgba(21,128,61,.7);}
.apd-flow-body{display:flex;flex-direction:column;gap:2px;padding-top:3px;}
.apd-flow-text{font-size:14px;line-height:1.6;color:var(--color-ink-strong, #0f172a);font-weight:600;}
.apd-flow-note{
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:11.5px;font-weight:700;letter-spacing:.02em;
  color:var(--color-ink-muted, #64748b);
}
.apd-flow-closure .apd-flow-text{color:#15803d;}
.apd-flow-closure .apd-flow-note{color:#15803d;}

/* Declaration */
.apd-decl{margin-top:30px;break-inside:avoid-page;}
.apd-h2-decl{border-bottom-color:${RED};}
.apd-decl-statement{font-style:italic;}

/* Print / PDF */
@media print{
  .apd-tablewrap{overflow-x:visible;}
  .apd-section,.apd-decl{break-inside:avoid;}
  .apd-h2,.apd-h3{break-after:avoid;}
}
`;

export default PolicyDocument;
