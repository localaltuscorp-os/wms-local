-- WS-5 · Phase A3 — generic signed single-use approval tokens.
-- Powers one-click approve/reject from email bodies + WhatsApp interactive
-- buttons (salary/incentive/attendance). We store only the SHA-256 hash of the
-- token; the raw token lives only in the outbound link. Additive + idempotent;
-- inert until the /api/approve route ships (behind ONE_CLICK_APPROVAL_OFF).
create table if not exists approval_tokens (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique,          -- sha256(raw token), never the raw token
  kind          text not null,                 -- e.g. 'attendance_confirm', 'incentive_payout'
  target_id     text not null,                 -- the entity the action applies to
  action        text not null,                 -- e.g. 'approve' | 'reject'
  created_by_id uuid references employees(id) on delete set null,
  expires_at    timestamptz not null,
  used_at       timestamptz,                   -- set on first consume; enforces single-use
  created_at    timestamptz not null default now()
);

create index if not exists approval_tokens_kind_target_idx on approval_tokens (kind, target_id);
