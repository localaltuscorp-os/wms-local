import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireUser } from "@/lib/auth/current";
import { ProfileHero } from "@/components/profile/profile-hero";
import { ProfileShell } from "@/components/profile/profile-shell";
import { AvatarAndName } from "@/components/profile/identity/avatar-and-name";
import { BioAndTags } from "@/components/profile/identity/bio-tags";
import { LockedFieldsCard } from "@/components/profile/identity/locked-fields-card";
import { ChangePasswordCard } from "@/components/profile/identity/change-password-card";
import { SessionsCard } from "@/components/profile/identity/sessions-card";
import { DataExportCard } from "@/components/profile/identity/data-export-card";
import { EnablePushButton } from "@/components/pwa/enable-push-button";
import { ChannelMatrix } from "@/components/profile/notifications/channel-matrix";
import { DigestAndQuiet } from "@/components/profile/notifications/digest-and-quiet";
import { OooControls } from "@/components/profile/workflow/ooo-controls";
import { WorkingHours } from "@/components/profile/workflow/working-hours";
import { PinnedShelf } from "@/components/profile/workflow/pinned-shelf";
import { GoogleCalendarCard } from "@/components/profile/workflow/google-calendar-card";
import { PerfCard } from "@/components/profile/performance/perf-card";
import { CriteriaCard } from "@/components/criteria/criteria-card";
import { CriteriaAchievements } from "@/components/profile/performance/criteria-achievements";
import { AppearanceControls } from "@/components/profile/appearance/appearance-controls";
import { ShortcutsCheatsheet } from "@/components/profile/appearance/shortcuts-cheatsheet";
import { getPerfStats } from "@/lib/profile/performance";
import { getCriteriaMetrics } from "@/lib/profile/criteria-metrics";
import {
  getActiveSessions,
  getQuickStats,
  getRecentDataExports,
} from "@/lib/profile/queries";
import { getNotificationPrefs } from "@/lib/profile/notification-prefs";
import { getPinnedItems } from "@/lib/profile/pinned-items";
import { db } from "@/lib/db";
import { employees, pushSubscriptions } from "@/db/schema";
import { and, asc, eq, ne } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = await requireUser();

  const [
    stats,
    sessions,
    exports,
    prefsMatrix,
    pushCount,
    pins,
    colleagues,
    perf,
    criteriaMetrics,
  ] = await Promise.all([
    getQuickStats(me.id),
    getActiveSessions(me.id),
    getRecentDataExports(me.id),
    getNotificationPrefs(me.id),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, me.id)),
    getPinnedItems(me.id),
    db
      .select({
        id: employees.id,
        name: employees.name,
        role: employees.role,
        department: employees.department,
      })
      .from(employees)
      .where(and(eq(employees.isActive, true), ne(employees.id, me.id)))
      .orderBy(asc(employees.name)),
    getPerfStats(me.id),
    getCriteriaMetrics(me.id),
  ]);
  const hasPushSubscription = (pushCount[0]?.c ?? 0) > 0;

  // Drizzle's typed timestamps come back as `Date` in theory but our
  // slow-query Proxy + the unstable_cache JSON serializer leave them
  // as strings at runtime. Normalise defensively here so client props
  // always get ISO strings, regardless of which path produced the row.
  const toIso = (v: Date | string): string =>
    typeof v === "string" ? new Date(v).toISOString() : v.toISOString();

  const sessionRows = sessions.map((s, idx) => ({
    id: s.id,
    createdAt: toIso(s.createdAt),
    lastSeenAt: toIso(s.lastSeenAt),
    userAgent: s.userAgent,
    country: s.country,
    city: s.city,
    isThisDevice: idx === 0,
  }));

  const exportRows = exports.map((r) => ({
    id: r.id,
    requestedAt: toIso(r.requestedAt),
    completedAt: r.completedAt ? toIso(r.completedAt) : null,
    filePath: r.filePath,
    status: r.status,
    error: r.error,
  }));

  const identityPanel = (
    <div
      className="profile-identity-grid"
      style={{
        display: "grid",
        gap: 24,
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        alignItems: "start",
      }}
    >
      {/* Full-width row: avatar + name spans both columns because the
          gallery wants the breathing room. */}
      <div style={{ gridColumn: "1 / -1" }}>
        <AvatarAndName
          initialName={me.name}
          initialAvatarUrl={me.avatarUrl}
        />
      </div>
      <BioAndTags initialBio={me.bio} initialTags={me.tags ?? []} />
      <LockedFieldsCard
        email={me.email}
        role={me.role}
        department={me.department}
        isAdmin={me.isAdmin}
      />
      <ChangePasswordCard email={me.email} />
      <DataExportCard recent={exportRows} />
      {/* Sessions table reads best at full width. */}
      <div style={{ gridColumn: "1 / -1" }}>
        <SessionsCard sessions={sessionRows} />
      </div>
    </div>
  );

  // Stub panels for tabs 2–5. Filled in subsequent chunks.
  const placeholderPanel = (label: string, description: string) => (
    <div
      style={{
        background: "white",
        border: "1px solid rgba(15, 23, 42, 0.06)",
        borderRadius: 14,
        padding: 36,
        textAlign: "center",
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 700,
          color: "#0F172A",
        }}
      >
        {label}
      </h3>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: 14,
          color: "rgb(100, 116, 139)",
          lineHeight: 1.6,
        }}
      >
        {description}
      </p>
    </div>
  );

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "36px 40px 80px",
        }}
        className="profile-main"
      >
        <ProfileHero
          name={me.name}
          email={me.email}
          role={me.role}
          department={me.department}
          avatarUrl={me.avatarUrl}
          availability={me.availability}
          isAdmin={me.isAdmin}
          stats={stats}
        />

        <div style={{ marginTop: 32 }}>
          <ProfileShell
            tabs={{
              identity: identityPanel,
              notifications: (
                <div style={{ display: "grid", gap: 24 }}>
                  <ChannelMatrix
                    initialMatrix={prefsMatrix}
                    hasWhatsapp={!!me.whatsappPhone && me.whatsappOptedIn}
                    hasPushSubscription={hasPushSubscription}
                  />
                  <DigestAndQuiet
                    initial={{
                      digestFrequency: me.digestFrequency,
                      digestTime: me.digestTime,
                      quietHoursStart: me.quietHoursStart,
                      quietHoursEnd: me.quietHoursEnd,
                      mentionEscalation: me.mentionEscalation,
                    }}
                  />
                  <section
                    style={{
                      background: "white",
                      border: "1px solid rgba(15, 23, 42, 0.06)",
                      borderRadius: 16,
                      padding: 32,
                    }}
                  >
                    <h2
                      style={{
                        margin: "0 0 8px",
                        fontSize: 19,
                        fontWeight: 700,
                        color: "#0F172A",
                        letterSpacing: "-0.015em",
                      }}
                    >
                      Browser push
                    </h2>
                    <p
                      style={{
                        margin: "0 0 18px",
                        fontSize: 14,
                        color: "rgb(100, 116, 139)",
                        lineHeight: 1.55,
                        maxWidth: 560,
                      }}
                    >
                      Real-time notifications on this device, even when the
                      tab isn't open. Per-device — enable on every browser
                      you use.
                    </p>
                    <EnablePushButton />
                  </section>
                </div>
              ),
              workflow: (
                <div style={{ display: "grid", gap: 24 }}>
                  <GoogleCalendarCard
                    connected={Boolean(me.googleConnectedAt)}
                    email={me.googleEmail}
                  />
                  <OooControls
                    initial={{
                      oooStart: me.oooStart,
                      oooEnd: me.oooEnd,
                      oooDelegateId: me.oooDelegateId,
                    }}
                    colleagues={colleagues}
                  />
                  <WorkingHours
                    initial={{
                      timezone: me.timezone,
                      workingHoursStart: me.workingHoursStart,
                      workingHoursEnd: me.workingHoursEnd,
                      workingDays: me.workingDays,
                    }}
                  />
                  <PinnedShelf
                    initial={pins.map((p) => ({
                      id: p.id,
                      kind: p.kind,
                      title: p.title,
                      href: p.href,
                      exists: p.exists,
                    }))}
                  />
                </div>
              ),
              performance: (
                <div style={{ display: "grid", gap: 24 }}>
                  <CriteriaCard
                    employeeId={me.id}
                    criteria={me.performanceCriteria ?? null}
                    kra={me.kra ?? null}
                    isAdmin={me.isAdmin}
                  />
                  <PerfCard stats={perf} />
                  <CriteriaAchievements criteria={me.performanceCriteria ?? null} metrics={criteriaMetrics} />
                </div>
              ),
              appearance: (
                <div style={{ display: "grid", gap: 24 }}>
                  <AppearanceControls
                    initial={{
                      density: me.density,
                      accent: me.accent,
                    }}
                  />
                  <ShortcutsCheatsheet />
                </div>
              ),
            }}
          />
        </div>
      </main>
      <DashboardFooter />
      <style>{`
        @media (max-width: 1024px) {
          .profile-identity-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 768px) {
          .profile-main {
            padding: 24px 18px 56px !important;
          }
        }
      `}</style>
    </>
  );
}
