import test from "node:test";
import assert from "node:assert/strict";
import {
  requestDigest,
  assertIdempotent,
  assertDraftRevision,
  assertPreviewReceipt,
  assertIssuableCompany,
  digest,
  assertFileIntegrity,
} from "../server/integrity.js";

test("idempotency hashes canonicalize object keys without erasing meaningful changes", () => {
  assert.equal(
    requestDigest({ b: 2, a: { x: 1, y: 2 } }),
    requestDigest({ a: { y: 2, x: 1 }, b: 2 }),
  );
  assert.notEqual(
    requestDigest({ amount: 100, date: "2026-10-10" }),
    requestDigest({ amount: 100, date: "2026-10-11" }),
  );
  assert.notEqual(
    requestDigest({ items: [1, 2] }),
    requestDigest({ items: [2, 1] }),
  );
});
test("replays must belong to the original actor and exact financial request", () => {
  const requestHash = requestDigest({ amount: 100 });
  const existing = { createdBy: "operator-a", requestHash };
  assert.doesNotThrow(() =>
    assertIdempotent(existing, requestHash, "operator-a"),
  );
  assert.throws(
    () =>
      assertIdempotent(existing, requestDigest({ amount: 101 }), "operator-a"),
    { status: 409 },
  );
  assert.throws(() => assertIdempotent(existing, requestHash, "operator-b"), {
    status: 409,
  });
});
test("draft optimistic locking rejects missing, malformed and stale revisions", () => {
  assert.doesNotThrow(() => assertDraftRevision('"2"', 2));
  assert.throws(() => assertDraftRevision(undefined, 2), { status: 428 });
  for (const h of ["*", "2", '"not-a-version"', '"99999999999999999999"'])
    assert.throws(() => assertDraftRevision(h, 2), { status: 400 });
  assert.throws(() => assertDraftRevision('"1"', 2), { status: 409 });
});
test("a preview receipt is bound to both the reviewed PDF and draft revision", () => {
  const b = { previewHash: "actual-preview", revision: 4 };
  assert.doesNotThrow(() =>
    assertPreviewReceipt(b, {
      previewHash: "actual-preview",
      previewRevision: 4,
    }),
  );
  for (const receipt of [
    {},
    { previewHash: "actual-preview" },
    { previewHash: "actual-preview", previewRevision: 3 },
    { previewHash: "different-file", previewRevision: 4 },
  ])
    assert.throws(() => assertPreviewReceipt(b, receipt), { status: 409 });
});
test("new issuance rejects archived companies and replaced or deactivated letterheads", () => {
  const b = { data: { design: "client" }, letterheadId: "version-one" };
  assert.doesNotThrow(() =>
    assertIssuableCompany(b, {
      archived: false,
      activeLetterhead: "version-one",
    }),
  );
  for (const c of [
    null,
    { archived: true, activeLetterhead: "version-one" },
    { archived: false },
    { archived: false, activeLetterhead: "version-two" },
  ])
    assert.throws(() => assertIssuableCompany(b, c), { status: 409 });
  assert.doesNotThrow(() =>
    assertIssuableCompany({ data: { design: "plain" } }, { archived: false }),
  );
});
test("file hashes detect changed bytes rather than silently serving a changed issued document", () => {
  const bytes = Buffer.from("reviewed PDF");
  const hash = digest(bytes);
  assert.doesNotThrow(() => assertFileIntegrity(bytes, hash));
  assert.throws(() => assertFileIntegrity(Buffer.from("changed PDF"), hash), {
    status: 409,
  });
  assert.throws(() => assertFileIntegrity(bytes, undefined), { status: 409 });
});
