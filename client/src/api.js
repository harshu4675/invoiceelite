import { businessDate } from "../../shared/domain";
export async function api(url, options = {}) {
  const headers = { "X-Requested-With": "InvoiceElite", ...options.headers };
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  const r = await fetch("/api" + url, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({
      error:
        "The API is unavailable. Check that the backend and MongoDB are configured and running.",
    }));
    if (r.status === 401) window.dispatchEvent(new Event("session-expired"));
    throw Object.assign(new Error(e.error), { status: r.status });
  }
  return options.blob ? r.blob() : r.json();
}
export const currency = (c) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format((c || 0) / 100);
export const today = (date = new Date()) => businessDate(date);
