# AIO Calender MK2 — Master Engineering Handoff & Architecture Guide

> **Document Version**: 3.0.0  
> **Last Updated**: November 24, 2026  
> **Repository Confinement**: `c:\Agy\aio-calender-mk2`  
> **Authorized Developer/Account**: `Deveshchavda207@gmail.com`  
> **Status**: Verified Production Checkpoint 2 (`v3.0.0-stable-milestone`)

---

## 1. Project Invariants & Ironclad Rules

Every developer, engineer, and AI agent operating on this repository **must** strictly adhere to the project invariants defined in `GEMINI.md`:

1. **Workspace Confinement**:
   - Never write, edit, or modify files outside `c:\Agy\aio-calender-mk2`.
   - Never touch or modify the original MK1 app codebase or external repositories.
   - External paths must be inspected in **strictly READ-ONLY mode**.
2. **Windows System & Registry Integrity (Rule 9)**:
   - **Zero Registry Modification**: Never modify, create, or delete Windows registry keys (`HKCU\...\Run`, `HKLM`, etc.), startup entries, or OS system files.
   - **No System File Tampering**: All desktop settings must remain strictly in application-local memory or local app storage (`desktop-config.json`). Background persistence is managed exclusively via the in-memory System Tray lifecycle.
3. **Pre-Commit Verification & Zero Secrets Gate**:
   - Never commit, stage, or push private API keys, Firebase service account keys, `.env*` files, or deployment tokens to GitHub or Vercel. Always run `git diff` before committing.
4. **Permanent Checkpoint Coexistence**:
   - Never delete or overwrite **Checkpoint 1** (`v2.0.0-stable-milestone`). Both Checkpoint 1 and Checkpoint 2 (`v3.0.0-stable-milestone`) must permanently coexist on GitHub and in `checkpoints/`.
