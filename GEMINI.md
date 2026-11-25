# Project Invariants & Guardrails — AIO Calender MK2

## 1. Filesystem & Repository Isolation
- **Workspace Confinement**: Never make edits, write files, or modify directories outside `c:\Agy\aio-calender-mk2`.
- **Hands-off Original Project**: Never touch or modify the original MK1 app code or original GitHub repository.
- **Strict Read-Only for External Paths**: If inspecting external files or directories is required, it must be performed strictly in READ-ONLY mode.
- **Zero Secrets to Git**: Never commit, stage, or push private API keys, Firebase service account keys, `.env*` files, or deployment tokens to GitHub.
- **Zero Secrets to Vercel**: Never push or expose private secrets to Vercel builds or platform settings.

## 2. Dedicated User Account
- **Authorized Account**: When choosing an account for login, testing, or user data sync in this app, use `Deveshchavda207@gmail.com` exclusively. Do not use or configure any other accounts.

## 3. Strict Scope & Feature Discipline
- **No Unrequested Features**: Never invent, generate, or add unrequested UI controls, "clear all" buttons, extra menus, or speculative capabilities.
- **Maintain Original UX**: Preserve original deletion and editing mechanisms exactly as authored in the source codebase.
- **Strict Adherence**: Execute only what is explicitly specified in the user prompt (e.g., notifications, app launch speed, bug fixes).

## 4. Brand Naming & Domain Invariant
- **Naming Convention**: The project branding is strictly "AIO Calender MK2" (spelled "Calender" with an E).
- **Domains**: Primary domain is `aio-calender-mk2.vercel.app` (with an E). Secondary domain is `aio-calander-mk2.vercel.app` (with an A) redirecting to the primary.

## 5. Universal Android Compatibility & Alarm Architecture
- **Version Span**: Maintain support from Android 7.0 (API 24, `minSdkVersion 24`) up through Android 16/17+ (API 36+).
- **Zero-Battery-Drain Alarms**: Always use `AlarmManager.setAlarmClock()` registered in Linux kernel RTC hardware for notifications. Never introduce heavy background polling daemons or persistent background services.
- **Direct-Boot Safe**: Always store alarm schedules in `createDeviceProtectedStorageContext()` to prevent credential encrypted storage crashes on locked boot (`ACTION_LOCKED_BOOT_COMPLETED`).
- **Lock-Screen Visibility**: Preserve `showWhenLocked`, `turnScreenOn`, and `USE_FULL_SCREEN_INTENT` so alarms can wake the display and show heads-up notifications across all OEM brands (Samsung One UI, Xiaomi, Pixel, etc.).

## 6. Milestone Backup & Point of Return
- **Tagged Releases**: Create annotated Git tags (`git tag -a`) for verified milestones.
- **Local Recovery**: Maintain git-ignored backup bundles/archives as reliable points of return before major codebase refactors.

## 7. Milestone Checkpoints & Points of Return
- **Checkpoint 1 (v2.0)**: Annotated Git tag `v2.0.0-stable-milestone` and `checkpoints/aio-calender-mk2-backup-v2.0.bundle` serve as the verified v2.0 baseline.
- **Checkpoint 2 (v3.0)**: Annotated Git tag `v3.0.0-stable-milestone` and `checkpoints/aio-calender-mk2-backup-v3.0.bundle` serve as the verified v3.0 release (Windows x64 Native Client, RFC 8252 Loopback OAuth, zero overscroll rubber-banding, and platform UI segregation).
- **Dual Checkpoint Invariant**: Never remove or overwrite Checkpoint 1 (`v2.0.0-stable-milestone`). Both Checkpoint 1 and Checkpoint 2 must permanently coexist on GitHub and in `checkpoints/`.

## 8. Modular Monorepo Architecture
- **Web Frontend (`web/`)**: React 19 + Tailwind CSS + Vite web client. Output directory `web/dist/`.
- **Android Native Client (`mobile/`)**: Capacitor 8 + Android Native Java project in `mobile/android/`. Output APKs signed and packaged via Gradle.
- **Windows Native Client (`desktop/`)**: Dedicated Tauri v2 module for Windows x64 native client.
- **Local Releases (`release-builds/`)**: Local staging directory for production binaries (`AIO-Calender-MK2.apk`, `AIO-Calender-MK2-Portable.exe`, `AIO-Calender-MK2-Setup.exe`). Strictly ignored by `.gitignore` and `.vercelignore`.
- **Milestone Backups (`checkpoints/`)**: Permanent storage directory for milestone bundles and archives.

## 9. Windows System & Registry Integrity
- **Zero Registry Modification**: Never modify, add, or delete Windows registry keys (`HKCU\...\Run`, `HKLM`, etc.), system directories, or startup configurations.
- **No System File Tampering**: All desktop settings must remain strictly in application-local memory or local app storage (`desktop-config.json`).
- **Registry & Autostart Purge**: The Windows native client strictly does not register autostart keys or alter Windows OS startup configuration. Background persistence is managed exclusively via the in-memory System Tray lifecycle.

## 10. Checkpoints Directory Invariant (`checkpoints/`)
- **Hands-off Rule**: Never edit, modify, replace, or delete files inside `c:\Agy\aio-calender-mk2\checkpoints\` unless explicitly commanded by the user.
- **Purpose**: Acts as an unalterable, permanent point of return for verified app releases.

## 11. Pre-Commit Verification Gate
- **Zero Secrets to Git**: Never commit without running a diff check for private keys, API keys, Firebase service account keys, `.env*` files, or deployment tokens.

## 12. Append-Only Documentation Integrity (`GEMINI.md` & `HANDOFF.md`)
- **Never Delete Existing Text**: Never delete, trim, or overwrite existing text, rules, architecture notes, or history entries in `GEMINI.md` or `HANDOFF.md`.
- **Additive Updates Only**: Only append new sections, entries, or clarifications to `GEMINI.md` and `HANDOFF.md` unless the user explicitly instructs otherwise.

## 13. Checkpoint 3 — Pre-Testing Verified Baseline (`v3.1.0-pre-testing-checkpoint`)
- **Annotated Git Tag**: `v3.1.0-pre-testing-checkpoint` (pushed to GitHub `origin`).
- **Local Recovery Artifacts**: `checkpoints/aio-calender-mk2-backup-v3.1-pre-testing.bundle` and `checkpoints/aio-calender-mk2-backup-v3.1-pre-testing.zip`.
- **Scope**: Verified Web, Windows x64 Desktop (`.exe`), and Android APK state including in-app vertical wheel/touchpad scrolling restoration (`c70b1b5`) and mobile bottom navigation bar centering & `Settings` label restoration prior to A/B stress testing and security red-team auditing.
- **Triple Checkpoint Invariant**: Never remove, overwrite, or modify Checkpoint 1 (`v2.0.0-stable-milestone`), Checkpoint 2 (`v3.0.0-stable-milestone`), or Checkpoint 3 (`v3.1.0-pre-testing-checkpoint`) tags or archive/bundle files in `checkpoints/`.



