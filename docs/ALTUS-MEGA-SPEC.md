# Altus Mega Overhaul — Master Spec (Sir's changes, verbatim-sourced)

> Source of truth for the whole program. Captured 2026-07-09 from Sir's brief.
> Every point is a checkbox — nothing ships until its box is honestly ticked +
> browser-verified. Number-changing logic ships DARK behind a kill-switch until
> Sir verifies. Migrations applied ONE file at a time (never bulk).
>
> MANDATORY reference — Altus Corp Constitution (para-by-para scoring source):
> https://docs.google.com/document/d/116crHfTQnAIGn9jQFnYl5Z3hDFmpJefT25Cc5yY4T34/edit?tab=t.0

---

## WS-1 — WMS Kanban: freeze the status header
- [ ] In the WMS Kanban view, the first row of status buckets (DONE, NOT DONE, APPROVED, …) must be **frozen/sticky at all times** so that when you scroll down you can still see the bucket headers and drag cards into them.
- (Transcript: other person shipped this as `6763290`. VERIFY it actually freezes on scroll; redo if not.)

## WS-2 — Performance Intelligence (PMS): full rebuild
### Incentive → grade band (% of Monthly CTC)
- [ ] `0%` = Fail · `0–5%` = D · `5–10%` = C · `10–15%` = B · `15–20%` = A.
- [ ] Incentives counted = **Permanent + Ad-hoc**, and **only PAID** counts toward PMS (not booked/accrued).
- [ ] **Grade → points mapping (RESOLVED 2026-07-09): grade fills the incentive weight block —** A = 100% · B = 75% · C = 50% · D = 25% · Fail = 0% of the block. (Manager 30-pt block at grade B = 22.5 pts; non-manager 25-pt block at grade A = 25 pts.)
### Weightings
- [ ] **Managers (total 100):** Incentives 30 · KPI 30 · Constitution 10 · Skill Upgrade 5 · Knowledge Sharing 5 · Problem Solving 5 · Growth Mindset 5 · Get-Things-Done-from-Others 5 · Take-Care-of-Team 5.
- [ ] **Non-managers (total 100) — RESOLVED 2026-07-09 = Variant B:** Incentives 25 · KPI 25 · Constitution 15 · Attend Training 5 · Skill Upgrade 5 · Problem Solving 10 · Growth Mindset 10 · Team Player 5.
### Subjective scoring model
- [ ] All factors EXCEPT KPI and Incentives are subjective, scored **0–10**.
- [ ] Every subjective factor needs **two justifications**: Q1 justify points GIVEN, Q2 justify points TAKEN. **Visible only to Manan Sir.**
- [ ] **Each person self-scores every month.** Manager scores each junior every month. Manan scores everyone every month → the **perception gap** (self vs manager vs Manan) is shown to the person.
- [ ] **Non-managers:** final = Manager 50% + Manan 50%.
- [ ] **Managers:** Manan scores them out of 100%. **Default option:** Manan can copy the manager's own self/− score to rate a manager he doesn't work with directly.
- [ ] **X-Factor:** Manan can add extra points at will, but must justify with evidence/example — provide **record OR attach + summarise transcript**.
### Constitution scoring
- [ ] Pull the Constitution **para-by-para, exactly** (link above).
- [ ] Admin sets a weight of 100, admin scores AND person self-scores each para → semi-objective.

## WS-3 — DCC ↔ Attendance
- [ ] If a person's **DCC is not filled** for a day → he is **marked ABSENT** for that day.

## WS-4 — Training / Skill Upgrade / Knowledge Sharing
### Managers
- [ ] Must GIVE 6 hrs training/month = 4 hrs technical + 2 hrs non-technical.
- [ ] Must DO 6 hrs self-learning outside office hours (no tech/non-tech split).
### Non-managers
- [ ] Must ATTEND 6 hrs training/month. Evidence required. If not attended live → proof of watching the FULL recording **+ a test at the end** to confirm understanding.
- [ ] Must DO 6 hrs self-learning outside office hours.
### Self-learning (= "Skill Upgrade") scoring
- [ ] Delivered via a **Sharing Session after lunch**; ≥4 people must score it.
- [ ] Pass rule: **avg < 60% = fail.** A per-person **hidden pass threshold** (default example 70%, configurable per person, **never disclosed to anyone but Sir**).
- [ ] Evidence mandatory: a PPT shown OR a recorded video.
- [ ] Mappings: **Self Learning = Skill Upgrade**; **Knowledge Sharing = Take/Give Training**; Skill Upgrade same rule for managers & non-managers; Coursera free courses, TV series, etc. all count.