5. **Checkpoints Directory Invariant (`checkpoints/`)**:
   - Never edit, modify, replace, or delete files inside `c:\Agy\aio-calender-mk2\checkpoints\` unless explicitly commanded by the user. It is a permanent point of return.
6. **Brand Naming Invariant**:
   - The brand name is strictly **"AIO Calender MK2"** (spelled "Calender" with an E).
   - Primary domain: `aio-calender-mk2.vercel.app`. Secondary domain: `aio-calander-mk2.vercel.app` (301 redirect).

---

## 2. Modular Monorepo Architecture

The codebase is structured as an enterprise-grade modular monorepo:

```text
aio-calender-mk2/
├── web/                                 # 🌐 React 19 + Tailwind CSS + Vite Web Client
│   ├── src/                             # Timetable components, agenda, calendar grid, settings, auth
│   ├── public/                          # Static assets, icons, and desktop-auth.html relay
│   ├── index.html                       # HTML entry point with overscroll/theme locks
│   ├── vite.config.js                   # Vite bundler configuration
│   ├── package.json                     # Web dependencies
│   ├── vercel.json                      # Web-tier routing & redirects
│   └── dist/                            # Production web bundle output
│
├── mobile/                              # 📱 Capacitor 8 + Android Native Java Client
│   ├── android/                         # Android Studio native project
│   │   ├── app/                         # App module, AndroidManifest, AIOAlarmReceiver, MainActivity
│   │   ├── build.gradle                 # Gradle root build configuration
│   │   ├── gradle.properties            # Fixed Java 21 JBR path
│   │   └── variables.gradle             # compileSdk 36, targetSdk 35, minSdk 24
│   ├── capacitor.config.json            # Capacitor bridge config (points to ../web/dist)
│   ├── scripts/generate-icons.ps1       # Automated high-res ROG icon generator for all mipmap densities
│   └── package.json                     # Mobile sync & build orchestration scripts
│
├── desktop/                             # 💻 Native Windows x64 Client (Tauri v2 + Rust)
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── main.rs                  # Process entry: sets WEBVIEW2 arguments & launches lib
│   │   │   └── lib.rs                   # Loopback OAuth server, tray lifecycle, desktop preferences
│   │   ├── capabilities/default.json    # Tauri v2 ACL capabilities (tray, notification, remote Vercel)
│   │   ├── icons/                       # Win32 multi-resolution .ico & .png assets
│   │   ├── tauri.conf.json              # Window settings, NSIS installer config, local frontendDist
│   │   └── Cargo.toml                   # Rust dependencies & build settings
│   └── package.json                     # Desktop build & package scripts
│
├── release-builds/                      # 📦 Production Binaries (Strictly Git-Ignored)
│   ├── AIO-Calender-MK2-Portable.exe    # Standalone portable Windows executable (~12.9 MB)
│   ├── AIO-Calender-MK2-Setup.exe       # NSIS Windows installer (~2.89 MB)
│   └── AIO-Calender-MK2.apk             # Android Release APK (~3.95 MB, signed, v2.0 frozen)
│
├── checkpoints/                         # 🛡️ Permanent Milestone Recovery Directory (Unalterable)
│   ├── aio-calender-mk2-backup-v2.0.bundle  # Checkpoint 1 (v2.0) Git bundle
│   ├── aio-calender-mk2-backup-v2.0.zip     # Checkpoint 1 (v2.0) Source zip
│   ├── aio-calender-mk2-backup-v3.0.bundle  # Checkpoint 2 (v3.0) Git bundle
│   ├── aio-calender-mk2-backup-v3.0.zip     # Checkpoint 2 (v3.0) Source zip
│   └── README.md                        # Checkpoint documentation & restore procedures
│
├── .github/workflows/build-apk.yml      # CI/CD pipeline building Android APK on GitHub Actions
├── firestore.rules                      # Production Cloud Firestore Security Rules
├── GEMINI.md                            # Project invariants, constraints, and guardrails
└── package.json                         # Root orchestration scripts
```

---

## 3. Major Features Added in MK2 (Comparison with MK1)

| Feature | Original MK1 App | AIO Calender MK2 |
|---|---|---|
| **Architecture** | Flat single-folder structure | Modular monorepo (`web/`, `mobile/`, `desktop/`) |
| **Cloud Sync** | Local-only or unreliable sync | Real-time Firebase Firestore cloud sync with multi-tab offline cache |
| **Security Rules** | Permissive / basic rules | Enterprise `firestore.rules` (strict UID isolation, schema validation) |
| **Android Alarms** | Standard AlarmManager (failed in Doze) | `AlarmManager.setAlarmClock()` in Linux kernel RTC hardware |
| **Direct Boot Support** | App crashed on locked reboot | `createDeviceProtectedStorageContext()` Direct Boot safe |
| **OEM Background Delivery**| Killed by Samsung / Xiaomi battery managers | Heads-up `USE_FULL_SCREEN_INTENT`, `turnScreenOn`, `showWhenLocked` |
| **User Alert Controls** | Fixed alert timing | User-selectable lecture lead times (5–60m), task repetition (once, daily, hourly) |
| **Haptic Feedback** | No vibration controls | Dedicated haptic vibration toggle for phone alerts |
| **Desktop Platform** | Web-browser only | Native Windows x64 client (`.exe`) via Tauri v2 (Portable + Installer) |
| **Desktop Auth** | N/A | RFC 8252 System Browser Loopback OAuth (zero password typing, 1-tap Google login) |
| **Desktop Experience**| N/A | Overscroll rubber-banding eliminated, zero white scroll borders, system tray |
| **Platform Segregation**| One-size-fits-all UI | Strict device tiering (Android APK vs Windows EXE vs Vercel Web) |

---

## 4. Firebase Architecture & Key Changes

1. **Firestore Database Configuration**:
   - Database ID: `ai-studio-aiocalender-62e59b5f-324d-498b-8697-7b3619f93095`.
   - Multi-tab offline persistence enabled via `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`.
2. **Cloud Firestore Security Rules (`firestore.rules`)**:
   - User Isolation: All reads and writes enforce `request.auth.uid == userId`.
   - Injection Prevention: Validates required fields (`day`, `startTime`, `endTime`, `courseCode`), string length bounds, and valid day strings.
   - Strict Anti-Tampering: Prevents modifying document IDs or cross-user write spoofing.
3. **Authentication Settings**:
   - Google Sign-In Provider enabled.
   - Authorized Domains:
     - `aio-calender-mk2.vercel.app` (Primary production domain)
     - `aio-calander-mk2.vercel.app` (Secondary domain)
     - `aio-calender-mk2.firebaseapp.com`
     - `localhost`
   - Public Facing Name: Updated to **"AIO Calender MK2"** in Firebase General Settings.
4. **Obfuscated Fallback Configurations**:
   - `web/src/firebase.js` encodes public project identifiers via Base64 to prevent build-time crashes when environment variables are unset, ensuring zero private service keys or credentials are exposed in git.

---

## 5. Vercel Architecture & Deployment Strategy

1. **Routing Descriptor (`vercel.json`)**:
   - Root `vercel.json` configures the monorepo root:
     ```json
     {
       "framework": "vite",
       "buildCommand": "npm --prefix web run build",
       "outputDirectory": "web/dist",
       "redirects": [
         {
           "source": "/(.*)",
           "has": [{ "type": "host", "value": "aio-calander-mk2.vercel.app" }],
           "destination": "https://aio-calender-mk2.vercel.app/$1",
           "permanent": true
         }
       ]
     }
     ```
2. **Deployment Isolation (`.vercelignore`)**:
   - Prevents `mobile/`, `desktop/`, `release-builds/`, `checkpoints/`, and `.tools/` from uploading to Vercel builds, ensuring lightning-fast deployment (<30s).

---

## 6. API, OAuth & SHA Fingerprint Keys

1. **Google OAuth 2.0 Web Client ID**:
   - `20006102155-572mn31v7pjgi64lr17ba6ag7qrhgo0s.apps.googleusercontent.com`
   - Configured in:
     - `web/index.html` (`<meta name="google-signin-client_id" ...>`)
     - `web/src/firebase.js` (`oAuthClientId`)
     - `mobile/capacitor.config.json` (`GoogleAuth` plugin `clientId` and `serverClientId`)
     - `mobile/android/app/src/main/res/values/strings.xml` (`server_client_id`)
2. **Android Keystore & SHA-256 Fingerprint**:
   - Registered in Google Cloud Console / Firebase Console under Android app `com.aiocalendermk2` to enable native Google Sign-In on mobile.

---

## 7. Universal Android Compatibility & Alarm Architecture

1. **Version Span**:
   - `minSdkVersion 24` (Android 7.0 Nougat) up to `compileSdk 36` / `targetSdk 35` (Android 15 / 16 / 17+).
2. **Zero-Battery-Drain Kernel RTC Alarms**:
   - Utilizes `AlarmManager.setAlarmClock(info, pendingIntent)` in `mobile/android/app/src/main/java/com/aiocalendermk2/AIOAlarmReceiver.java`.
   - Rings with sub-second accuracy even when the phone is in deep Doze mode or Extreme Battery Saver.
   - Direct Boot Safe: Saves schedules in `context.createDeviceProtectedStorageContext()` so alarms ring reliably immediately after a device restart before the user unlocks the lock screen (`ACTION_LOCKED_BOOT_COMPLETED`).
3. **Lock-Screen Wakeup & Heads-Up Display**:
   - `MainActivity.java` configures `setShowWhenLocked(true)`, `setTurnScreenOn(true)`, and uses `USE_FULL_SCREEN_INTENT` with high-priority audio channels to bypass aggressive OEM process management (Samsung One UI, Xiaomi HyperOS/MIUI, OnePlus OxygenOS).
4. **Curated User Controls**:
   - Lecture Lead Times: 5m, 10m, 15m, 20m, 30m, 45m, 60m.
   - Task & Assignment Lead Times: 15m, 1h, 1d, 1w.
   - Task Repeat Frequencies: Once, Daily Digest (Morning/Evening), Hourly.
   - Haptic Feedback: Dedicated physical vibration toggle.
   - OEM Battery Tuning: Deep link button opening the system battery optimization whitelist directly.

---

## 8. Windows Desktop Native Client (`desktop/`)

### Why Tauri v2 over Electron?
1. **Binary Size**: Tauri v2 installer is **~2.89 MB** compared to Electron's **150+ MB** (because Tauri utilizes the native OS WebView2 runtime instead of bundling an entire Chromium browser and Node.js runtime).
2. **Memory Footprint**: Tauri v2 consumes **~30–35 MB RAM** at idle versus **250–400 MB+** for Electron.
3. **Security & Rust Core**: Eliminates Node.js runtime vulnerabilities in the desktop binary; native commands run in memory-safe compiled Rust.
4. **Native System Tray**: Provides seamless background persistence via Windows native APIs without modifying registry startup keys.

### Problem 1: Solving WebView2 Overscroll & Rubber-Banding
- **The Issue**: When scrolling past top/bottom/sides, Chromium's WebView2 elastic rubber-banding bounced the viewport, revealing raw white edges from the default unpainted canvas. Additionally, users could pan horizontally.
- **The Solution**:
  1. Injected `--disable-features=ElasticOverscroll` via `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` in Rust at startup before WebView2 engine initialization.
  2. Set native window background color to deep `#0a0a0c` (`[10, 10, 12, 255]`) in Rust and initialized the window with `"visible": false` until ready, eliminating white launch flickers.
  3. Enforced `overscroll-behavior: none !important`, `overflow-x: hidden !important`, `touch-action: pan-y`, and `user-select: none` across `index.html` and `index.css`.
  4. Added a global gesture listener in `App.jsx` canceling unhandled horizontal scroll events outside scrollable tables.

