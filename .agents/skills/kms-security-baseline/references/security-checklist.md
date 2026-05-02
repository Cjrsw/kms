# KMS Security Checklist

Primary source: `docs/安全基线.md`

## Session and Token

- Access token TTL and frontend session cookie TTL stay aligned at 12 hours.
- Token keeps `sub`, `exp`, `ver`, and `jti`.
- Revocation keeps both `token_version` and `jti`.
- Clearance, enable/disable, and password change still bump `token_version`.
- Logout still revokes the current `jti`.

## Login Lockout

- Error limit stays at 5.
- The fifth error locks for 5 minutes.
- While locked, the backend must not evaluate the password and must not add extra penalty.
- After unlock, each new wrong password extends the lock duration by another 5 minutes.
- Successful login resets failure count and clears the lock state.
- Failure responses still return structured lock information, including timezone-aware ISO `locked_until`.

## 401 Session Cleanup

- Any backend `401` still enters the frontend cleanup flow.
- Cleanup order stays: call backend logout first, then clear local cookie/session.
- Protected routes and attachment proxy routes still route through `/logout`, not direct `/login`.

## CORS and Environment Safety

- CORS stays allowlist-only; no `*`.
- CORS allowlist remains admin-manageable.
- Production startup still rejects insecure defaults:
  - `SECRET_KEY=change-me`
  - localhost default allowlist
  - empty allowlist

## Authz and Audit

- Backend auth dependency still enforces bearer parsing and role checks.
- Failed auth stays explicit `401/403`; no silent downgrade.
- Auth and authz audit logs stay queryable by admin.

## Password and Account Lifecycle

- Role model stays `admin` and `employee`.
- User-initiated password changes still require 6-64 chars with letters and digits.
- First login is not forced to change password, but `need_password_change` reminder stays available.
- Admin password reset is allowed only through the reset-request workflow or explicit admin edit action.
- Admin reset must use the system default password `123456`, set `need_password_change=true`, clear lockout state, bump `token_version`, and write an auth audit log.
- Disable/enable behavior still records disabled time and invalidates sessions.

## Review Rule

If a change touches any item above, include the exact affected clause in your summary and confirm whether `docs/安全基线.md` needs to change too.
