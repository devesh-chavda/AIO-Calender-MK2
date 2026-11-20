# Security Specification — AIO Calender MK2

## 1. Data Invariants
- Every user workspace document at `/users/{userId}` can only be read, created, updated, or deleted by the authenticated user whose `request.auth.uid == userId`.
- Document ID `userId` must match `^[a-zA-Z0-9_\-]+$` and be at most 128 characters.
- Permitted keys in `/users/{userId}` are user workspace data (`schedules`, `tasks`, `notifSettings`), user profile attributes (`email`, `displayName`, `photoURL`, `uid`, `id`, `name`, `createdAt`, `updatedAt`, `lastLogin`), and workspace configuration (`activeSemester`, `theme`, `settings`, `preferences`, `metadata`, `status`).
- `schedules` (if present) must be a Map with at most 30 keys (semesters).
- `tasks` (if present) must be a List with at most 500 elements.
- `notifSettings` (if present) must be a Map with at most 20 keys.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `{ "schedules": {}, "tasks": [], "notifSettings": {} }` with `auth = null`.
2. **Unauthenticated Read**: Attempting to read `/users/user_1` with `auth = null`.
3. **Cross-User Read/Write (ID Spoofing)**: User `uid_A` attempting `get` or `set` on `/users/uid_B`.
4. **Shadow Field Injection on Create**: `{ "schedules": {}, "tasks": [], "notifSettings": {}, "isAdmin": true }`.
5. **Shadow Field Injection on Update**: Updating `/users/uid_A` with `{ "role": "superuser" }`.
6. **Type Poisoning on `schedules`**: `{ "schedules": "not-a-map", "tasks": [], "notifSettings": {} }`.
7. **Type Poisoning on `tasks`**: `{ "schedules": {}, "tasks": "not-a-list", "notifSettings": {} }`.
8. **Type Poisoning on `notifSettings`**: `{ "schedules": {}, "tasks": [], "notifSettings": [] }`.
9. **Array Exhaustion on `tasks`**: `{ "tasks": [/* 501 items */] }`.
10. **Map Key Exhaustion on `schedules`**: `{ "schedules": { /* 31 keys */ } }`.
11. **Invalid Document ID Poisoning**: Creating `/users/invalid$id!with@spaces`.
12. **Unauthorized Collection Listing**: Listing `/users` collection to scrape other users' documents.
