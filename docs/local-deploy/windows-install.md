# Altus Corp Dashboard — Windows local-server install

End-to-end install on a Windows machine that lives on the office LAN.
Result: employees open `http://<server-ip>:3000` from any office PC and
land on the dashboard. App data stays on the local Postgres; Firebase
Auth is used over the internet for login.

**Time estimate:** 60–90 minutes if everything goes smoothly.

---

## 0. Prerequisites — install on the server (one-time)

Download and run installers in this order:

1. **Node.js 20 LTS** — https://nodejs.org/en/download (pick the Windows Installer .msi). Verify in PowerShell:
   ```powershell
   node --version    # should print v20.x.x
   ```
2. **pnpm** — install globally:
   ```powershell
   npm install -g pnpm
   pnpm --version
   ```
3. **PostgreSQL 16** — https://www.postgresql.org/download/windows/ (EnterpriseDB installer)
   - During install, **set a strong password** for the built-in `postgres` user. **Write it down.**
   - Keep default port `5432`.
   - You don't need pgAdmin unless you want a GUI.
   - Verify after install:
     ```powershell
     psql -U postgres -c "SELECT version();"
     # enter password when prompted
     ```
4. **Git for Windows** — https://git-scm.com/download/win (default settings are fine).
5. **NSSM** (Non-Sucking Service Manager) — https://nssm.cc/download. Download the zip, extract `nssm.exe` from `win64/` to `C:\Windows\System32\` so it's on PATH.

Verify everything:
```powershell
node --version
pnpm --version
git --version
psql --version
nssm --version
```

---

## 1. Clone the repo

Pick an install location. Avoid paths with spaces. Recommended: `C:\altus-corp`.

```powershell
cd C:\
git clone https://github.com/MananVasa-support/altus-corp.git
cd altus-corp
pnpm install
```

The install pulls ~600MB of node_modules. Takes 2–5 minutes on a typical office connection.

---

## 2. Create `.env.local`

Copy the template and fill it in:

```powershell
Copy-Item docs\local-deploy\env.local.template .env.local
notepad .env.local
```

Edit these placeholders:

| Placeholder | What to put |
|---|---|
| `<PASSWORD>` in `DATABASE_URL` | The password you set for the Postgres `postgres` user during install |
| `FIREBASE_PRIVATE_KEY` value | Paste the entire `private_key` field from your Firebase service account JSON. **Keep the `\n` sequences as literal `\` + `n`** — don't replace them with real newlines |
| `COOKIE_SECRET_CURRENT`, `COOKIE_SECRET_PREVIOUS` | Generate two different 48-char random strings (PowerShell snippet at the top of the template) |
| `CRON_SECRET` | Generate a 32-char random string |
| `<LAN-IP>` in `NEXT_PUBLIC_SITE_URL` | The server's static LAN IP. Find it with `ipconfig` and use the IPv4 address of the LAN adapter, e.g. `http://192.168.1.100:3000` |

**Important:** make sure the server's LAN IP is **static** (DHCP reservation in the router OR set manually in Windows network settings). If the IP changes, every employee's bookmark breaks and Firebase Auth redirects fail.

---

## 3. Set up the local database

```powershell
pnpm setup:local-postgres
```

Expected output:
```
▸ Connecting to localhost:5432 as postgres (admin)…
▸ Creating database "altus_corp"…
  ✓ Database created
▸ Preparing Supabase-compat shim inside "altus_corp"…
  ✓ role "authenticated"
  ✓ role "anon"
  ✓ schema "app"
  ✓ function app.is_admin()

✓ Local Postgres ready.
```

Then apply migrations:

```powershell
pnpm db:migrate
```

If you see `ALTER TYPE ... cannot run inside transaction block` on a fresh install, that's the same gotcha we hit on Supabase. Re-run the manual statement-by-statement applier (a copy of `scripts/_apply-0019.ts` from the Supabase install) — open an issue or message the dev team.

---

## 4. Bootstrap the first admin

```powershell
Copy-Item .env.local .env.bootstrap
pnpm bootstrap-admin --email heteshvichare927@gmail.com --name "Hetesh Vichare"
```

