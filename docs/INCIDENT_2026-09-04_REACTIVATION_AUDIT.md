# Reactivation audit — handoff item 4

**Source:** offline analysis of `Altus Backup/supabase-full-backup/` —
`public.employees.json` (28 rows) and `public.employee_events.json` (782 rows),
snapshot `2026-09-04T04:27:33Z`. No production credentials were used.

**Latest event in the snapshot is `2026-09-04T04:10:03Z`.** Anything the actor
did after that time is *not* in this data. Re-query `employees` directly before
acting.

> **Do not execute this worksheet until handoff items 1 and 2 are confirmed
> done** (Supabase DB password reset, Firebase service-account key deleted).
> Reactivating accounts while the leaked credentials still work just gives the
> actor their targets back.

## Counts

| | |
|---|---|
| Employees | 28 |
| Active | 10 |
| Inactive | **18** |
| Deactivation events total | 21 — 19 under Manan Vasa's identity, 2 under Om Jadhav's |

The handoff says "17 of 28" but lists 18 names; **18 is correct** per the data.

## A. Reactivate — 13 accounts

All deactivated inside the incident window under Manan Vasa's identity, and
**every one has `note = NULL`** — no reason recorded. Legitimate deactivations
in this system carry a note; these do not. That absence is the strongest
discriminator in the dataset.

| Employee | Role | Deactivated (UTC) |
|---|---|---|
| Rutvisha Mehta | both | 2026-09-03T13:42:38Z |
| Danyal Sayyed | both | 2026-09-03T13:42:59Z |
| Jeevan Bharambe | both | 2026-09-03T13:43:13Z |
| Namrata Nevgi | doer | 2026-09-03T13:43:46Z |
| Mitul Mehta | doer | 2026-09-03T13:43:54Z |
| Om Jadhav | doer | 2026-09-03T13:46:14Z |
| Ruchita Ambre | both | 2026-09-03T15:59:05Z |
| Shreya Randhe | both | 2026-09-03T15:59:16Z |
| Suresh Yadav | both | 2026-09-03T15:59:21Z |
| Dattaram Kap | doer | 2026-09-03T16:00:39Z |
| Krish Maheshwari | both | 2026-09-03T16:00:44Z |
| Parvez Khan | doer | 2026-09-03T16:01:10Z |
| Nandini Maurya | doer | 2026-09-03T06:17:06Z — **see §C, verify with Om first** |

## B. Leave deactivated — 5 accounts

| Employee | Why |
|---|---|
| Hetesh Vichare | 2026-08-22, twelve days pre-incident |
| hetesh vichare | duplicate account, 2026-08-27, pre-incident, no event row |
| Siddhi Lakade | 2026-08-20 by Om Jadhav, pre-incident |
| Pratham Medhekar | no `deactivated_at`, no event — predates event logging |
| **Manan Vasa** | deliberately disabled 2026-09-04T04:10Z as the emergency stop. Its note says do not re-enable until the account holder confirms what happened **and** `DATABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `FIREBASE_PRIVATE_KEY` are rotated. Honour that. |

## C. Om Jadhav — the one ambiguous case

Om was deactivated at `04:06:00Z` by Manan's identity, yet **kept acting for
three more hours**:

```
04:06:00  Om Jadhav DEACTIVATED           by Manan Vasa
06:16:39  Om reactivates Jeevan Bharambe
06:17:06  Om DEACTIVATES Nandini Maurya   <-- the ambiguous one
06:17:38  Om reactivates Rohan Choudhary
07:13:39  Om invites Rutvisha Mehta
13:46:14  Om Jadhav DEACTIVATED again     by Manan Vasa
```

Two readings, and the data does not settle it:

1. **Most likely — Om was doing recovery.** Bracketed by two reactivations of
   people the actor had just disabled, this reads as a super-admin undoing
   damage. Nandini's deactivation would then be unrelated routine admin work.
2. Om's account was also being used by the actor.

Reading 1 is better supported: the actor's pattern is bulk deactivations with
null notes, while Om's block is a mix of reactivations, one deactivation and an
invite — normal admin activity. **Ask Om directly whether he deactivated
Nandini on 3 Sep.** Cheaper and more reliable than inferring it.

Separately: **a deactivated account performed four privileged writes.** Whether
that is direct DB access or a real gap in enforcement, `employees.is_active`
should be verified as actually gating admin actions — deactivation may not be
the containment control it is assumed to be.

## D. Note on attribution

Every unauthorized event resolves to Manan Vasa's `actor_id`, and Manan's
Firebase account was already deleted while rows kept appearing under his
employee ID. `actor_id` is written by whoever holds the credentials — it
identifies a **key in use, not a person at a keyboard**. This audit treats it
as a credential label only.

## How to verify before acting

```sql
-- current truth, not the snapshot
SELECT name, role, is_active, deactivated_at FROM employees ORDER BY deactivated_at NULLS FIRST;

-- anything the actor did after the snapshot's last event
SELECT * FROM employee_events WHERE created_at > '2026-09-04T04:10:03Z' ORDER BY created_at;
```

If the second query returns rows with an unexplained actor **after** the
credential rotation timestamp, the rotation did not work — stop and escalate.
