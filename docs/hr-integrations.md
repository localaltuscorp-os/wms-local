# HR External Integrations — Aadhaar KYC auto-fill & DigiLocker e-sign

Two optional, env-activatable integrations power the HR module. Both are built
so that **the feature switches on the moment its environment variables are set**,
and degrades to a calm manual-entry / "not configured" state when they are unset.
Nothing 500s when the keys are absent, and no secret is ever hard-coded.

> ⚠ **Aadhaar Act compliance.** A full 12-digit Aadhaar number is *never* stored,
> logged, or rendered anywhere. The KYC lookup sends the number *out* to a
> licensed provider only; the DigiLocker flow only ever receives/persists a
> **masked** last-4 value (`XXXXXXXX1234`).

---

## A. Aadhaar KYC auto-fill (Candidate Interview Form)

**What it does.** On the Candidate Interview Form's Personal Details step, the
recruiter can enter the candidate's 12-digit Aadhaar and press **Fetch** to
auto-fill the verified **Name, Date of Birth, Gender, Mobile and Location** from
a licensed KYC/DigiLocker-data provider. Until configured, Fetch shows a friendly
"enter the details manually" message and nothing is fabricated.

**Route:** `app/api/hr/aadhaar-lookup/route.ts` (Node runtime, `requireUser` +
per-user rate limit).
**Mapping layer:** `lib/hr/candidate/aadhaar-kyc.ts` (pure, provider-agnostic).

### Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `AADHAAR_LOOKUP_URL` | ✅ | — | Provider endpoint. Receives `POST` with a JSON body containing the Aadhaar. |
| `AADHAAR_LOOKUP_KEY` | ✅ | — | API credential (sent via the auth header below). |
| `AADHAAR_LOOKUP_HEADER` | — | `authorization` | Auth header **name**. `authorization` → sent as `Bearer <key>`. Any other name (e.g. `x-api-key`, `token`) sends the **raw** key. |
| `AADHAAR_LOOKUP_PROVIDER` | — | `generic` | Response-mapping adapter: `generic` \| `surepass` \| `cashfree` \| `sandbox` \| `signzy` \| `karza` \| `zoop` \| `gridlines`. |
| `AADHAAR_LOOKUP_BODY_KEY` | — | `aadhaar` | JSON key the provider expects the Aadhaar under (e.g. `aadhaar_number`, `id_number`). |

### Provider contract

**Request** the route makes to the provider:

```
POST {AADHAAR_LOOKUP_URL}
Content-Type: application/json
<AADHAAR_LOOKUP_HEADER>: <Bearer key | raw key>

{ "<AADHAAR_LOOKUP_BODY_KEY>": "123412341234" }
```

**Response** (200 JSON). Demographic fields may sit at the top level or under a
common envelope (`data` / `result` / `response` / `kyc`). The mapping layer
tolerates flat *or* nested shapes, flat *or* structured addresses, and a range of
key aliases. Example (Surepass-style):

```jsonc
{
  "data": {
    "full_name": "Asha Rani",
    "dob": "01-01-1990",          // dd-mm-yyyy or yyyy-mm-dd both handled
    "gender": "F",                 // M/F/male/female/other → mapped to form options
    "mobile": "+91 98765 43210",   // normalised to last 10 digits
    "address": {                   // or a flat "address": "..." string
      "house": "12", "street": "MG Road", "loc": "Andheri",
      "dist": "Mumbai", "state": "Maharashtra", "pincode": "400001"
    }
  }
}
```

The route normalizes this to the intake fields
`{ name, dob (yyyy-mm-dd), gender, mobile, location }` and returns:

```jsonc
{ "ok": true, "configured": true, "found": true,
  "fields": { "name": "...", "dob": "1990-01-01", "gender": "Female",
              "mobile": "9876543210", "location": "12, MG Road, Andheri, Mumbai, Maharashtra, 400001" } }
```

### Behaviour & safety

- **Timeout:** 12s (AbortController); a timeout returns a manual-entry message.
- **Errors:** provider 4xx/5xx and malformed JSON return `found: false` with a
  neutral message. Only an HTTP status is logged — never the Aadhaar, the request
  body, or any PII.
- **Not configured:** with `AADHAAR_LOOKUP_URL`/`AADHAAR_LOOKUP_KEY` unset, the
  route returns `{ configured: false }` and the form falls back to manual entry.
- **Adding a provider adapter:** extend `KycProvider` + the envelope map in
  `lib/hr/candidate/aadhaar-kyc.ts`. The generic extractor already covers most
  shapes, so new providers usually need only an envelope hint.

### Go-live checklist (Aadhaar KYC)

1. Sign a contract with a **licensed** KYC/Aadhaar-data provider (e.g. Surepass,
   Cashfree, Signzy, Karza/Perfios, Zoop, Gridlines) — Aadhaar demographic lookup
   requires a licensed aggregator; do not point at an unlicensed endpoint.
2. Set `AADHAAR_LOOKUP_URL`, `AADHAAR_LOOKUP_KEY`, and (if needed)
   `AADHAAR_LOOKUP_HEADER`, `AADHAAR_LOOKUP_PROVIDER`, `AADHAAR_LOOKUP_BODY_KEY`
   in the Vercel project env (Production + Preview as required).
3. Confirm the provider's response shape matches an adapter; if not, pick the
   closest and verify a live Fetch fills the fields, or add an adapter.
4. Confirm the provider requires **candidate consent** for the lookup and that
   your recruiter workflow captures it (contractual/UI, per the provider's KUA
   terms).

---

## B. DigiLocker-verified e-signing (Letters, Agreements, Exit docs, Policies)