### Problem 2: Solving Desktop Google Login (RFC 8252 Loopback OAuth)
- **The Issue**: In embedded WebView2, Google cookies are isolated from Chrome/Edge (forcing manual password typing). Furthermore, Google security policy rejects embedded webviews (`Domain "tauri.localhost" is not authorized`) or traps users in redirect loops.
- **The Solution (Industry-Standard RFC 8252)**:
  1. Desktop app calls Rust command `start_system_browser_auth`.
  2. Rust binds an ephemeral in-memory TCP listener on `127.0.0.1:0` (dynamic port) and generates a 32-character cryptographic anti-CSRF `state` nonce.
  3. Opens the user's default system browser (Chrome, Edge, Brave, Firefox) where the user is already signed into Google to:
     `https://aio-calender-mk2.vercel.app/desktop-auth.html?port=<PORT>&state=<STATE>`
  4. User signs in with **1 tap** (no password typing!).
  5. Web relay extracts Google IDP credential (`idToken`, `accessToken`) and redirects to `http://127.0.0.1:<PORT>/callback`.
  6. Rust verifies the CSRF state, serves a success page, restores desktop window focus (`window.show()`, `window.set_focus()`), and hands tokens to `App.jsx`.
  7. `App.jsx` calls `signInWithCredential(auth, GoogleAuthProvider.credential(idToken, accessToken))`, logging in seamlessly.

