# Checkpoints & Milestone Recovery Directory

This directory holds permanent, verified recovery points for **AIO Calender MK2**.

> [!CAUTION]
> **STRICT RULE**: Never edit, modify, delete, or overwrite files in this directory unless explicitly commanded by the user. These backups serve as the absolute point of return if anything goes wrong during development.

---

## Stored Milestones

### Checkpoint 1 (v2.0 Stable Milestone)
- **Git Tag**: `v2.0.0-stable-milestone`
- **Bundle File**: `aio-calender-mk2-backup-v2.0.bundle`
- **Zip Archive**: `aio-calender-mk2-backup-v2.0.zip`
- **Scope**: Verified Android Native APK (AlarmClock RTC engine, Direct Boot safety, background notifications, haptics, battery optimization) and Web client.

### Checkpoint 2 (v3.0 Desktop Native & Platform Segregation Milestone)
- **Git Tag**: `v3.0.0-stable-milestone`
- **Bundle File**: `aio-calender-mk2-backup-v3.0.bundle`
- **Zip Archive**: `aio-calender-mk2-backup-v3.0.zip`
- **Scope**:
  - Modular Monorepo (`web/`, `mobile/`, `desktop/`, `release-builds/`).
  - Windows x64 Native Client via Tauri v2 (`AIO-Calender-MK2-Portable.exe` and `AIO-Calender-MK2-Setup.exe`).
  - RFC 8252 System Browser + Ephemeral Loopback OAuth flow (zero password typing, 1-tap Google sign-in).
  - True Native Desktop experience: WebView2 elastic overscroll permanently disabled (`--disable-features=ElasticOverscroll`), native dark `#0a0a0c` window background, zero white edges/lines on scroll.
  - Strict platform feature segregation (Haptics & Battery tuning exclusive to Android APK; Minimize to Tray exclusive to Windows .exe; Vercel Web displays informational web mode).

---

## How to Restore from a Checkpoint

### From Git Tag
```powershell
# Restore to Checkpoint 1 (v2.0)
git checkout v2.0.0-stable-milestone

# Restore to Checkpoint 2 (v3.0)
git checkout v3.0.0-stable-milestone
```

### From Local Git Bundle
```powershell
# Inspect bundle
git bundle verify checkpoints/aio-calender-mk2-backup-v3.0.bundle

# Fetch directly from bundle
git fetch checkpoints/aio-calender-mk2-backup-v3.0.bundle main:restored-v3.0
```

---

### Checkpoint 3 (v3.1.0 Pre-Testing Baseline)
- **Git Tag**: `v3.1.0-pre-testing-checkpoint`
- **Bundle File**: `aio-calender-mk2-backup-v3.1-pre-testing.bundle`
- **Zip Archive**: `aio-calender-mk2-backup-v3.1-pre-testing.zip`
- **Scope**:
  - Verified pre-testing baseline across Web (`aio-calender-mk2.vercel.app`), Windows x64 Native Desktop (`.exe`), and Android Native APK (`release-builds/AIO-Calender-MK2.apk`).
  - Includes in-app vertical wheel/touchpad scrolling restoration (`c70b1b5`) and mobile bottom navigation bar centering & `Settings` label restoration.

#### Restore Checkpoint 3
```powershell
# Restore from Git tag
git checkout v3.1.0-pre-testing-checkpoint

# Inspect & restore from local Git bundle
git bundle verify checkpoints/aio-calender-mk2-backup-v3.1-pre-testing.bundle
git fetch checkpoints/aio-calender-mk2-backup-v3.1-pre-testing.bundle main:restored-v3.1-pre-testing
```
