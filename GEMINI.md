# Project Invariants & Guardrails — AIO Calender MK2

## 1. Strict Scope & Feature Discipline
- **No Unrequested Features**: Never invent, generate, or add unrequested UI controls, "clear all" buttons, extra menus, or speculative capabilities.
- **Maintain Original UX**: Preserve original deletion and editing mechanisms exactly as authored in the source codebase.
- **Strict Adherence**: Execute only what is explicitly specified in the user prompt (e.g., notifications, app launch speed, bug fixes).

## 2. Secret Hygiene & VCS Invariant
- **Zero Secrets to Git**: Never commit, stage, or push private API keys, Firebase service account keys, `.env*` files, or deployment tokens to GitHub.
- **Zero Secrets to Vercel**: Never push or expose private secrets to Vercel builds or platform settings.
- **Filesystem Isolation**: Strictly remain within the workspace folder (`c:\Agy\aio-calender-mk2`). Never touch outside paths.

## 3. Brand Naming & Domain Invariant
- **Naming Convention**: The project branding is strictly "AIO Calender MK2" (spelled "Calender" with an E).
- **Domains**: Primary domain is `aio-calender-mk2.vercel.app` (with an E). Secondary domain is `aio-calander-mk2.vercel.app` (with an A) redirecting to the primary.
