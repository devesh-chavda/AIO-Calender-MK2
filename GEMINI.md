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
