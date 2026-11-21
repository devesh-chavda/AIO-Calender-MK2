# Desktop Client — AIO Calender MK2 (v3.0 Target)

## Overview
This directory is the dedicated module for the **AIO Calender MK2** native Windows x64 desktop application.

## Architecture
- **Framework Target**: Native Windows desktop wrapper (Tauri v2 / WebView2 or lightweight runtime).
- **Frontend Source**: Consumes production web bundle from `../web/dist`.
- **Key Capabilities**:
  - Native Windows 10 & 11 Action Center toast notifications with audio cues.
  - System tray minimization and background wake execution.
  - Zero-bloat standalone portable executable and Windows installer staged in `release-builds/`.
- **Isolation Guarantee**: Completely separated from `web/` and `mobile/` to maintain 0% regression risk across platforms.
