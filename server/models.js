import mongoose from "mongoose";
const { Schema } = mongoose;
const ref = (model, required = true) => ({
  type: Schema.Types.ObjectId,
  ref: model,
  required,
});
const model = (name, fields, indexes = []) => {
  const s = new Schema(fields, { timestamps: true, strict: "throw" });
  indexes.forEach((i) => s.index(...i));
  return mongoose.model(name, s);
};
export const User = model("User", {
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["admin", "staff"], required: true },
  companyIds: [ref("Company")],
  disabled: { type: Boolean, default: false },
  tokenVersion: { type: Number, default: 0 },
});
export const Company = model("Company", {
  name: { type: String, required: true },
  contact: String,
  email: String,
  phone: String,
  address: String,
  identification: String,
  terms: String,
  defaultRate: Number,
  archived: { type: Boolean, default: false },
  activeLetterhead: ref("LetterheadVersion", false),
  letterheadSequence: { type: Number, default: 0 },
  issuanceSequence: { type: Number, default: 0 },
});
export const LetterheadVersion = model(
  "LetterheadVersion",
  {
    companyId: ref("Company"),
    version: { type: Number, required: true },
    originalName: String,
    mime: String,
    width: Number,
    height: Number,
    orientation: String,
    storageKey: { type: String, required: true, select: false },
    sha256: String,
    layout: Schema.Types.Mixed,
    authorizedBy: ref("User"),
    authorizedAt: Date,
  },
  [[{ companyId: 1, version: 1 }, { unique: true }]],
);
export const Bill = model(
  "Bill",
  {
    number: { type: String, unique: true, required: true },
    companyId: ref("Company"),
    data: Schema.Types.Mixed,
    companySnapshot: Schema.Types.Mixed,
    businessSnapshot: Schema.Types.Mixed,
    letterheadId: ref("LetterheadVersion", false),
    letterheadVersion: Number,
    layout: Schema.Types.Mixed,
    feeCents: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
    totalCents: {
      type: Number,
      required: true,
      min: 0,
      max: 10000000000,
      validate: Number.isSafeInteger,
    },
    paidCents: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
    status: {
      type: String,
      enum: ["draft", "issued", "cancelled"],
      default: "draft",
    },
    pdfKey: { type: String, select: false },
    previewHash: String,
    revision: { type: Number, default: 0 },
    issuedAt: Date,
    createdBy: ref("User"),
    idempotencyKey: { type: String, unique: true },
    requestHash: { type: String, match: /^[a-f0-9]{64}$/ },
    cancelReason: String,
  },
  [[{ companyId: 1, "data.date": -1 }, {}]],
);
export const Payment = model("Payment", {
  billId: ref("Bill"),
  companyId: ref("Company"),
  amountCents: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isSafeInteger,
  },
  date: String,
  reference: String,
  createdBy: ref("User"),
  idempotencyKey: { type: String, unique: true },
  requestHash: { type: String, match: /^[a-f0-9]{64}$/ },
});
export const AuditLog = model("AuditLog", {
  actor: ref("User"),
  action: String,
  entityId: String,
  details: Schema.Types.Mixed,
});
export const Counter = model("Counter", {
  key: { type: String, unique: true },
  value: { type: Number, default: 0 },
});
