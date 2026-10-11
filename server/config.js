import path from "node:path";
export function loadConfig() {
  const e = process.env;
  if (
    !e.JWT_SECRET ||
    e.JWT_SECRET.length < 32 ||
    e.JWT_SECRET.startsWith("replace-")
  )
    throw new Error(
      "Set JWT_SECRET to a random secret of at least 32 characters",
    );
  if (!e.MONGODB_URI)
    throw new Error("Set MONGODB_URI to a replica-set MongoDB connection");
  if (!e.APP_ORIGIN)
    throw new Error("Set APP_ORIGIN to the exact browser origin");
  if (new URL(e.APP_ORIGIN).origin !== e.APP_ORIGIN)
    throw new Error(
      "APP_ORIGIN must be an origin without a trailing slash or path",
    );
  if (
    e.NODE_ENV === "production" &&
    (!e.APP_ORIGIN.startsWith("https://") ||
      !e.BUSINESS_ADDRESS ||
      e.BUSINESS_ADDRESS.startsWith("Configure"))
  )
    throw new Error(
      "Production requires HTTPS APP_ORIGIN and a real BUSINESS_ADDRESS",
    );
  return {
    secret: e.JWT_SECRET,
    origin: e.APP_ORIGIN,
    production: e.NODE_ENV === "production",
    trustProxy: e.TRUST_PROXY === "1",
    storage: path.resolve(e.STORAGE_DIR || "storage"),
    businessName: e.BUSINESS_NAME || "Elite Apprenticeship Services",
    businessAddress: e.BUSINESS_ADDRESS || "Billing address not configured",
  };
}
