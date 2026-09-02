import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  mapKycResponse,
  resolveProvider,
  normalizeDob,
  type KycFields,
} from "@/lib/hr/candidate/aadhaar-kyc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/hr/aadhaar-lookup — Aadhaar → candidate demographics auto-fill for
 * the Candidate Interview Form.
 *
 * Provider-agnostic KYC bridge. It POSTs the 12-digit Aadhaar to a LICENSED
 * KYC/DigiLocker-data provider and normalises the response to the intake
 * fields { name, dob, gender, mobile, location }. Until the env below is set it
 * returns `configured: false` and the form falls back to manual entry — nothing
 * is fabricated, nothing 500s.
 *
 * ── Environment ──────────────────────────────────────────────────────────────
 *   AADHAAR_LOOKUP_URL       (required)  Provider endpoint. Receives a JSON body
 *                                        `{ "aadhaar": "############" }` via POST.
 *   AADHAAR_LOOKUP_KEY       (required)  API credential (see auth header below).
 *   AADHAAR_LOOKUP_HEADER    (optional)  Auth header NAME. Default `authorization`
 *                                        (sent as `Bearer <key>`). Any other name
 *                                        (e.g. `x-api-key`, `token`) sends the raw
 *                                        key as the value — no `Bearer` prefix.
 *   AADHAAR_LOOKUP_PROVIDER  (optional)  Response-mapping adapter. One of:
 *                                        generic (default) | surepass | cashfree |
 *                                        sandbox | signzy | karza | zoop | gridlines.
 *   AADHAAR_LOOKUP_BODY_KEY  (optional)  JSON key the provider expects the Aadhaar
 *                                        under. Default `aadhaar` (e.g. some use
 *                                        `aadhaar_number` / `id_number`).
 *
 * ── Provider contract ────────────────────────────────────────────────────────
 * Request:   POST {AADHAAR_LOOKUP_URL}
 *            Headers: content-type: application/json, <auth header>
 *            Body:    { "<AADHAAR_LOOKUP_BODY_KEY>": "123412341234" }
 * Response:  200 JSON with demographic fields anywhere under a common envelope
 *            (`data` / `result` / `response` / `kyc`), e.g.
 *            { "data": { "full_name": "...", "dob": "01-01-1990",
 *                        "gender": "M", "address": { ... }, "mobile": "..." } }
 *            The mapping layer (lib/hr/candidate/aadhaar-kyc.ts) tolerates flat
 *            or nested shapes and flat or structured addresses.
 *
 * ⚠ AADHAAR ACT: the raw 12-digit Aadhaar is only ever sent OUT to the provider.
 * It is NEVER logged, echoed back, or persisted here. Errors are logged without
 * any request body. Auth (requireUser) + per-user rate limiting always apply.
 */

const AUTH_HEADER_DEFAULT = "authorization";
const REQUEST_TIMEOUT_MS = 12_000;

export async function POST(req: Request) {
  let me;
  try {
    me = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitOrError(me.id, "write");
  if (limited) {
    return NextResponse.json({ ok: false, error: limited.error }, { status: 429 });
  }

  // Parse + validate the Aadhaar. Never log the value.
  let aadhaar = "";
  try {
    const body = (await req.json()) as { aadhaar?: unknown };
    aadhaar = String(body.aadhaar ?? "").replace(/\D/g, "");
  } catch {
    // fall through to validation
  }
  if (!/^\d{12}$/.test(aadhaar)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid 12-digit Aadhaar number." },
      { status: 400 },
    );
  }

  const url = process.env.AADHAAR_LOOKUP_URL?.trim();
  const key = process.env.AADHAAR_LOOKUP_KEY?.trim();
  if (!url || !key) {
    return NextResponse.json({
      ok: true,
      configured: false,
      message: "Aadhaar auto-fill isn't connected yet — enter the details manually.",
    });
  }

  const provider = resolveProvider(process.env.AADHAAR_LOOKUP_PROVIDER);
  const headerName = (process.env.AADHAAR_LOOKUP_HEADER?.trim() || AUTH_HEADER_DEFAULT).toLowerCase();
  const bodyKey = process.env.AADHAAR_LOOKUP_BODY_KEY?.trim() || "aadhaar";

  // Build the auth header. Default `authorization` → Bearer scheme; any custom
  // header name carries the raw key (x-api-key / token / etc.).
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  headers[headerName] = headerName === AUTH_HEADER_DEFAULT ? `Bearer ${key}` : key;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ [bodyKey]: aadhaar }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    // Timeout / network error. Log WITHOUT any PII or request body.
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network";
    console.error(`[aadhaar-lookup] provider request failed (${reason})`);
    return NextResponse.json({
      ok: true,
      configured: true,
      found: false,
      message: "Aadhaar lookup timed out — enter the details manually.",
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // 4xx/5xx from the provider — surface a neutral message, never the body.
    console.error(`[aadhaar-lookup] provider returned HTTP ${res.status}`);
    return NextResponse.json({
      ok: true,
      configured: true,
      found: false,
      message:
        res.status === 404
          ? "No details found for this Aadhaar."
          : "Aadhaar lookup failed — enter the details manually.",
    });
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json({
      ok: true,
      configured: true,
      found: false,
      message: "Aadhaar lookup returned an unexpected response — enter the details manually.",
    });
  }

  const mapped: KycFields = mapKycResponse(data, provider);
  const fields = {
    name: mapped.name,
    dob: normalizeDob(mapped.dob),
    gender: mapped.gender,
    mobile: mapped.mobile,
    // The intake form field is called "location" — feed it the assembled address.
    location: mapped.address,
  };
  const found = Boolean(
    fields.name || fields.dob || fields.gender || fields.mobile || fields.location,
  );

  return NextResponse.json({
    ok: true,
    configured: true,
    found,
    fields,
    message: found ? undefined : "No details found for this Aadhaar.",
  });
}
