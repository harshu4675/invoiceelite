import crypto from "node:crypto";
const conflict = (message) =>
  Object.assign(new Error(message), { status: 409 });
export const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((k) => value[k] !== undefined)
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export const requestDigest = (value) =>
  digest(JSON.stringify(canonical(value)));
export function assertIdempotent(existing, requestHash, actor) {
  if (
    String(existing.createdBy) !== String(actor) ||
    existing.requestHash !== requestHash
  )
    throw conflict(
      "This submission key was already used for different details. Refresh the record before submitting a new request.",
    );
}
export function assertDraftRevision(header, current) {
  if (!header)
    throw Object.assign(
      new Error("A draft revision is required. Reload the bill before saving."),
      { status: 428 },
    );
  const match = /^"(\d+)"$/.exec(header);
  if (!match || !Number.isSafeInteger(Number(match[1])))
    throw Object.assign(new Error("Invalid draft revision"), { status: 400 });
  if (Number(match[1]) !== current)
    throw conflict(
      "Another user changed this draft. Reload it before saving; your changes were not applied.",
    );
}
export function assertPreviewReceipt(bill, receipt) {
  if (
    !bill.previewHash ||
    receipt.previewHash !== bill.previewHash ||
    receipt.previewRevision !== bill.revision
  )
    throw conflict(
      "The reviewed preview is no longer current. Generate and review the saved PDF again.",
    );
}
export function assertIssuableCompany(bill, company) {
  if (!company || company.archived)
    throw conflict(
      "This company is archived. Restore the company before issuing a new bill.",
    );
  if (
    bill.data.design === "client" &&
    String(company.activeLetterhead) !== String(bill.letterheadId)
  )
    throw conflict(
      "The client letterhead has changed or been deactivated. Edit the draft to select the active version and preview again.",
    );
}
export function assertFileIntegrity(bytes, expected) {
  if (!expected || digest(bytes) !== expected)
    throw conflict(
      "Stored document integrity check failed. Contact your administrator; the file has not been served or issued.",
    );
}
