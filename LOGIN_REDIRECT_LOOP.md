# WMS — "Login succeeds, then bounces straight back to the login page"

**Status:** diagnosed from source. **Not yet confirmed against production.**
**Audience:** whoever picks this up on the senior dev's desktop (human or Claude session).
**Date:** 2026-09-12

---

## 0. Read this first

Sections 1–4 are **verified from the code in this repo**. Every file/line
reference is exact — open them and check.

Section 5 is a **ranked list of hypotheses**. Nobody has yet inspected the
production environment variables, the production `Set-Cookie` header, or the
production server logs. **Section 6 decides between them in about five minutes.**
Do that before changing anything.

**Do not start by editing `proxy.ts` or the session route.** The redirect logic
is correct and is doing precisely what it was written to do. The fault is almost
certainly environmental — a scheme (http vs https), an env var, or a host
mismatch. A code change here will most likely mask the real cause rather than
fix it.

---

## 1. Symptom

On the production app:

1. User enters email + password on `/login`.
2. Sign-in *appears* to succeed — no error message appears on the card.
3. The browser navigates away…
4. …and lands straight back on the login page.
5. The address bar contains the word **`hub`**.

---

## 2. What that URL proves

The URL is `/login?next=/hub`. This is the single most useful piece of evidence
in the whole report, because **exactly one code path in the entire application
produces it** — `handleInvalidToken` in [proxy.ts:234-239](proxy.ts#L234-L239):

```ts
handleInvalidToken: async () => {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);   // ← becomes "/hub"
  return redirectClearingSession(url);
},
```

Every *other* way of being bounced to the login screen lands on a **bare**
`/login`, with no query string at all:

| Redirect source | Target | Sets `?next=`? |
|---|---|---|
| [proxy.ts:234](proxy.ts#L234) `handleInvalidToken` | `/login` | **YES — `?next=<path>`** |
| [proxy.ts:240](proxy.ts#L240) `handleError` | `/login` | no |
| [proxy.ts:247](proxy.ts#L247) fatal `catch` | `/login` | no |
| [lib/auth/current.ts:157](lib/auth/current.ts#L157) `requireSession()` | `/login` | no |

So `next=/hub` narrows the fault to one specific thing: **the auth middleware ran
on the request for `/hub`, looked for a usable `__session` cookie, and did not
find one.** Not an error — the library distinguishes "threw" (`handleError`) from
"no valid token" (`handleInvalidToken`), and we are in the second branch.

> If the URL turns out to be a bare `/login` with no `?next=`, **this document's
> conclusion changes** — see Section 7, last bullet. Confirm the exact URL first.

---

## 3. The login sequence, as actually implemented

Follow it end to end. The break is between steps 6 and 7.

| # | What happens | Where |
|---|---|---|
| 1 | Form submits; Firebase `signInWithEmailAndPassword` runs **in the browser** | [login-form-canva.tsx:115](components/auth/login-form-canva.tsx#L115) |
| 2 | Browser gets a Firebase ID token and `POST`s it to `/api/auth/session` | [login-form-canva.tsx:47-48](components/auth/login-form-canva.tsx#L47-L48) |
| 3 | Server verifies the ID token with the Admin SDK | [route.ts:46](app/api/auth/session/route.ts#L46) |
| 4 | Server checks the email belongs to a **live** employee; 403 `not-enrolled` if not | [route.ts:64](app/api/auth/session/route.ts#L64) |
| 5 | Server runs the **device check**; 403 `device-not-authorized` if refused (fails *open* on a DB error) | [route.ts:108-111](app/api/auth/session/route.ts#L108-L111) |
| 6 | Server mints the `__session` cookie via `setAuthCookies`, plus the device cookie, returns **200** | [route.ts:125-160](app/api/auth/session/route.ts#L125-L160) |
| 7 | Browser does a **hard** `window.location.replace("/hub")` | [login-form-canva.tsx:121](components/auth/login-form-canva.tsx#L121) |
| 8 | `proxy.ts` intercepts `GET /hub`, reads `__session`, verifies it | [proxy.ts:187-221](proxy.ts#L187-L221) |
| 9 | Valid → set `x-pathname`, continue. Invalid → **bounce to `/login?next=/hub`** | [proxy.ts:222-239](proxy.ts#L222-L239) |

### Two things this sequence gives us for free

**(a) The password was correct and the account is live.** The form only navigates
*after* `exchangeIdTokenForSession` resolves without throwing
([login-form-canva.tsx:117-121](components/auth/login-form-canva.tsx#L117-L121)).
A failed mint — bad credentials, `not-enrolled`, `device-not-authorized`, a 500 —
throws, is caught, and paints an error message on the card. **No navigation
happens at all.** The user navigated, therefore step 6 returned 200.

**(b) The cookie was therefore *sent* by the server.** What we do not yet know is
whether the *browser accepted it*, or whether the *proxy could verify it*.

---

## 4. The established fact

> **Sign-in succeeded and the server issued a session cookie, but on the very next
> request that cookie was either absent from the browser or unverifiable by the
> server.**

Everything in Section 5 is a candidate explanation for that one sentence.

---

## 5. Possible causes, ranked

### C1 — `Secure` cookie served over plain HTTP  ⚠️ MOST LIKELY

Both the mint route and the proxy set the cookie with the identical rule:

```ts
secure: process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIES !== "true",
```

- mint: [app/api/auth/session/route.ts:135](app/api/auth/session/route.ts#L135)
- proxy: [proxy.ts:201](proxy.ts#L201)
- cookie clear: [proxy.ts:68](proxy.ts#L68)
- device cookie: [app/api/auth/session/route.ts:156](app/api/auth/session/route.ts#L156)
- also: [app/api/auth/signout/route.ts:63](app/api/auth/signout/route.ts#L63), [lib/security/device-access.ts:610](lib/security/device-access.ts#L610), [lib/digilocker/pkce-cookie.ts:52](lib/digilocker/pkce-cookie.ts#L52), [lib/hr/candidate/intake-kyc-cookies.ts:79](lib/hr/candidate/intake-kyc-cookies.ts#L79)

**Why it produces exactly this symptom.** In a production build
(`NODE_ENV=production`) with `ALLOW_INSECURE_COOKIES` unset, the cookie is marked
`Secure`. Every browser **silently discards** a `Secure` cookie that arrives over
`http://`. No console error, no network error, no server log — the `POST` still
returns 200, the navigation still happens, and the next request simply carries no
cookie. Endless bounce.

**This applies if "production" means any of:**

- `pnpm start` on a box served over `http://`
- `pnpm start:lan` — i.e. `next start -H 0.0.0.0 -p 3000` → `http://<ip>:3000`
- a LAN / office-server Windows install without TLS
- an internal reverse proxy that terminates on plain HTTP

**It does NOT apply** to a Vercel deployment (always HTTPS).

The code comment at [proxy.ts:199-200](proxy.ts#L199-L200) names this exact
scenario: *"Override with ALLOW_INSECURE_COOKIES=true for HTTP local-server
deploys (LAN-only Windows install on http://&lt;ip&gt;:3000 without TLS)."* The var is
already stubbed in [.env.example:148](.env.example#L148).

**Confirm:** does the production URL start with `http://`? If yes — this is it.
Stop reading.

**Fix:** set on the production host and restart:

```
ALLOW_INSECURE_COOKIES=true
```

**Better fix (do this eventually):** put TLS in front of it. `Secure` +
`httpOnly` is the correct posture for a session cookie; `ALLOW_INSECURE_COOKIES`
is an escape hatch for a LAN box, not a production stance. An unencrypted session
cookie is readable by anyone on that network.

---

### C2 — Cookie signing secrets wrong, missing, or rotated

The cookie is signed with a symmetric key pair read from env, used in **two
separate places that must agree**:

```ts
cookieSignatureKeys: [
  process.env.COOKIE_SECRET_CURRENT!,
  process.env.COOKIE_SECRET_PREVIOUS!,
],
```

- mint: [app/api/auth/session/route.ts:129-132](app/api/auth/session/route.ts#L129-L132)
- proxy: [proxy.ts:192-195](proxy.ts#L192-L195)

**Why it produces this symptom.** Signature verification fails → the library
treats the token as invalid (not as an error) → `handleInvalidToken` → the exact
`?next=/hub` redirect. Crucially, in this case **the cookie IS present in the
browser** — that is what distinguishes C2 from C1 at the DevTools level.

**Failure modes to check:**

- `COOKIE_SECRET_PREVIOUS` unset in the production environment. The array then
  contains `undefined`, which breaks verification. The `!` in the code is a
  TypeScript assertion — it does not create a value at runtime.
- Either secret shorter than 32 characters. `pnpm verify:env` enforces `≥32`
  ([scripts/verify-env.ts:165-169](scripts/verify-env.ts#L165-L169)), but nothing
  enforces it at runtime.
- Secrets recently rotated, or differing between environments — a `.env.local`
  value that never made it into the deployment's env.
- Whitespace or a trailing newline pasted into the dashboard value.
- Multiple production instances behind a load balancer with different secrets:
  mint on instance A, verify on instance B, fail.

**Confirm:** print the *lengths* (never the values) of both vars in the production
environment. On Vercel: `vercel env ls`, or Project → Settings → Environment
Variables — and confirm both exist for the **Production** environment
specifically, not only Preview/Development.

**Fix:** set both to matching ≥32-character values across every instance, then
redeploy. Note that rotating them invalidates every existing session; everyone
signs in again once.

---

### C3 — Cookie exceeds the 4096-byte browser limit

`__session` is a signed JWT carrying the Firebase token payload including custom
claims. Browsers cap a single cookie at ~4096 bytes and **drop it silently** above
that — the same invisible failure mode as C1.

`next-firebase-auth-edge` (v1.12.0 here) has an `enableMultipleCookies` option
that exists specifically to split the payload and dodge this limit. **This repo
passes it at neither call site**, so both use the library default and are
consistent with each other. Consistency is what matters.

**Confirm:** DevTools → Application → Cookies → the `Size` column on `__session`.
Near or over 4096 is the smoking gun. Also check whether the affected users have
unusually large Firebase custom claims.

**Fix:** pass `enableMultipleCookies: true` **in both places** —
[route.ts:125](app/api/auth/session/route.ts#L125) and
[proxy.ts:187](proxy.ts#L187). Never one alone: the mint and the verify would
then disagree about the cookie layout, and *every* login breaks.

---

### C4 — Server clock skew

Token verification checks `iat` / `exp`. A server clock more than a few minutes
off makes a freshly minted token look expired or issued-in-the-future → invalid →
`handleInvalidToken` → this exact redirect.

A real risk on a self-hosted Windows box that has been up a long time or has NTP
disabled. Not a realistic risk on Vercel.

**Confirm** on the Windows host:

```powershell
Get-Date; w32tm /query /status
```

**Fix:** `w32tm /resync`, and set the Windows Time service to automatic.

---

### C5 — Host / origin mismatch between the mint and the navigation

The cookie is set with `path: "/"` and **no explicit `domain`**, so it is scoped
to the exact host that served the `POST`. If the login page is reached on one
host and `/hub` on another, the cookie is not sent.

Watch for:

- `http://192.168.x.x:3000` for login, but a hostname or `localhost` afterwards
- `www.` present on one and absent on the other
- a Vercel preview/deployment URL vs the production domain
- an `http://` → `https://` upgrade happening mid-flow
- `NEXT_PUBLIC_SITE_URL` pointing somewhere other than where users actually browse
  (it is documented as needing to include `https://`)

**Confirm:** watch the address-bar host across the whole flow, and check the
`Domain` column on the cookie in DevTools.

**Fix:** serve the entire flow from one canonical origin and redirect the others
to it.

---

### C6 — Firebase project / API key mismatch

`authMiddleware` receives `apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY`
([proxy.ts:189](proxy.ts#L189)) and uses it to refresh tokens. The service account
(`FIREBASE_PROJECT_ID` / `CLIENT_EMAIL` / `PRIVATE_KEY`,
[proxy.ts:210-212](proxy.ts#L210-L212)) must belong to the **same Firebase
project** as the client config the browser signed in against.

If production points at a different Firebase project than the client bundle was
built with, the ID token verifies against the wrong project and every session is
invalid.

**Confirm:** run `pnpm verify:env` on the production host — it checks all of these
([scripts/verify-env.ts:121-148](scripts/verify-env.ts#L121-L148)). Then eyeball
that `NEXT_PUBLIC_FIREBASE_PROJECT_ID === FIREBASE_PROJECT_ID`.

Also note `FIREBASE_PRIVATE_KEY` goes through `.replace(/\\n/g, "\n")` — a key
pasted with *real* newlines behaves differently from one pasted with escaped
`\n`, and both look plausible at a glance.

**Fix:** align the env vars, then **rebuild**. The `NEXT_PUBLIC_*` values are
baked into the client bundle at build time — changing them requires a rebuild,
not just a restart.

---

### C7 — A CDN, reverse proxy, or WAF in front of the app

Anything between the browser and Next can break this:

- **stripping `Set-Cookie`** from the `/api/auth/session` response
- **caching the `/login` redirect** and serving it to everyone
- **Firebase Hosting** in particular forwards only the cookie literally named
  `__session` to the backend. The session cookie *is* named `__session`
  ([proxy.ts:191](proxy.ts#L191)) so it survives — but the **device cookie would
  be stripped**, which surfaces as a bounce to `/device-blocked`, not `/login`.
  There is a `firebase.json` in this repo, though it only configures emulators
  and functions.

**Confirm:** in the Network tab, inspect the raw response headers of the
`POST /api/auth/session` — is `Set-Cookie` actually present on the wire?

---

### C8 — Browser-side cookie blocking

Least likely, but free to rule out: strict privacy mode, "block all cookies",
Brave shields, an enterprise policy, or an extension. Same-site `lax` cookies on a
top-level navigation are normally fine.

**Confirm:** reproduce in a clean profile / a different browser / incognito. If it
works in one browser and not another, it is this.

---

### C9 — A stale, undecodable legacy cookie (already handled — listed to rule out)

There is already self-healing for this at [proxy.ts:187](proxy.ts#L187): the whole
`authMiddleware` call is wrapped in `try/catch` because a legacy RS256 cookie made
the HS256 verifier throw in a way the library's own `handleError` did not catch,
500ing every request. That catch clears the cookie and bounces to `/login`.

But that path produces a **bare `/login`** with no `?next=`, so if the URL really
carries `next=/hub`, this is not what is happening. Included only so nobody
re-diagnoses it.

---

## 6. Triage — do this first, it takes five minutes

### Step 1 — What is the production URL scheme?

- **`http://`** → it is **C1**. Set `ALLOW_INSECURE_COOKIES=true`, restart, done.
- **`https://`** → continue to Step 2.

### Step 2 — Sign in, then look at the cookie jar

DevTools → **Application** → **Cookies** → the production origin. Look for
`__session`.

| Observation | Conclusion | Go to |
|---|---|---|
| `__session` **absent** | Browser rejected the `Set-Cookie` | Step 3 |
| `__session` **present**, still bounced | Server cannot verify it | **C2**, then C4, C6 |
| `Size` near or over 4096 | Too large, silently dropped | **C3** |
| `Domain` ≠ the host in the address bar | Scope mismatch | **C5** |

### Step 3 — Inspect the mint response on the wire

DevTools → **Network** → the `POST /api/auth/session`:

- **Status** — should be `200`. (If it were 403 the user would have seen an error
  and never navigated, so it should be — confirm anyway.)
- **Response Headers** → is `Set-Cookie` present?
  - **No** → something upstream stripped it → **C7**
  - **Yes** → the browser rejected it. Chrome's **Cookies** sub-tab on that
    request flags blocked cookies with a warning triangle and states the reason
    verbatim. Read it. It will usually say `Secure` over an insecure connection
    (**C1**) or report a size/domain problem (**C3** / **C5**).

### Step 4 — Read the production logs

Grep the server / Vercel function logs for these exact strings, all of which are
already in the code:

```
auth middleware error          → proxy.ts:241   (means handleError — NOT our path)
auth proxy fatal               → proxy.ts:250   (means the fatal catch fired)
setAuthCookies failed          → app/api/auth/session/route.ts:165
verifyIdToken failed           → app/api/auth/session/route.ts:48
device adoption failed         → app/api/auth/session/route.ts:117
```

**Important:** if you see `auth middleware error` or `auth proxy fatal`, the URL
would be a bare `/login`, not `?next=/hub`. Either the URL was reported
imprecisely, or there are two different failures happening. Resolve that before
going further.

### Step 5 — Verify the environment

On the production host:

```bash
pnpm verify:env
```

Confirm specifically: `COOKIE_SECRET_CURRENT` and `COOKIE_SECRET_PREVIOUS` are
both present and both ≥32 chars, and that
`NEXT_PUBLIC_FIREBASE_PROJECT_ID === FIREBASE_PROJECT_ID`.

---

## 7. What this is NOT — already ruled out from the code

Do not spend time on any of these.

- **Not a wrong password / disabled account.** Those throw before navigation and
  render a message on the card
  ([login-form-canva.tsx:123+](components/auth/login-form-canva.tsx#L123)).
- **Not the device lock.** An unregistered device is refused with a 403 *before*
  the session cookie is minted
  ([route.ts:108-114](app/api/auth/session/route.ts#L108-L114)), and a device that
  fails later goes to `/device-blocked`
  ([current.ts:248](lib/auth/current.ts#L248)) — never to `/login`.
- **Not `not-enrolled` / an inactive employee.** Also a pre-mint 403
  ([route.ts:64](app/api/auth/session/route.ts#L64)).
- **Not the daily gate chain.** Those either render a full-screen gate in place
  (URL unchanged) or redirect to `/my-day`
  ([app/(app)/layout.tsx:131](app/(app)/layout.tsx#L131)) — never to `/login`.
- **Not the workspace / permission gate.** That redirects *to* `/hub`
  ([app/(app)/layout.tsx:58](app/(app)/layout.tsx#L58)).
- **Not an open-redirect sanitiser problem.** `?next=` is validated to be a
  same-origin relative path and falls back to `/hub`
  ([login-form-canva.tsx:82-88](components/auth/login-form-canva.tsx#L82-L88));
  `/hub` passes cleanly.
- **Not a `/login` route guard.** `/login` is in `PUBLIC_PATHS`
  ([proxy.ts:6-14](proxy.ts#L6-L14)), so it renders for an unauthenticated request
  without looping.
- **Not `DEV_AUTH_BYPASS` / local-session / dummy mode.** All three would send
  `/login` → `/hub` and let you straight in
  ([proxy.ts:116-143](proxy.ts#L116-L143)) — the opposite symptom.
- **If the URL is a bare `/login`** (no `?next=`), the diagnosis shifts: it is
  then either `handleError`/the fatal catch in the proxy (check the logs in Step
  4), or `requireSession()` at [current.ts:157](lib/auth/current.ts#L157), which
  fires when the session verified fine but the employee row could not be resolved
  or is not login-live.

---

## 8. Environment variables that matter here

| Variable | Where used | Notes |
|---|---|---|
| `ALLOW_INSECURE_COOKIES` | [proxy.ts:201](proxy.ts#L201), [route.ts:135](app/api/auth/session/route.ts#L135) | Set to `true` **only** for an HTTP-served deployment. Prime suspect. |
| `COOKIE_SECRET_CURRENT` | [proxy.ts:193](proxy.ts#L193), [route.ts:130](app/api/auth/session/route.ts#L130) | ≥32 chars. Must be identical across all instances. |
| `COOKIE_SECRET_PREVIOUS` | [proxy.ts:194](proxy.ts#L194), [route.ts:131](app/api/auth/session/route.ts#L131) | ≥32 chars. **Must be set** — `undefined` in the array breaks verification. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | [proxy.ts:189](proxy.ts#L189) | Baked into the client bundle at **build** time. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | client | Must match `FIREBASE_PROJECT_ID`. |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | [proxy.ts:210-212](proxy.ts#L210-L212) | Private key is `\n`-unescaped at read time. |
| `NEXT_PUBLIC_SITE_URL` | link generation | Documented as needing to include `https://`. |
| `NODE_ENV` | everywhere | `production` is what turns `Secure` on. |

**Cookie facts:** name `__session`; `path: "/"`; `httpOnly: true`;
`sameSite: "lax"`; `maxAge` 14 days (`14 * 24 * 60 * 60`); `checkRevoked: false`
([proxy.ts:221](proxy.ts#L221) — revocation propagates within ~1h rather than
instantly, which is deliberate).

---

## 9. Code map

| File | What to look at |
|---|---|
| [proxy.ts](proxy.ts) | The whole auth interception. Lines 187–255 are the relevant block. |
| [app/api/auth/session/route.ts](app/api/auth/session/route.ts) | The only place `__session` and the device cookie are minted. |
| [components/auth/login-form-canva.tsx](components/auth/login-form-canva.tsx) | Client sign-in, the token exchange, and the `location.replace`. |
| [app/(auth)/login/page.tsx](app/(auth)/login/page.tsx) | The login screen; `force-dynamic`. |
| [lib/auth/current.ts](lib/auth/current.ts) | `getCurrentEmployee` / `requireUser` and the other redirect targets. |
| [app/(app)/layout.tsx](app/(app)/layout.tsx) | Post-login gate chain (mostly off by default). |
| [scripts/verify-env.ts](scripts/verify-env.ts) | `pnpm verify:env` — run it on production. |

---

## 10. If none of the above fits

Only then add instrumentation. A temporary log in `handleInvalidToken` that
records whether the cookie was **present but unverifiable** versus **absent
entirely** collapses the remaining search space immediately:

```ts
handleInvalidToken: async () => {
  // TEMPORARY DIAGNOSTIC — remove once the login loop is understood.
  const raw = request.cookies.get("__session")?.value;
  console.error("[auth] invalid token", {
    path: request.nextUrl.pathname,
    cookiePresent: !!raw,
    cookieLength: raw?.length ?? 0,
    proto: request.headers.get("x-forwarded-proto"),
    host: request.headers.get("host"),
  });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  return redirectClearingSession(url);
},
```

Read it as:

- `cookiePresent: false` → the browser never stored it → **C1**, C3, C5, C7, C8
- `cookiePresent: true` → it is there but will not verify → **C2**, C4, C6
- `proto: "http"` → **C1**, confirmed outright

Never log the cookie value itself — it is a live session credential.
**Remove this block once the cause is found.**

---

## 11. Questions to answer before handing this back

1. Is the production URL `http://` or `https://`?
2. Does it affect **everyone**, or only some users / some browsers?
3. Did it start after a specific deploy or env change? What changed?
4. Were `COOKIE_SECRET_CURRENT` / `COOKIE_SECRET_PREVIOUS` ever rotated?
5. Is the exact URL `/login?next=/hub`, or a bare `/login`?

Answers 1 and 5 alone will usually settle it.