---

## 9. Platform Feature Segregation Matrix

| Feature | Android APK (Mobile) | Windows Native (.exe) | Vercel Web Browser |
|---|:---:|:---:|:---:|
| **Lecture & Task Alerts** | ✅ Yes (Native RTC Alarms) | ✅ Yes (Native Windows Alarms) | ℹ️ Informational (Native Apps Only) |
| **Haptic Feedback (Vibrate)** | ✅ **Exclusive** | ❌ **Hidden** | ❌ **Hidden** |
| **Advanced Battery / OEM Tuning** | ✅ **Exclusive** | ❌ **Hidden** | ❌ **Hidden** |
| **Minimize to System Tray** | ❌ **Hidden** | ✅ **Exclusive** | ❌ **Hidden** |
| **Account & Cloud Sync** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Tab 3 Label** | `⚙️ Settings & Notifs` | `⚙️ Settings & Notifs` | `⚙️ Settings` |

---

## 10. Comprehensive Bug Fix History

1. **Launch White Screen / Missing Applet Config**:
   - Fixed by implementing fallback client-side configuration decoding in `firebase.js`, ensuring the app initializes gracefully even when external json applet configs are missing.
2. **Firestore Security Rules Regex Denial of Service**:
   - Replaced fragile regular expressions with robust structural string length and field presence checks in `firestore.rules`.
