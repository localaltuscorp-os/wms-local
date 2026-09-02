import { NextResponse } from "next/server";
import {
  peekApprovalToken,
  consumeApprovalToken,
  type ApprovalTokenView,
} from "@/lib/approval/tokens";
import { getApprovalHandler } from "@/lib/approval/handlers";
import { siteUrl } from "@/lib/site-url";

/**
 * WS-7 · public one-click approval route.
 *
 * PUBLIC (no session) — the unguessable single-use token IS the credential.
 * This is what lets a manager/accountant approve straight from an email body
 * link or a WhatsApp button without logging in.
 *
 *   GET  /api/approve/:token  → a branded confirmation page. NEVER mutates.
 *                               (email link-scanners / prefetchers can hit GET,
 *                               so the token is only burned on the explicit
 *                               POST below — prefetch-safe by construction.)
 *   POST /api/approve/:token  → atomically burns the token, runs the domain
 *                               handler for its `kind`, renders a result page.
 *
 * The route is NOT behind the DISPATCH_V2 kill-switch: it only ever acts on a
 * token, and no token exists until a (gated) sender issues one, so it's inert
 * until the slice is armed.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

const BRAND_RED = "#E10600";

function page(title: string, bodyHtml: string, status = 200): NextResponse {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(title)} — Altus Corp</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #FAFBFC; color: #0F172A; padding: 24px;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  .card {
    width: 100%; max-width: 460px; background: #fff; border: 1px solid #E2E8F0;
    border-radius: 14px; overflow: hidden; box-shadow: 0 12px 32px rgba(15,23,42,.06);
  }
  .stripe { display: flex; height: 4px; }
  .stripe > i { flex: 1 1 0; height: 4px; }
  .pad { padding: 32px; }
  .pill {
    display: inline-block; padding: 4px 10px; border-radius: 999px; background: ${BRAND_RED};
    color: #fff; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
  }
  h1 {
    font-family: "Instrument Serif", Georgia, "Times New Roman", serif; font-style: italic;
    font-weight: 400; font-size: 27px; line-height: 1.12; letter-spacing: -.02em; margin: 18px 0 10px;
  }
  p { font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 16px; }
  .meta { font-size: 13px; color: #64748B; background: #F8FAFC; border: 1px solid #EEF2F7; border-radius: 8px; padding: 12px 14px; margin: 0 0 20px; }
  button, a.btn {
    display: inline-block; border: 0; cursor: pointer; text-decoration: none; text-align: center;
    background: ${BRAND_RED}; color: #fff; padding: 13px 26px; border-radius: 9px;
    font-size: 15px; font-weight: 600; font-family: inherit;
  }
  a.ghost { display: inline-block; margin-top: 14px; font-size: 13px; color: #64748B; }
  .ok { color: #047857; } .bad { color: #B91C1C; }
</style>
</head>
<body>
  <div class="card">
    <div class="stripe">
      <i style="background:${BRAND_RED}"></i><i style="background:#F43F5E"></i>
      <i style="background:#A855F7"></i><i style="background:#3B82F6"></i><i style="background:#10B981"></i>
    </div>
    <div class="pad">
      <span class="pill">Altus Corp</span>
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Friendly one-liner describing what a token will do, per kind. */
function describe(t: ApprovalTokenView): string {
  switch (t.kind) {
    case "attendance_confirm":
      return "Confirm your team's outside-office attendance for the week.";
    default:
      return `Approve this ${t.kind.replace(/_/g, " ")} request.`;
  }
}

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const { token } = await ctx.params;
  const row = await peekApprovalToken(token);

  if (!row) {
    return page(
      "Link not found",
      `<h1>This link isn't valid.</h1>
       <p>The approval link may have been mistyped or already actioned. Please open the dashboard to continue.</p>
       <a class="btn" href="${escapeHtml(siteUrl())}">Open dashboard</a>`,
      404,
    );
  }
  if (row.usedAt) {
    return page(
      "Already actioned",
      `<h1 class="ok">Already confirmed.</h1>
       <p>This approval link has already been used — no further action is needed.</p>
       <a class="btn" href="${escapeHtml(siteUrl())}">Open dashboard</a>`,
    );
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return page(
      "Link expired",
      `<h1 class="bad">This link has expired.</h1>
       <p>For security, approval links are time-limited. Please confirm from the dashboard instead.</p>
       <a class="btn" href="${escapeHtml(siteUrl())}">Open dashboard</a>`,
      410,
    );
  }

  // Valid + unused → show the confirm page. The button POSTs back here.
  return page(
    "Confirm",
    `<h1>One quick confirmation.</h1>
     <p>${escapeHtml(describe(row))}</p>
     <div class="meta">Action: <strong>${escapeHtml(row.action)}</strong> · Expires ${escapeHtml(row.expiresAt.toUTCString())}</div>
     <form method="post" action="/api/approve/${encodeURIComponent(token)}">
       <button type="submit">Confirm now</button>
     </form>
     <a class="ghost" href="${escapeHtml(siteUrl())}">Prefer to do it in the dashboard? Open it here.</a>`,
  );
}

export async function POST(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const { token } = await ctx.params;
  const consumed = await consumeApprovalToken(token);

  if (!consumed.ok) {
    const map: Record<
      "not_found" | "used" | "expired",
      { title: string; body: string; status: number }
    > = {
      not_found: {
        title: "Link not found",
        body: `<h1>This link isn't valid.</h1><p>It may have been mistyped. Please use the dashboard.</p>`,
        status: 404,
      },
      used: {
        title: "Already actioned",
        body: `<h1 class="ok">Already confirmed.</h1><p>This link has already been used — nothing more to do.</p>`,
        status: 200,
      },
      expired: {
        title: "Link expired",
        body: `<h1 class="bad">This link has expired.</h1><p>Please confirm from the dashboard instead.</p>`,
        status: 410,
      },
    };
    const m = map[consumed.reason];
    return page(
      m.title,
      `${m.body}<a class="btn" href="${escapeHtml(siteUrl())}">Open dashboard</a>`,
      m.status,
    );
  }

  const handler = getApprovalHandler(consumed.token.kind);
  if (!handler) {
    // Token burned but no handler wired — fail safe with a neutral message.
    return page(
      "Received",
      `<h1 class="ok">Got it.</h1>
       <p>Your confirmation was received. If anything looks off, open the dashboard.</p>
       <a class="btn" href="${escapeHtml(siteUrl())}">Open dashboard</a>`,
    );
  }

  try {
    const result = await handler(consumed.token);
    return page(
      result.title,
      `<h1 class="${result.ok ? "ok" : "bad"}">${escapeHtml(result.title)}.</h1>
       <p>${escapeHtml(result.message)}</p>
       <a class="btn" href="${escapeHtml(siteUrl())}">Open dashboard</a>`,
    );
  } catch (err) {
    console.error("[api/approve] handler threw", err);
    return page(
      "Something went wrong",
      `<h1 class="bad">We hit a snag.</h1>
       <p>Your link was valid but we couldn't finish the action. Please confirm from the dashboard.</p>
       <a class="btn" href="${escapeHtml(siteUrl())}">Open dashboard</a>`,
      500,
    );
  }
}
