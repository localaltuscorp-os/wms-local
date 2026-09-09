import type { Metadata } from "next";
import Image from "next/image";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Get the Altus app",
  robots: { index: false, follow: false },
};

// The public Drive folder holding the Android APK. NOTE: use the account-neutral
// /drive/folders/<id> form (NOT /drive/u/3/... which is tied to one signed-in
// Google account) and make sure the folder is shared "Anyone with the link".
const APK_LINK =
  "https://drive.google.com/drive/folders/165wRhjtsU69A54OyRCGO2HbvS9VFUw87";

/**
 * Android interstitial (rewritten here by middleware.ts for Android mobile
 * browsers). We've moved the Android mobile experience into a dedicated native
 * app, so instead of the responsive web UI these users get a clean "install the
 * app" screen with the APK link. iOS + desktop are unaffected.
 */
export default function GetAppPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background:
          "radial-gradient(120% 80% at 50% -10%, #FCE4E2 0%, #F7F7F6 55%, #F7F7F6 100%)",
        fontFamily:
          "var(--font-display), system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#ffffff",
          borderRadius: 24,
          border: "1px solid #E7E5E2",
          boxShadow: "0 20px 60px -24px rgba(58,21,18,0.28)",
          padding: "36px 28px 32px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 84,
            height: 84,
            margin: "0 auto 20px",
            borderRadius: 22,
            background:
              "linear-gradient(135deg, #E10600, #A80400)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 12px 28px -10px rgba(225,6,0,0.55)",
          }}
        >
          <Image
            src="/logo-mark.png"
            alt="Altus"
            width={44}
            height={44}
            style={{ filter: "brightness(0) invert(1)" }}
            priority
          />
        </div>

        <span
          style={{
            display: "inline-block",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#B00400",
            background: "#FCE4E2",
            borderRadius: 999,
            padding: "5px 12px",
            marginBottom: 16,
          }}
        >
          New · Android app
        </span>

        <h1
          style={{
            fontSize: 26,
            lineHeight: 1.15,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            color: "#1A1614",
            margin: "0 0 10px",
          }}
        >
          The Altus app has launched
        </h1>

        <p
          style={{
            fontSize: 15.5,
            lineHeight: 1.5,
            color: "#57514E",
            margin: "0 0 24px",
          }}
        >
          We&apos;ve moved the mobile experience into a fast, native Android app.
          Please install it and sign in there — the mobile website is no longer
          used on Android.
        </p>

        <a
          href={APK_LINK}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            padding: "16px 20px",
            borderRadius: 14,
            background: "linear-gradient(135deg, #E10600, #A80400)",
            color: "#ffffff",
            fontSize: 16,
            fontWeight: 800,
            textDecoration: "none",
            boxShadow: "0 14px 30px -12px rgba(225,6,0,0.6)",
          }}
        >
          Download the app →
        </a>

        <p
          style={{
            fontSize: 12.5,
            lineHeight: 1.5,
            color: "#857E7A",
            margin: "18px 0 0",
          }}
        >
          Opens a Google Drive folder with the latest APK. After downloading,
          tap it to install (you may need to allow installs from your browser).
        </p>
      </section>
    </main>
  );
}