3. **Android Gradle Java 21 Home Mismatch**:
   - Fixed by removing hardcoded local Java paths in CI and utilizing Ubuntu runner's native JDK 21.
4. **GitHub Actions Vite Not Found & Exit Code 127**:
   - Fixed `.github/workflows/build-apk.yml` by prefixing npm commands (`npm --prefix web install`, `npm --prefix web run build`, `npm --prefix mobile install`) and targeting `mobile/android`.
5. **App Title Typography Regression**:
   - Restored title from `font-normal` (too thin) and `font-black` (too thick) back to clean `font-semibold`, matching original MK1 branding.
6. **Advanced Settings Dropdown Arrow Wrapping Bug**:
   - Replaced multi-line flex badge with original horizontal badge styling, locking the triangle arrow with non-breaking whitespace (`\u00A0`) and `shrink-0 whitespace-nowrap` so it never wraps to a 3rd line.
7. **Branding Icon Synchronization**:
   - Synchronized high-resolution ROG blue/white branding icon across Windows installer (`installerIcon`, `uninstallerIcon` in `tauri.conf.json`) and Android (`mipmap-*` adaptive icons and legacy squircles via `generate-icons.ps1`).
8. **Tauri Localhost Unauthorized Domain Error**:
   - Replaced embedded webview login with RFC 8252 System Browser loopback authentication.
9. **Loopback Server Socket Race Condition**:
   - Added `stream.set_nonblocking(false)` in Rust so accepted TCP streams wait for incoming HTTP packets and respect read timeouts on Windows Winsock.
10. **WebView2 Elastic Rubber-Banding & White Scroll Lines**:
    - Eliminated by passing `--disable-features=ElasticOverscroll` to WebView2, setting native window background to `#0a0a0c`, and enforcing CSS overscroll suppression.

---

## 11. Checkpoints & Milestone Recovery Guide

Both checkpoints are permanently preserved in Git and in the `checkpoints/` folder:

### Checkpoint 1 (v2.0 Milestone)
- **Tag**: `v2.0.0-stable-milestone`
- **Location**: `checkpoints/aio-calender-mk2-backup-v2.0.bundle` & `.zip`
- **Scope**: Verified Android Native APK and Web client.

### Checkpoint 2 (v3.0 Milestone)
- **Tag**: `v3.0.0-stable-milestone`
- **Location**: `checkpoints/aio-calender-mk2-backup-v3.0.bundle` & `.zip`
- **Scope**: Windows Native Desktop (`.exe`), System Browser OAuth, Overscroll Fixes, and Platform UI Segregation.

### Recovery Commands
```powershell
# Restore to Checkpoint 1 (v2.0)
git checkout v2.0.0-stable-milestone

# Restore to Checkpoint 2 (v3.0)
git checkout v3.0.0-stable-milestone

# Restore from local Git bundle if git remote is unavailable
git clone checkpoints/aio-calender-mk2-backup-v3.0.bundle aio-calender-mk2-restored
```

---

## 12. Developer Cheatsheet & Build Commands

### Web Client
```powershell
# Run ESLint
npm --prefix web run lint

# Build Web Frontend (outputs to web/dist/)
npm --prefix web run build
```

### Android Native Client
```powershell
# Sync web assets to Capacitor
npm --prefix mobile run cap:sync

# Assemble Release APK (outputs to mobile/android/app/build/outputs/apk/release/)
cd mobile/android
.\gradlew.bat clean assembleRelease
cd ../..
```

### Windows Native Client (Tauri v2)
```powershell
# Run Rust unit tests
cmd /c "call .tools\env.cmd cargo test --manifest-path desktop\src-tauri\Cargo.toml"

# Build Release Executables (Setup installer and Portable exe)
npm --prefix desktop run build
```
*(Compiled executables are automatically copied to `release-builds/AIO-Calender-MK2-Portable.exe` and `release-builds/AIO-Calender-MK2-Setup.exe`)*