**What it does.** The signer proves identity via **DigiLocker OAuth2 + Aadhaar
e-KYC**, then draws/types a signature; the app renders and archives a signed PDF
(with the verified-identity block + **masked** Aadhaar) to the private document
vault. Until configured, the sign page shows a calm "not configured yet" notice
that lists the **exact env var names still missing** (names only, never values).

**Flow:** `authorize → callback → fetch e-KYC → finalize (signed PDF)`.

| Piece | File |
| --- | --- |
| OAuth2 + e-KYC config (env, PKCE, token exchange) | `lib/digilocker/config.ts` |
| PKCE handoff cookie | `lib/digilocker/pkce-cookie.ts` |
| Authorize kickoff (server action) | `app/(app)/documents/sign/actions.ts` → `startSignature` |
| OAuth callback (code → verified identity) | `app/api/digilocker/callback/route.ts` |
| Finalize (render + archive signed PDF) | `app/(app)/documents/sign/actions.ts` → `finalizeSignature` |
| Signing UI | `components/documents/sign/sign-document.tsx` |
| Table | `document_signatures` (migration `0151`, masked-Aadhaar only) |

### Environment variables

**Required** (all four → `isDigiLockerConfigured()` true):

| Variable | Purpose |
| --- | --- |
| `DIGILOCKER_CLIENT_ID` | Partner API client id. |
| `DIGILOCKER_CLIENT_SECRET` | Partner API client secret. |
| `DIGILOCKER_REDIRECT_URI` | Registered callback URL — must be `https://<host>/api/digilocker/callback`. |
| `DIGILOCKER_BASE_URL` | API base, e.g. `https://digilocker.meripehchaan.gov.in`. |

**Optional** (sensible defaults; set only to match an aggregator/KUA variant):

| Variable | Default | Purpose |
| --- | --- | --- |
| `DIGILOCKER_SCOPE` | `avs_parent_files openid` | OAuth scopes requested. |
| `DIGILOCKER_PKCE` | `on` | `off` disables PKCE (S256). Leave on unless the aggregator can't accept a `code_challenge`. |
| `DIGILOCKER_TOKEN_AUTH` | `body` | `basic` sends client creds as HTTP Basic to the token endpoint instead of body params. |
| `DIGILOCKER_AUTHORIZE_PATH` | `/public/oauth2/1/authorize` | Authorize path override. |
| `DIGILOCKER_TOKEN_PATH` | `/public/oauth2/1/token` | Token path override. |
| `DIGILOCKER_USERINFO_PATH` | `/public/oauth2/1/user` | e-KYC / userinfo path override. |

**Reserved** (for a future Aadhaar **e-Sign (ASP/KUA)** leg — read only if
present, not required for the DigiLocker-verified signing shipped today):
`DIGILOCKER_KUA_LICENSE_KEY`, `DIGILOCKER_ASP_ID`, `DIGILOCKER_HMAC_KEY`.

### Security model

- **State:** the `document_signatures` row id (an unguessable UUID) is the OAuth
  `state`. The callback loads the row by state; unknown/expired state fails
  cleanly.
- **PKCE (S256):** `startSignature` generates a verifier, stashes it in a
  short-lived (`10 min`), `HttpOnly`, `SameSite=Lax` cookie (`dl_sign_pkce`) that
  survives the top-level redirect back, and sends only the S256 `code_challenge`
  to `authorize`. The callback re-presents the verifier at token exchange, binds
  the cookie's state to the returned state (CSRF defence-in-depth), and clears
  the cookie on every redirect (one-shot).
- **Masking:** `exchangeCodeForKyc()` masks the Aadhaar to last-4 before it
  returns; the DB column stores only the masked value.
- **Photo:** the DigiLocker photo (if any) is uploaded to the private `documents`
  bucket; only its storage path is persisted — never the raw base64.
- **Auth + rate limit:** every signing write is owner/admin-guarded and
  per-user rate-limited.

### Go-live checklist (DigiLocker)

1. **Register a DigiLocker/Meripehchaan partner app** (or onboard via an
   authorised aggregator/KUA) and obtain the client id + secret.
2. **Register the exact redirect URI** with DigiLocker:
   `https://<production-host>/api/digilocker/callback` — it must match
   `DIGILOCKER_REDIRECT_URI` byte-for-byte (add the Preview URL too if you test
   there). DigiLocker rejects any mismatch.
3. **Confirm scopes** with the provider. Default is `avs_parent_files openid`;
   set `DIGILOCKER_SCOPE` if your integration requires different consent scopes.
4. **Set the env** (`DIGILOCKER_CLIENT_ID`, `DIGILOCKER_CLIENT_SECRET`,
   `DIGILOCKER_REDIRECT_URI`, `DIGILOCKER_BASE_URL`) in Vercel. The sign page's
   "not configured" notice lists any still-missing var by name.
5. **Match the OAuth variant** if the aggregator differs from the defaults:
   set `DIGILOCKER_TOKEN_AUTH=basic`, and/or the `*_PATH` overrides, and/or
   `DIGILOCKER_PKCE=off`. Verify PKCE is accepted (recommended: keep it on).
6. **Verify the `documents` Storage bucket** exists and the service-role key
   (`SUPABASE_SERVICE_ROLE_KEY`) can write to it (signed PDFs + identity photos).
7. **Smoke test** one letter end-to-end: verify → identity display-back → draw a
   signature → confirm → download the archived signed PDF.

### No schema change required

The existing `document_signatures` table (migration `0151`) already carries
every field the hardened flow needs. **No new migration.** PKCE state is held in
the `dl_sign_pkce` cookie, not the DB.
