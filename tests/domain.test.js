import test from "node:test";
import assert from "node:assert/strict";
import {
  calculate,
  billInput,
  companyInput,
  layoutInput,
  defaultLayout,
  canAccess,
  assertLetterhead,
  assertMutable,
  paymentStatus,
} from "../shared/domain.js";
export const input = {
  companyId: "507f1f77bcf86cd799439011",
  date: "2026-10-10",
  dueDate: "2026-11-10",
  recipient: "Sample Company",
  address: "Sample address",
  description: "Services actually provided",
  candidates: 3,
  stipend: 90000,
  establishment: 1234.56,
  basis: "fixed",
  agreedBase: 2000,
  rate: 10.25,
  otherCharges: 1.1,
  adjustment: -0.05,
  terms: "30 days",
  notes: "Additional charges and adjustment agreed with client",
  design: "plain",
  letterheadId: null,
  verified: true,
  authorized: false,
};
test("fixed charges exclude stipend and establishment amounts", () => {
  assert.deepEqual(calculate(input), { feeCents: 1025, totalCents: 1130 });
  assert.deepEqual(
    calculate({ ...input, stipend: 1000000, establishment: 90000 }),
    calculate(input),
  );
});
test("per-candidate multiplication uses integer minor units", () => {
  assert.deepEqual(calculate({ ...input, basis: "per_candidate" }), {
    feeCents: 3075,
    totalCents: 3180,
  });
});
test("percent basis uses explicit amount and rounds half-up to paise", () => {
  assert.equal(
    calculate({ ...input, basis: "establishment_percent", rate: 2.5 }).feeCents,
    3086,
  );
  assert.equal(
    calculate({
      ...input,
      basis: "agreed_base_percent",
      agreedBase: 0.1,
      rate: 5,
    }).feeCents,
    1,
  );
  assert.equal(
    calculate({ ...input, basis: "agreed_base_percent", rate: 10 }).feeCents,
    20000,
  );
});
test("negative total and overflow are rejected", () => {
  assert.throws(() => calculate({ ...input, adjustment: -100 }));
  assert.throws(() =>
    calculate({
      ...input,
      basis: "per_candidate",
      candidates: 1000000,
      rate: 1000000,
    }),
  );
});
test("input rejects unsupported fee bases, excess decimal precision, malformed dates and IDs", () => {
  assert.equal(billInput.safeParse(input).success, true);
  for (const patch of [
    { basis: "stipend_percent" },
    { rate: 1.123 },
    { companyId: "../../secret" },
    { dueDate: "2026-01-01" },
    { date: "2026-02-30" },
    { candidates: 1.2 },
    { stipend: -1 },
    { adjustment: 0.001 },
  ])
    assert.equal(
      billInput.safeParse({ ...input, ...patch }).success,
      false,
      JSON.stringify(patch),
    );
});
test("company and layout schemas validate configuration", () => {
  assert.equal(
    companyInput.safeParse({ name: "X", address: "" }).success,
    false,
  );
  assert.equal(layoutInput.safeParse(defaultLayout).success, true);
  assert.equal(
    layoutInput.safeParse({ ...defaultLayout, fontSize: 50 }).success,
    false,
  );
});
test("staff are company scoped; admins have explicit global access", () => {
  assert.equal(canAccess({ role: "staff", companyIds: ["a"] }, "a"), true);
  assert.equal(canAccess({ role: "staff", companyIds: ["a"] }, "b"), false);
  assert.equal(canAccess({ role: "staff", companyIds: [] }, "a"), false);
  assert.equal(canAccess({ role: "admin" }, "b"), true);
});
test("letterhead selection cannot cross company boundaries", () => {
  assert.doesNotThrow(() => assertLetterhead("a", { companyId: "a" }));
  assert.throws(() => assertLetterhead("a", { companyId: "b" }));
  assert.throws(() => assertLetterhead("a", null));
});
test("only drafts may be modified; all historical states are locked", () => {
  assert.doesNotThrow(() => assertMutable({ status: "draft" }));
  for (const status of ["issued", "paid", "cancelled"])
    assert.throws(() => assertMutable({ status }));
});
test("payment states remain consistent", () => {
  const b = {
    status: "issued",
    paidCents: 0,
    totalCents: 1000,
    data: { dueDate: "2000-01-01" },
  };
  assert.equal(paymentStatus(b), "overdue");
  assert.equal(paymentStatus({ ...b, paidCents: 100 }), "partially paid");
  assert.equal(paymentStatus({ ...b, paidCents: 1000 }), "paid");
  assert.equal(paymentStatus({ ...b, status: "cancelled" }), "cancelled");
  assert.equal(paymentStatus({ ...b, status: "draft" }), "draft");
});

test("itemized authorized charges use per-line half-up rounding and never include stipend", async () => {
  const { chargeAmountCents, chargesTotalCents } =
    await import("../shared/domain.js");
  const charges = [
    {
      description: "Authorized administrative work",
      quantity: 1.5,
      rate: 10.01,
    },
    { description: "Authorized document handling", quantity: 2, rate: 5.25 },
  ];
  assert.equal(chargeAmountCents(charges[0]), 1502);
  assert.equal(chargesTotalCents(charges), 2552);
  const v = { ...input, charges, otherCharges: 25.52, adjustment: 0 };
  assert.equal(billInput.safeParse(v).success, true);
  assert.deepEqual(calculate(v), { feeCents: 1025, totalCents: 3577 });
  assert.deepEqual(calculate({ ...v, stipend: 99000000 }), calculate(v));
  assert.equal(
    billInput.safeParse({ ...v, otherCharges: 25.51 }).success,
    false,
  );
  assert.equal(billInput.safeParse({ ...v, notes: "" }).success, false);
});
test("invalid charge quantities, excessive precision and oversized item counts are rejected", async () => {
  const { chargeInput, chargesTotalCents } =
    await import("../shared/domain.js");
  for (const item of [
    { description: "Fee", quantity: 0, rate: 10 },
    { description: "Fee", quantity: -1, rate: 10 },
    { description: "Fee", quantity: 1.001, rate: 10 },
    { description: "Fee", quantity: 1, rate: -10 },
  ])
    assert.equal(chargeInput.safeParse(item).success, false);
  assert.throws(() =>
    chargesTotalCents([{ quantity: 100000, rate: 100000000 }]),
  );
  assert.equal(
    billInput.safeParse({
      ...input,
      charges: Array.from({ length: 101 }, () => ({
        description: "Fee",
        quantity: 1,
        rate: 0,
      })),
    }).success,
    false,
  );
});
test("business dates use Asia/Kolkata across the UTC midnight boundary", async () => {
  const { businessDate } = await import("../shared/domain.js");
  assert.equal(businessDate(new Date("2026-10-10T18:29:59Z")), "2026-10-10");
  assert.equal(businessDate(new Date("2026-10-10T18:30:00Z")), "2026-10-11");
});
test("password validation rejects bcrypt truncation for multibyte passwords", async () => {
  const { passwordInput } = await import("../shared/domain.js");
  assert.equal(passwordInput.safeParse("a".repeat(72)).success, true);
  assert.equal(passwordInput.safeParse("a".repeat(73)).success, false);
  assert.equal(passwordInput.safeParse("é".repeat(37)).success, false);
  assert.equal(passwordInput.safeParse("short").success, false);
});
