# PMS — Full Spec (from Hetesh/Manan handwritten notes, 2026-06-30)

This is the **source-of-truth** policy for the Performance Management System (Layer 2,
Employee Intelligence). It supersedes the generic "PMS v1" configurable scorer that
shipped in `a81f697` — v1 had the architecture but not the real model. Everything below
is the real model. Promotion/recognition/incentive payout stay **human-released** (never
auto) per the architecture constitution.

---

## 1. PMS Rating model — score out of 100, 5 pillars

| Pillar | Weight | Source signals |
|---|---|---|
| **KPI** | **50** | Weekly Goals (target vs actual %) **+** Incentive (target vs actual) |
| **Skill Upgrade** | **20** | Training **given** + Training **attended** + **Self-Learning** |
| **Compliance** | **10** | DCC **+** Daily Checklist |
| **Attitude & Mindset** | **10** | Monthly manager rating (see §4) |
| **Team Work** | **10** | Rated by **juniors** + **colleagues** (peer/360) |

Total = 100. Weights configurable in `/pms/config` but **default to this model** (50/20/10/10/10),
not blank. The score is advisory; managers review before any consequence.

`Rating` is the headline output (the notes literally say "PMS → Rating").

---

## 2. Training engine (the big build — extends the Training Centre module)

### Obligations (per person, per month)
- **All Managers must GIVE 4 hrs/month** of training (they are trainers).
- **All people must ATTEND 8 hrs/month** of training.
- **Everyone must self-learn ~1–2 hrs/month** (books / videos / YouTube) **with evidence**.
- **Weekly Share**: 10 mins **compulsory once/week**, captured with **feedback 1–5** + a **video**.

Track each as target-vs-actual; surface shortfalls. These feed the **Skill Upgrade** pillar.

### Training Calendar (schedule a session)
Fields: **Subject · Topic · LOS** (learning-outcome statements) · **Criticality 1–5 ★** ·
**Who** (trainer) · **Schedule** (date/time) · **Attendees** (select employees) ·
**Video upload** (photo / PPT) · **Duration** · then **Attendance · Feedback · Score**.
- **★ = add to the training manual** (a curated library of high-criticality sessions).
- On schedule → **auto email** + **auto WhatsApp** to attendees.
- **Alert if no training scheduled for > 6 days.**
- **No session over 1.5 hrs.** Prefer **Fridays / Saturdays**.
- **Request-for-recording** action.

### Trainer feedback (attendee → trainer, after a session)
Rate **Content · Depth · Understanding · Applicability** each **1–5 ★**, plus free text:
**"What did you learn"** and **"What can be improved"**.

### Trainer controls
Trainer can **change attendance & duration** if someone **left halfway**.

### Assessment ("Manan's Assessment")
Post-training **score**; **< 80% = fail → must redo**; **option to waive off**. Target vs Actual.

### Link to attendance / DCC
- **DCC prompt**: if a person has **attended no training in > 7 days**, prompt them (in the
  DCC / daily flow) to **select which training to attend**.
- Training attendance ties into the Attendance module.

---

## 3. Self-Learning (part of Skill Upgrade)
- Everyone logs **~1–2 hrs/month** self-learning: **Books / Videos / YT**, with **evidence** (link/file).
- **Share**: once/week, **10 min compulsory**, with a **video** + peer **feedback 1–5 ★**.

---

## 4. Attitude, Behaviour & Skill development (monthly 360)
- **Attitude → what needs change**: a **dropdown** of behaviours (or **add your own**) + **explanation**.
- **Monthly review cycle**:
  - **Manager review** — manager rates the employee.
  - **Subordinate review** — subordinate rates upward (the manager).
  - Covers **internal & external**.
- Rated dimensions, each **min 3 → max 5**:
  - **Attitude** 3–5
  - **Behaviour** 3–5
  - **Skill** 3–5
- **3 Personal (non-work) goals** captured per person.

The Attitude/Mindset pillar (§1) is fed by these monthly ratings.

---

## 5. Incentives (Target vs Actual)
- **Target vs Actual** view; **Plan vs Actual**.
- **4 managers @ ₹15K monthly** incentive structure (managers: Mishtic, Hetesh, Danyal, + 1).
- Feeds the **KPI** pillar alongside Weekly Goals.

---

## 6. Misc note
- **"Passwords Master = Siddhesh"** — separate note (credential-vault ownership / CA-handover master). Not part of the score; track only if relevant to the Accounts/CA-handover module.

---

## Build principles
- Build **on** the existing Phase-B event spine + Training Centre + Employees modules (extend, don't duplicate).
- All scoring inputs are **events → projections (employee_twin) → pure score engine**. Replaying the log rebuilds Layer 2 and fires **zero** external actions.
- Money / promotion / recognition / incentive payout = **human-released**.
- Default the config to the **50/20/10/10/10** model (not blank — "never go with defaults" means don't ship a hollow shell; ship the real policy as the editable default).
- Green module identity (Employees). Keyboard-first, readable type, mobile parity.
