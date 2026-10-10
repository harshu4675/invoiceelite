import { z } from "zod";
export const passwordInput = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(72)
  .refine(
    (v) => new TextEncoder().encode(v).length <= 72,
    "Password must be at most 72 UTF-8 bytes for bcrypt",
  );
export const money = z
  .number()
  .finite()
  .min(0)
  .max(100000000)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001,
    "Use at most two decimals",
  );
export const chargeInput = z.object({
  description: z.string().trim().min(3).max(1500),
  quantity: money.refine(
    (n) => n > 0 && n <= 100000,
    "Quantity must be greater than zero and at most 100,000",
  ),
  rate: money,
});
export function chargeAmountCents(item) {
  if (
    !Number.isFinite(item.quantity) ||
    item.quantity <= 0 ||
    item.quantity > 100000 ||
    !Number.isFinite(item.rate) ||
    item.rate < 0 ||
    item.rate > 100000000
  )
    throw Object.assign(
      new Error(
        "Enter a positive charge quantity and a non-negative rate within the supported limits",
      ),
      { status: 400 },
    );
  const units = BigInt(Math.round(item.quantity * 100));
  const rate = BigInt(Math.round(item.rate * 100));
  const amount = (units * rate + 50n) / 100n;
  if (amount > 10000000000n)
    throw Object.assign(
      new Error("An authorized charge exceeds the supported amount"),
      { status: 400 },
    );
  return Number(amount);
}
export function chargesTotalCents(items = []) {
  const total = items.reduce((sum, item) => sum + chargeAmountCents(item), 0);
  if (!Number.isSafeInteger(total) || total > 10000000000)
    throw Object.assign(
      new Error("Authorized charges exceed the supported total"),
      { status: 400 },
    );
  return total;
}
export function businessDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export const companyInput = z.object({
  name: z.string().trim().min(2).max(160),
  contact: z.string().max(120).default(""),
  email: z.union([z.string().email(), z.literal("")]).default(""),
  phone: z.string().max(40).default(""),
  address: z.string().min(3).max(1200),
  identification: z.string().max(120).default(""),
  terms: z.string().max(1000).default("Payment within 30 days"),
  defaultRate: money.default(0),
  archived: z.boolean().default(false),
});
export const layoutInput = z.object({
  top: z.number().min(0).max(1500),
  bottom: z.number().min(0).max(1500),
  left: z.number().min(15).max(500),
  right: z.number().min(15).max(500),
  fontSize: z.number().min(8).max(16),
  lineSpacing: z.number().min(1.2).max(2),
  sectionGap: z.number().min(8).max(100),
  repeat: z.boolean(),
  descriptionColumn: z.number().min(0.45).max(0.7),
  pageBreaks: z
    .array(
      z.enum(["details", "billedTo", "table", "summary", "terms", "signature"]),
    )
    .default([]),
  titleSize: z.number().min(12).max(24).default(18),
  positions: z
    .object({
      title: z.number().min(0).max(1500),
      details: z.number().min(0).max(1500),
      billedTo: z.number().min(0).max(1500),
      table: z.number().min(0).max(1500),
      summary: z.number().min(0).max(1500),
      terms: z.number().min(0).max(1500),
      signature: z.number().min(0).max(1500),
    })
    .default({
      title: 0,
      details: 0,
      billedTo: 0,
      table: 0,
      summary: 0,
      terms: 0,
      signature: 0,
    }),
});
export const defaultLayout = {
  top: 145,
  bottom: 90,
  left: 45,
  right: 45,
  fontSize: 10,
  lineSpacing: 1.5,
  sectionGap: 16,
  repeat: true,
  descriptionColumn: 0.6,
  pageBreaks: [],
  titleSize: 18,
  positions: {
    title: 0,
    details: 0,
    billedTo: 0,
    table: 0,
    summary: 0,
    terms: 0,
    signature: 0,
  },
};
export const billInput = z
  .object({
    companyId: z.string().regex(/^[a-f\d]{24}$/i),
    date: z.string().date(),
    dueDate: z.string().date(),
    recipient: z.string().min(2).max(200),
    address: z.string().min(3).max(1200),
    description: z.string().min(3).max(12000),
    reference: z.string().max(200).default(""),
    candidates: z.number().int().min(0).max(1000000),
    stipend: money,
    establishment: money,
    basis: z.enum([
      "fixed",
      "per_candidate",
      "establishment_percent",
      "agreed_base_percent",
    ]),
    agreedBase: money,
    rate: money,
    otherCharges: money,
    charges: z.array(chargeInput).max(100).default([]),
    adjustment: z
      .number()
      .finite()
      .min(-100000000)
      .max(100000000)
      .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001),
    terms: z.string().max(2000),
    notes: z.string().max(3000),
    design: z.enum(["plain", "business", "client"]),
    letterheadId: z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .nullable()
      .default(null),
    verified: z.boolean(),
    authorized: z.boolean(),
  })
  .refine((v) => v.dueDate >= v.date, {
    message: "Due date must be on or after bill date",
    path: ["dueDate"],
  })
  .superRefine((v, ctx) => {
    if (v.charges.length) {
      try {
        if (chargesTotalCents(v.charges) !== Math.round(v.otherCharges * 100))
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["otherCharges"],
            message: "Other charges must equal the itemized authorized charges",
          });
      } catch (e) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["charges"],
          message: e.message,
        });
      }
    }
    if (
      (v.otherCharges !== 0 || v.adjustment !== 0) &&
      v.notes.trim().length < 3
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notes"],
        message:
          "Explain the authorization for additional charges or adjustments",
      });
  });
export function calculate(v) {
  const cents = (n) => BigInt(Math.round(n * 100));
  let fee = cents(v.rate);
  if (v.basis === "per_candidate") fee *= BigInt(v.candidates);
  if (v.basis.endsWith("_percent"))
    fee =
      (cents(
        v.basis === "establishment_percent" ? v.establishment : v.agreedBase,
      ) *
        cents(v.rate) +
        5000n) /
      10000n;
  const additional = v.charges?.length
    ? BigInt(chargesTotalCents(v.charges))
    : cents(v.otherCharges);
  const total = fee + additional + cents(v.adjustment);
  if (total < 0n || total > 10000000000n)
    throw Object.assign(
      new Error("Payable amount must be between 0 and 100,000,000"),
      { status: 400 },
    );
  return { feeCents: Number(fee), totalCents: Number(total) };
}
export function assertLetterhead(companyId, letterhead) {
  if (!letterhead || String(letterhead.companyId) !== String(companyId))
    throw Object.assign(
      new Error("Letterhead does not belong to this company"),
      { status: 400 },
    );
}
export function assertMutable(bill) {
  if (bill.status !== "draft")
    throw Object.assign(
      new Error("Issued bills are immutable. Cancel and create a replacement."),
      { status: 409 },
    );
}
export function canAccess(user, companyId) {
  return (
    user.role === "admin" ||
    user.companyIds.some((id) => String(id) === String(companyId))
  );
}
export function paymentStatus(bill) {
  if (["draft", "cancelled"].includes(bill.status)) return bill.status;
  if (bill.paidCents >= bill.totalCents) return "paid";
  if (bill.paidCents > 0) return "partially paid";
  if (bill.data.dueDate < businessDate()) return "overdue";
  return "issued";
}