## WS-5 — Salary: full rebuild
### Proration
- [ ] Salary computed on **actual days in the month** (28/30/31). "Divide by 31 if any doubts."
- [ ] Handle **date of joining** + **free training period (7 or 15 days)**: if 7-day, all days present but salary paid **from the 8th**.
- [ ] **Advance salary** entry supported; next-6-months pattern "3, 4 and repeat".
### CTC + payslip
- [ ] **Entity-wise breakup** with extreme filters.
- [ ] A **CTC breakup form**; CTC **attached to the payslip**.
- [ ] **Retention Bonus**: added BEFORE Salary Payable, shown in CTC breakup **with payable date**; shown in payslip **only if actually paid** (hidden otherwise).
### Signatory blocks (NO rubber stamp)
- [ ] Format: `For <Entity>` + signature image + `Authorised Signatory` + Date + Place.
- [ ] Altus Corp, MJV HUF, JSV HUF → **Manan Vasa** signature. Unleashed → **CMV** signature. Others → **Rutvisha** signature.
### Exit documents (Management → Employee, signed as above)
- [ ] Full & Final Settlement letter.
- [ ] Return of Company Assets letter.
- [ ] Handover Accepted letter.
### Entity totals
- [ ] Entity-wise **total Salary Payable after deducting Professional Tax**.
### Dashboard / approvals
- [ ] **Manager confirms** attendance of outside-office staff **every Monday**.
- [ ] **Accountant confirms** Managers' outside-office attendance **every Monday**.
- [ ] Notify via **WhatsApp + email**, with **approve directly in the email body** (one-click token) to save time.
### Accountant adjustments (before final salary)
- [ ] **Deduct X days** for disciplinary action (reason MANDATORY). E.g. present 30, paid 27.
- [ ] **Add ex-gratia days** (reason MANDATORY). E.g. present 28, paid 30 (Parvez / Moharram example).
- [ ] Show **Amount Payable** AND **Amount Paid** so the person knows the account is nil and the accountant sees the state.
### Statements & analytics
- [ ] **Annual Salary Statement** (1 Apr – 31 Mar).
- [ ] Salary date is **always the 10th** of the month.
- [ ] Attach attendance + analytics to the salary sheet: days late, days waived, days started early, ex-gratia remarks, deduction remarks.
- [ ] Show **this month + last-3-months avg + YTD avg**, always as **X/N with %** (e.g. `3/30 late`, `3/30 waived`, `8/90`, `6/90`) — where discipline matters.
- [ ] **AI analytics** on attendance: pros and cons.

## WS-6 — Incentives
- [ ] Option to **divide an incentive among the team**.
- [ ] Three statuses: **Booked** = client partial payment · **Accrued** = client paid in full · **Paid** = we paid the employee.
- [ ] Show **Target vs Booked**, **Target vs Accrued**, **Target vs Paid**. PMS uses **Paid only**.
- [ ] Incentive **Target vs Paid** breakup shown in the **same document** as salary + attendance (total earnings).
- [ ] Incentive is **paid from the same place** as salary.
- [ ] Incentive analytics: **this month Target vs Paid**, **last 3 months**, **YTD**.

## WS-7 — Dispatch / crons
- [ ] Every quarter, each person's **PMS (performance intelligence) report** goes to them on the **10th** of the month.
- [ ] Email/WhatsApp one-click approval flows (ties into WS-5 Monday confirmations).

---

## ⚠️ CONFLICTS / OPEN QUESTIONS
1. ✅ RESOLVED (2026-07-09) — Non-manager incentive weight = **25** (Variant B governs; the intro's "20%" is superseded).
2. ✅ RESOLVED (2026-07-09) — Non-manager weights = **Variant B**: Inc 25 · KPI 25 · Constitution 15 · Attend Training 5 · Skill Upgrade 5 · Problem Solving 10 · Growth Mindset 10 · Team Player 5.
3. ✅ RESOLVED (2026-07-09) — Incentive grade → points = **grade fills the weight block**: A 100% · B 75% · C 50% · D 25% · Fail 0%.
4. ⏳ STILL OPEN — **Signatures**: need the actual signature image files for Manan Vasa, CMV, Rutvisha (or confirmation to use existing on-file signatures). Salary-docs agent uses labelled placeholders until then.
5. ⏳ STILL OPEN — **Professional Tax**: confirm PT slab/amount per entity/state (needed for "Salary Payable after PT"). Salary agent reads it from salaryConfig; will surface if the key is missing.

---

## Non-negotiable execution rules (see also project memory)
- Migrations: `scripts/apply-one-migration.ts --apply`, ONE file at a time; never the bulk applier. Additive + idempotent. Sir runs the prod apply (permission boundary).
- main auto-deploys to prod → typecheck-clean before every push; WIP never on main.
- Ship DARK behind kill-switches; visible UI is mandatory but money/score math stays flagged until Sir verifies.
- Shared-key contracts: `getIncentivePaidByPerson(month)` (PAID-only) + its salary pair `getMonthlyCtcByPerson(month)` — downstream ALIASES these, never re-implements.
- Verify gates/behaviour in a REAL browser (Playwright), not curl/fetch (in-page redirect() reads as 200).
