# Altus Mega Overhaul — Finish Runbook

Everything Sir specified is **built, integrated, and on prod**. What remains is
activation + inputs only Sir/an operator can provide. This is the exact checklist.

Migrations `0122`/`0123` are **applied**; PMS config + Constitution are **seeded**.
Nothing below changes any live number until you do it.

---

## 1. Feature flags (Vercel → Project → Settings → Environment Variables)

### Already ON (visible now; each is killable by setting it to the OFF value)
| Flag | Off value | What it shows |
|---|---|---|
| `PMS_V3` | `false` | New scoring surface `/pms/v3` (parallel to live v1) |
| `INCENTIVE_STATUS_UI` | `false` | Incentive Status tab (Booked/Accrued/Paid) |
| `SALARY_DOCS_UI` | `false` | Exit-doc + signatory letters |
| `MONDAY_CONFIRM_UI` | `false` | Monday attendance-confirmation queue |
| `SALARY_ANALYTICS` | `false` | Salary attendance analytics + AI pros/cons |
| `SALARY_STATEMENTS` | `false` | Annual statement + combined earnings doc |

### OFF by default — the money / attendance / send switches. Flip ONLY after verifying.
| Flag | Turn ON with | Activates | Verify before flipping |
|---|---|---|---|
| `SALARY_V2` | `=true` | New payroll math: proration v2, CTC form, retention bonus, accountant deduct/ex-gratia, entity totals after PT | Enter a CTC breakup + PT slab first; check one person's computed pay vs the sheet |
| `DCC_ABSENT` | `=true` | Marks a person **absent** for any day their DCC isn't filled | Confirm the DCC-fill expectation is communicated; check a sample day |
| `DISPATCH_V2` | `=on` | Sends the Monday-confirm + quarterly-PMS email/WhatsApp (one-click approve) | Set `DISPATCH_V2_DRY_RUN=on` first to log-without-send; read the logs |
| `INCENTIVE_PAYOUT` | `=true` | "Pay incentives with salary" bookkeeping (records payout, links to salary run) — **not** a bank transfer | Reconcile Accrued vs Paid for one person first |

After setting any env var, Vercel redeploys (~1–3 min). Ping me and I'll browser-verify with you.

---

## 2. Sir's decisions still needed (they plug into config, no rebuild)
- **WS-4 training tuning:** hidden sharing-session pass threshold (default 70%, Sir-only), the ≥4-rater rule, avg-<60%-fail, and the 4-technical/2-non-technical give-hours split. → stored in the PMS score config / training thresholds.
- **"Days started early"** definition — currently inferred as *attended & not late* (no scheduled-start field exists). Give a shift-start rule if you mean something specific.

## 3. Assets to replace / set
- **Signatures:** replace the 3 placeholders in `public/signatures/` — `manan.png`, `cmv.png`, `rutvisha.png` (same filenames) with the real signature images.
- **Professional Tax:** set the PT slab per entity in `salary_config` (the entity-totals + payslip read it; shows ₹0 PT until set).

## 4. Data entry to light up the live numbers
1. **CTC breakups** (Salary → CTC form) — populates PMS incentive grades (paid ÷ CTC) **and** payslip CTC. Until entered, PMS grades show "no CTC".
2. **Incentive Booked/Accrued/Paid** (Incentive → Status tab) — feeds Target-vs-X + PMS (PAID only).
3. **PMS monthly scores** — each person self-scores; managers score juniors; Manan scores everyone (subjective 0–10 + KPI attainment % + Constitution paras + X-Factor).
4. **Constitution weights** — seeded to an even split (100 total); adjust on the Constitution screen if Sir wants specific weights.

## 5. What's live in the code (reference)
- Weights: Manager = Inc 30 · KPI 30 · Constitution 10 · 6×5 subjective. Non-manager (Variant B) = Inc 25 · KPI 25 · Constitution 15 · Attend-Training 5 · Skill 5 · Problem 10 · Growth 10 · Team 5.
- Incentive grade → points: A 100% · B 75% · C 50% · D 25% · Fail 0% of the block.
- KPI = manual monthly attainment % (manager for juniors, Manan for all) × block.
- Blend: non-managers = manager 50% + Manan 50%; managers scored by Manan /100 (copy-manager-score default).
- Migrations applied: `0122` (salary v2 tables), `0123` (PMS v3 tables). Everything else reused already-applied `0105–0121`.
- Migration rule: `scripts/apply-one-migration.ts --apply`, ONE file at a time. NEVER the bulk applier.

_Spec of record: `docs/ALTUS-MEGA-SPEC.md`._
