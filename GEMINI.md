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

## 7. v2.0 Codebase Freeze & v3.0 Scope
- **v2.0 Bookmark Invariant**: The Git tag `v2.0.0-stable-milestone` and local recovery bundle serve as the permanent bookmark for the verified v2.0 release. If anything goes wrong during refactoring, return to this point immediately.
- **Codebase Freezing**: Strictly NO further changes to Android `.apk` files (`android/` or `mobile/`) and NO further changes to web files (`src/` or `web/`). Their features and logic are complete, tested, and frozen.
- **v3.0 Target (Windows x64 Native)**: All future work from this point onwards is strictly confined to organizing files into a modular monorepo structure (`web/`, `mobile/`, `desktop/`, `release-builds/`) and building the native Windows x64 `.exe` application.

## 8. Modular Monorepo Architecture
- **Web Frontend (`web/`)**: React 19 + Tailwind CSS + Vite web client. Output directory `web/dist/`.
- **Android Native Client (`mobile/`)**: Capacitor 8 + Android Native Java project in `mobile/android/`. Output APKs signed and packaged via Gradle.
- **Windows Native Client (`desktop/`)**: Dedicated module for Windows x64 native client.
- **Local Releases (`release-builds/`)**: Local staging directory for production binaries (`AIO-Calender-MK2.apk`, Windows executables). Strictly ignored by `.gitignore` and `.vercelignore`.

## 9. Windows System & Registry Integrity
- **Zero Registry Modification**: Never modify, add, or delete Windows registry keys (`HKCU\...\Run`, `HKLM`, etc.), system directories, or startup configurations.
- **No System File Tampering**: All desktop settings must remain strictly in application-local memory or local app storage (`desktop-config.json`).
- **Registry & Autostart Purge**: The Windows native client strictly does not register autostart keys or alter Windows OS startup configuration. Background persistence is managed exclusively via the in-memory System Tray lifecycle.


