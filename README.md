# AIO Calender MK2 (v2.0)

[![Release](https://img.shields.io/badge/release-v2.0.0--stable-blue.svg)](https://github.com/devesh-chavda/AIO-Calender-MK2/releases)
[![Platform](https://img.shields.io/badge/platform-Android%207.0%20to%2017%2B%20%7C%20Web-brightgreen.svg)](#platform-support)
[![React](https://img.shields.io/badge/React-19.2-blue?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.2-646CFF?logo=vite)](https://vitejs.dev/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.5-119EFF?logo=capacitor)](https://capacitorjs.com/)
[![Firebase](https://img.shields.io/badge/Firebase-v12-FFCA28?logo=firebase)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](#license)

> **AIO Calender MK2** is the second-generation, production-grade academic management platform built for modern university students and educators. Combining a lightning-fast responsive web client with a native Android exact-alarm engine, MK2 ensures you never miss a lecture, lab session, or assignment deadline.

- **Primary Web URL**: [https://aio-calender-mk2.vercel.app](https://aio-calender-mk2.vercel.app)
- **Secondary Domain (Redirects to Primary)**: [https://aio-calander-mk2.vercel.app](https://aio-calander-mk2.vercel.app)
- **Android Application ID**: `com.aiocalendermk2`

---

## Table of Contents

- [Overview & The MK2 Evolution](#overview--the-mk2-evolution)
- [Key Features](#key-features)
  - [1. Unified Academic Timetable & Grid Matrix](#1-unified-academic-timetable--grid-matrix)
  - [2. Agenda & Upcoming Deadlines](#2-agenda--upcoming-deadlines)
  - [3. Zero-Battery-Drain Native AlarmClock Engine](#3-zero-battery-drain-native-alarmclock-engine)
  - [4. Universal Android Compatibility (7.0 to 17+)](#4-universal-android-compatibility-70-to-17)
  - [5. OEM & Samsung One UI Battery Optimization Tuning](#5-oem--samsung-one-ui-battery-optimization-tuning)
  - [6. Real-Time Cloud Sync & Offline-First Storage](#6-real-time-cloud-sync--offline-first-storage)
- [Tech Stack](#tech-stack)
- [Project Architecture](#project-architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Configuration](#environment-configuration)
  - [Web Development](#web-development)
  - [Building for Production (Web)](#building-for-production-web)
- [Android Build & Deployment](#android-build--deployment)
  - [Capacitor Sync](#capacitor-sync)
  - [Keystore & Release Signing](#keystore--release-signing)
  - [Building the Signed Release APK](#building-the-signed-release-apk)
- [Security Invariants & Privacy Guardrails](#security-invariants--privacy-guardrails)
- [Point of Return & Backup Policy](#point-of-return--backup-policy)
- [License](#license)

---

## Overview & The MK2 Evolution

**AIO Calender MK1** originated as an exploratory academic timetable tool. While functional on desktop web, MK1 suffered from the typical pitfalls of hybrid web-wrapped apps:
- Background notifications frequently killed by aggressive Android OEM power management (Samsung, Xiaomi, OnePlus).
- Notification loss upon device reboots.
- Slow cold start times and layout shifts.
- Reliance on web popup authentication that broke inside mobile webviews.

**AIO Calender MK2** is a complete ground-up re-engineering designed for uncompromising production reliability:

| Capability | AIO Calender MK1 | AIO Calender MK2 (v2.0) |
|---|---|---|
| **Android Background Alarms** | Standard Web Notifications / standard alarms (killed by Android Doze) | Native `AlarmManager.setAlarmClock()` that pierces Doze mode with 0% extra battery drain |
| **Device Reboot Resilience** | Alarms lost on phone restart | `AIOBootReceiver` with `directBootAware="true"` reschedules all alarms before unlock |
| **Android OS Support** | Android 10+ only | Universal support from **Android 7.0 (API 24)** up to **Android 17+ (API 36+)** |
| **Lock-Screen Waking** | None | Full-screen intent with `showWhenLocked` and `turnScreenOn` flags |
| **OEM Background Guard** | None | In-app diagnostics & 1-tap deep links to Samsung, Xiaomi, OnePlus auto-start managers |
| **Google Authentication** | Web popup (often blocked on mobile) | Native in-app Google Sign-In with `@codetrix-studio/capacitor-google-auth` + Web OAuth fallback |
| **Cloud Synchronization** | Basic REST sync | Real-time bi-directional Firebase Firestore listeners with offline fallback |
| **Release Signing** | Unsigned debug builds | Production v1, v2, v3, and v4 APK signing schemes with SHA-256 fingerprint verification |

---

## Key Features

### 1. Unified Academic Timetable & Grid Matrix
- **Dual Visual Modes**: Toggle effortlessly between an intuitive **Daily Agenda View** and a comprehensive **Weekly Grid Matrix** spanning 8:00 AM to 8:00 PM.
- **Dynamic Time Marker**: Live indicator highlighting the ongoing lecture and the minutes remaining until class ends.
- **Course Metadata**: Rich cards displaying course name, course code, instructor, classroom/lecture hall, custom color categorization, and syllabus notes.
- **Multi-Semester Organization**: Seamlessly switch between academic terms (e.g., Monsoon 2026, Winter 2026) without data mingling.

### 2. Agenda & Upcoming Deadlines
- **Task & Assignment Hub**: Track assignments, lab reports, project deliverables, and exams.
- **Priority Categorization**: Color-coded badges for High, Medium, and Low urgency tasks.
- **Automated Deadline Warnings**: Custom lead-time alerts configured specifically for upcoming deliverables (e.g., 1 hour, 1 day, or daily reminders).
- **Completion Tracking**: Single-tap task completion with visual strikethroughs and instant cloud sync.

### 3. Zero-Battery-Drain Native AlarmClock Engine
Standard timers and periodic background workers consume CPU cycles and get throttled or terminated by Android's Doze mode. MK2 implements a dedicated native bridge:
- **`AIOAlarmScheduler`**: Registers system alarms using `AlarmManager.setAlarmClock(AlarmClockInfo, pendingIntent)`.
- **System Alarm Priority**: The Android OS guarantees exact execution for alarms scheduled via `AlarmClockInfo`, granting head-of-line execution privileges.
- **Zero Polling**: Zero background services or persistent wake locks while idling, resulting in absolute 0% idle battery consumption.
- **Persistent Storage**: Alarms are serialized to secure device storage via `AIOAlarmStorage`, surviving app updates and process eviction.

### 4. Universal Android Compatibility (7.0 to 17+)
- **Target SDK 35 / Compile SDK 36**: Pre-configured for modern Android 15, 16, and 17+ developer previews.
- **Min SDK 24**: Maintains 100% backward compatibility for legacy devices running Android 7.0 Nougat.
- **Edge-to-Edge & Gesture Navigation**: Fully compatible with Android 15+ edge-to-edge system bar enforcement and predictive back gestures (`enableOnBackInvokedCallback="true"`).

### 5. OEM & Samsung One UI Battery Optimization Tuning
Aggressive battery management software on popular OEM brands (Samsung One UI, Xiaomi HyperOS/MIUI, OnePlus/Oppo OxygenOS/ColorOS, Vivo FuntouchOS, Huawei EMUI) frequently puts calendar apps to sleep:
- **Advanced Settings Menu**: A clean, accessible diagnostic dropdown directly in the app bar.
- **Exemption Inspector**: Instantly reports whether `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is active and whether `SCHEDULE_EXACT_ALARM` permissions are granted.
- **One-Tap OEM Deep Links**: Direct shortcut intents targeting manufacturer auto-start and memory cleaner whitelists.
- **Instant Test Notification Trigger**: Allows users to immediately verify Heads-Up notification sound, vibration, and banner display.

### 6. Real-Time Cloud Sync & Offline-First Storage
- **Firebase Firestore Live Sync**: Uses snapshot listeners (`onSnapshot`) for instant cross-device updates between laptop, tablet, and smartphone.
- **Offline Resilience**: Full offline availability via cached local storage; changes made offline sync automatically upon reconnection.
- **Strict User Scoping**: Academic schedules are strictly compartmentalized under `/users/{userId}/...` paths, fully protected by hardened Firestore security rules.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | [React 19.2](https://react.dev/) |
| **Build Tooling & Bundler** | [Vite 8.2](https://vitejs.dev/) with Rolldown / ESBuild |
| **Styling & Design System** | [Tailwind CSS v4](https://tailwindcss.com/) with Dark Mode support |
| **Mobile Runtime** | [Capacitor 8.5](https://capacitorjs.com/) |
| **Native Android Layer** | Java 17, Android SDK 24-36, Jetpack Core, AlarmManager |
| **Authentication** | Firebase Auth + `@codetrix-studio/capacitor-google-auth` |
| **Database & Real-Time Sync**| Cloud Firestore (Firebase SDK v12) |
| **Hosting & Edge Delivery** | [Vercel](https://vercel.com/) (Fluid Compute, Edge Redirects) |

---

## Project Architecture

```
aio-calender-mk2/
├── android/                               # Native Android Studio project
│   ├── app/
│   │   ├── build.gradle                  # App-level Gradle (SDK 24-36, v1-v4 signing)
│   │   └── src/main/
│   │       ├── AndroidManifest.xml       # Permissions, receivers & activity declaration
│   │       └── java/com/aiocalender/
│   │           ├── AIOAlarmPlugin.java   # Capacitor-to-Java native bridge
│   │           ├── AIOAlarmReceiver.java # Broadcast receiver for alarm trigger
│   │           ├── AIOAlarmScheduler.java# AlarmManager.setAlarmClock scheduler
│   │           ├── AIOAlarmStorage.java  # Persistent JSON disk storage for alarms
│   │           ├── AIOBootReceiver.java   # Direct-boot aware reboot listener
│   │           └── MainActivity.java     # Main Capacitor entry point
│   ├── build.gradle                      # Root project Gradle configuration
│   └── variables.gradle                  # Global SDK versions (minSdk 24, compileSdk 36)
├── public/                               # Static web assets & icons
├── scripts/
│   └── patch-google-auth.cjs             # Build patch for Capacitor Google Auth plugin
├── src/
│   ├── App.css                           # Application base stylesheet
│   ├── App.jsx                           # Primary application dashboard & routing
│   ├── ErrorBoundary.jsx                 # Crash resilience wrapper
│   ├── firebase.js                       # Firebase app initialization & error handlers
│   ├── index.css                         # Tailwind CSS imports & theme definitions
│   ├── main.jsx                          # React root mounting
│   └── notifications.js                  # Notification scheduler, OEM deep links & bridge
├── .env.example                          # Environment variable template
├── .gitignore                            # Secrets & build artifact exclusion
├── capacitor.config.json                 # Capacitor app & plugin configuration
├── firestore.rules                       # Production Firestore security rules
├── package.json                          # Dependencies & build scripts
├── vercel.json                           # Vercel deployment, rewrite & domain redirect rules
└── vite.config.js                        # Vite configuration
```

---

## Getting Started

### Prerequisites
- **Node.js**: v20 LTS or higher
- **Package Manager**: `npm` (v10+)
- **Android Studio** (for mobile development): Hedgehog / Ladybug or newer with Android SDK 35/36 installed
- **Java Development Kit**: JDK 17 or JDK 21

### Environment Configuration
Copy the example environment template:
```bash
cp .env.example .env
```
Populate `.env` with your Firebase project credentials:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=aio-calender-mk2.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=aio-calender-mk2
VITE_FIREBASE_STORAGE_BUCKET=aio-calender-mk2.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_DATABASE_ID=(default)
VITE_GOOGLE_OAUTH_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com
```

### Web Development
Start the local development server:
```bash
npm run dev
```
Navigate to `http://localhost:5173` in your browser.

### Building for Production (Web)
Run the Vite production build:
```bash
npm run build
```
The optimized web distribution will be emitted to `dist/`.

---

## Android Build & Deployment

### Capacitor Sync
Export web assets to the native Android platform:
```bash
npm run build
npx cap sync android
```

### Keystore & Release Signing
MK2 uses a dedicated release keystore with SHA-256 certificate fingerprints registered in Google Cloud Console and Firebase:
- Keystore file: `android/app/aio-calender-mk2.keystore` *(git-ignored)*
- Configuration: `android/keystore.properties` *(git-ignored)*

Verify your `android/keystore.properties`:
```properties
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=aiocalendermk2
storeFile=aio-calender-mk2.keystore
```

### Building the Signed Release APK
From the `android/` directory:
```bash
cd android
./gradlew assembleRelease
```
The production signed APK will be generated at:
`android/app/build/outputs/apk/release/app-release.apk`

---

## Security Invariants & Privacy Guardrails

1. **Zero Secrets in Git**: Keystore binaries (`*.keystore`, `*.jks`), private credentials (`*.json`), and environment secrets (`.env*`) are strictly blocked by `.gitignore`.
2. **Authorized Account Isolation**: Testing and user data synchronization are strictly bound to the authorized project administrator account (`Deveshchavda207@gmail.com`).
3. **Firestore Access Control**: All write and read operations are restricted to `request.auth.uid == userId`. No unauthenticated queries or cross-account access are permitted.
4. **Domain Enforcement**: Primary production traffic is strictly served from `aio-calender-mk2.vercel.app`, with automatic HTTP 308 permanent redirect from `aio-calander-mk2.vercel.app`.

---

## Point of Return & Backup Policy

All verified milestone states are recorded via annotated git tags:
```bash
# Example milestone tag
git tag -a v2.0.0-stable-milestone -m "AIO Calender MK2 Production Milestone v2.0"
git push origin --tags
```

To create a local standalone recovery bundle:
```bash
git bundle create aio-calender-mk2-backup-v2.0.bundle --all
```

---

## License

This project is licensed under the MIT License. Copyright (c) 2026 Devesh Chavda.
