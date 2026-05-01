export const API_BASE_URL =
  process.env.KMS_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000/api/v1";

export const AUTH_COOKIE_NAME = "kms_access_token";
export const AUTH_COOKIE_SECURE = process.env.KMS_AUTH_COOKIE_SECURE === "true";