The script will:
1. Create the Firebase user (if it doesn't already exist on the cloud Firebase project)
2. Insert the employee row in local Postgres
3. Generate a password-reset link and **print it to the terminal** (Resend isn't configured)

Copy the printed link, open it in a browser, set your password.

**Then delete `.env.bootstrap`** (it has service-role credentials):
```powershell
Remove-Item .env.bootstrap
```

---

## 5. Build + run

```powershell
pnpm build
pnpm start:lan
```

The `start:lan` script runs `next start -H 0.0.0.0 -p 3000` — binding to `0.0.0.0` is what allows other PCs on the LAN to reach it (instead of only `localhost`).

**Test from another office PC**: open `http://<server-LAN-IP>:3000`. You should see the login page.

If it works, kill the dev process (`Ctrl+C`) and move to step 6 to run it as a Windows service.

### If it doesn't load from another PC

- **Firewall:** open Windows Defender Firewall → Advanced Settings → Inbound Rules → New Rule → Port → TCP → 3000 → Allow → Domain + Private (not Public).
- **Wrong IP:** double-check `ipconfig`; you want the IPv4 of the *LAN* adapter (not VirtualBox/WSL adapters).
- **Server isn't bound to 0.0.0.0:** test from the server itself first — `curl http://localhost:3000`. If that works but LAN doesn't, it's a firewall issue.

---

## 6. Run as a Windows service (auto-restart on reboot)

Stop the manual `pnpm start:lan` first, then:

```powershell
# Install service. The path to node.exe is usually:
#   C:\Program Files\nodejs\node.exe
nssm install AltusCorp "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" "start" "-H" "0.0.0.0" "-p" "3000"

# Set working directory
nssm set AltusCorp AppDirectory "C:\altus-corp"

# Capture stdout/stderr to log files
nssm set AltusCorp AppStdout "C:\altus-corp\logs\stdout.log"
nssm set AltusCorp AppStderr "C:\altus-corp\logs\stderr.log"
New-Item -ItemType Directory -Force -Path "C:\altus-corp\logs" | Out-Null

# Start it
nssm start AltusCorp

# Verify
nssm status AltusCorp
# Should print: SERVICE_RUNNING
```

Now the dashboard auto-starts on every server boot. To stop / restart / remove later:
```powershell
nssm stop AltusCorp
nssm restart AltusCorp
nssm remove AltusCorp confirm
```

---

## 7. One-time Firebase Auth config

Add the LAN-served URL to Firebase Auth's authorized domains so password reset + signup flows accept the redirect:

1. Firebase Console → Authentication → Settings → Authorized domains
2. Click **Add domain**
3. Enter the LAN IP exactly as it appears in `NEXT_PUBLIC_SITE_URL`, e.g., `192.168.1.100`
4. Save

If Firebase rejects raw IPs, use a hostname instead. On the LAN you can either:
- Add `192.168.1.100  altus.local` to `C:\Windows\System32\drivers\etc\hosts` on every employee PC (annoying)
- Or set up an internal DNS record on the router for `altus.local` → `192.168.1.100`
- Or install mDNS (Bonjour) — Apple devices auto-resolve `.local` hostnames

For now, the simplest is to accept that password resets land on Firebase's own `firebaseapp.com` confirmation page and require the user to manually re-navigate to the LAN URL.

---

## 8. Distribute to employees

Send each employee:
- The URL: `http://192.168.1.100:3000` (or whatever)
- "Bookmark this on your office PC. Only works when you're connected to office Wi-Fi."

For their first login, they'll need a password-reset link from you (since Resend isn't set up). Invite them via `/admin/employees`, copy the link the server logs print, paste into chat.

---

## Operational reminders

- **Backups:** schedule `pg_dump -U postgres altus_corp > C:\backups\altus_corp_YYYYMMDD.sql` daily via Task Scheduler. Store dumps on a separate drive or network share.
- **Updates:** pull from GitHub, run `pnpm install && pnpm build && nssm restart AltusCorp`. Test in off-hours first.
- **Logs:** tail `C:\altus-corp\logs\stderr.log` when troubleshooting.
- **Restart:** `nssm restart AltusCorp` after every code change or env var change.
- **If the server reboots:** the service auto-starts, but verify by hitting the URL from another PC after every reboot.
