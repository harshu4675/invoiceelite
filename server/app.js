import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { z, ZodError } from "zod";
import {
  User,
  Company,
  LetterheadVersion,
  Bill,
  Payment,
  AuditLog,
  Counter,
} from "./models.js";
import {
  companyInput,
  billInput,
  layoutInput,
  defaultLayout,
  calculate,
  canAccess,
  assertLetterhead,
  assertMutable,
  paymentStatus,
  money,
  businessDate,
  passwordInput,
} from "../shared/domain.js";
import { validateLayout } from "./pdf.js";
import { inspectUpload, generatePDF } from "./pdf-jobs.js";
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const id = (v) => {
  if (!mongoose.isValidObjectId(v) || !/^[a-f\d]{24}$/i.test(v))
    fail(400, "Invalid record ID");
  return v;
};
const tokenKey = z.string().uuid();
const dummyPasswordHash = await bcrypt.hash(
  crypto.randomBytes(32).toString("hex"),
  12,
);
import {
  digest as hash,
  requestDigest,
  assertIdempotent,
  assertDraftRevision,
  assertPreviewReceipt,
  assertIssuableCompany,
  assertFileIntegrity,
} from "./integrity.js";
export function createApp(config) {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "blob:", "data:"],
          frameSrc: ["'self'", "blob:"],
          objectSrc: ["'self'", "blob:"],
          frameAncestors: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use("/api", rateLimit({ windowMs: 60000, limit: 240 }));
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (req.body === undefined) req.body = {};
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      if (
        origin !== config.origin ||
        req.headers["x-requested-with"] !== "InvoiceElite"
      )
        return res.status(403).json({ error: "Untrusted request origin" });
    }
    next();
  });
  const audit = async (actor, action, entityId, details = {}, session = null) =>
    AuditLog.create([{ actor, action, entityId: String(entityId), details }], {
      session,
    });
  const transaction = async (fn) => mongoose.connection.transaction(fn);
  const storage = async (key) => {
    if (!/^[a-f0-9-]+\.(pdf|bin)$/.test(key))
      fail(400, "Invalid stored file reference");
    return path.join(config.storage, key);
  };
  const save = async (bytes, ext = "bin") => {
    const key = `${crypto.randomUUID()}.${ext}`;
    await fs.mkdir(config.storage, { recursive: true, mode: 0o700 });
    await fs.writeFile(await storage(key), bytes, { flag: "wx", mode: 0o600 });
    return key;
  };
  const remove = async (key) => {
    if (key) await fs.unlink(await storage(key)).catch(() => {});
  };
  const sessionCookie = {
    httpOnly: true,
    secure: config.production || config.origin.startsWith("https:"),
    sameSite: "strict",
    path: "/api",
    maxAge: 8 * 3600000,
  };
  app.get("/api/health", (_, res) =>
    res
      .status(mongoose.connection.readyState === 1 ? 200 : 503)
      .json({ ok: mongoose.connection.readyState === 1 }),
  );
  app.post(
    "/api/auth/login",
    rateLimit({ windowMs: 15 * 60000, limit: 20 }),
    async (req, res) => {
      const input = z
        .object({ email: z.string().email(), password: z.string().max(200) })
        .parse(req.body);
      const user = await User.findOne({
        email: input.email.toLowerCase(),
        disabled: false,
      }).select("+passwordHash");
      // Always perform a bcrypt comparison to avoid a cheap user-existence timing signal.
      const validPassword = await bcrypt.compare(
        input.password,
        user?.passwordHash || dummyPasswordHash,
      );
      if (!user || !validPassword) fail(401, "Invalid email or password");
      res.cookie(
        "session",
        jwt.sign(
          { sub: String(user._id), version: user.tokenVersion },
          config.secret,
          { expiresIn: "8h", issuer: "invoiceelite", audience: "invoiceelite" },
        ),
        sessionCookie,
      );
      res.json({ user: { _id: user._id, name: user.name, role: user.role } });
    },
  );
  app.use("/api", async (req, res, next) => {
    let decoded;
    try {
      decoded = jwt.verify(req.cookies.session, config.secret, {
        issuer: "invoiceelite",
        audience: "invoiceelite",
        algorithms: ["HS256"],
      });
      if (
        typeof decoded.sub !== "string" ||
        !/^[a-f\d]{24}$/i.test(decoded.sub)
      )
        throw new Error("Invalid session");
    } catch {
      return res.status(401).json({ error: "Sign in required" });
    }
    // Database failures are server errors, not invalid passwords or expired sessions.
    const user = await User.findById(decoded.sub);
    if (!user || user.disabled || decoded.version !== user.tokenVersion)
      return res.status(401).json({ error: "Sign in required" });
    req.user = user;
    next();
  });
  const admin = (req, res, next) =>
    req.user.role === "admin"
      ? next()
      : res.status(403).json({ error: "Administrator permission required" });
  const scope = (user) =>
    user.role === "admin" ? {} : { companyId: { $in: user.companyIds } };
  const company = async (req, companyId) => {
    id(companyId);
    if (!canAccess(req.user, companyId)) fail(403, "Company access denied");
    const c = await Company.findById(companyId);
    if (!c) fail(404, "Company not found");
    return c;
  };
  const bill = async (req, billId) => {
    const b = await Bill.findById(id(billId)).select("+pdfKey");
    if (!b) fail(404, "Bill not found");
    await company(req, b.companyId.toString());
    return b;
  };
  const lh = async (req, companyId, letterheadId) => {
    await company(req, companyId);
    const v = await LetterheadVersion.findById(id(letterheadId)).select(
      "+storageKey",
    );
    assertLetterhead(companyId, v);
    return v;
  };
  const meta = (v) => {
    const o = v.toObject();
    delete o.storageKey;
    return o;
  };
  app.get("/api/auth/me", (req, res) =>
    res.json({
      user: { _id: req.user._id, name: req.user.name, role: req.user.role },
    }),
  );
  app.post("/api/auth/logout", async (req, res) => {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    res.clearCookie("session", sessionCookie);
    res.json({ ok: true });
  });
  app.post(
    "/api/auth/password",
    rateLimit({ windowMs: 15 * 60000, limit: 10 }),
    async (req, res) => {
      const input = z
        .object({
          currentPassword: z.string().min(1).max(200),
          newPassword: passwordInput,
        })
        .parse(req.body);
      const user = await User.findById(req.user._id).select("+passwordHash");
      if (
        !user ||
        !(await bcrypt.compare(input.currentPassword, user.passwordHash))
      )
        fail(400, "Current password is incorrect");
      if (await bcrypt.compare(input.newPassword, user.passwordHash))
        fail(400, "Choose a different new password");
      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await transaction(async (session) => {
        const changed = await User.updateOne(
          {
            _id: user._id,
            passwordHash: user.passwordHash,
            tokenVersion: req.user.tokenVersion,
          },
          { $set: { passwordHash }, $inc: { tokenVersion: 1 } },
          { session },
        );
        if (!changed.modifiedCount)
          fail(
            409,
            "Your account changed. Sign in again before changing the password.",
          );
        await audit(req.user._id, "user.passwordChange", user._id, {}, session);
      });
      res.clearCookie("session", sessionCookie);
      res.json({ ok: true });
    },
  );
  app.get("/api/users", admin, async (req, res) =>
    res.json(await User.find().select("name email role companyIds disabled")),
  );
  app.post("/api/users", admin, async (req, res) => {
    const v = z
      .object({
        name: z.string().min(2).max(100),
        email: z.string().email(),
        password: passwordInput,
        role: z.enum(["admin", "staff"]),
        companyIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(500),
      })
      .parse(req.body);
    if (
      (await Company.countDocuments({ _id: { $in: v.companyIds } })) !==
      new Set(v.companyIds).size
    )
      fail(400, "Unknown company assignment");
    const { password, ...rest } = v;
    let u;
    await transaction(async (session) => {
      [u] = await User.create(
        [{ ...rest, passwordHash: await bcrypt.hash(password, 12) }],
        { session },
      );
      await audit(req.user._id, "user.create", u._id, {}, session);
    });
    res.status(201).json({ _id: u._id });
  });
  app.patch("/api/users/:id", admin, async (req, res) => {
    const v = z
      .object({
        companyIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)),
        disabled: z.boolean(),
      })
      .parse(req.body);
    if (req.params.id === String(req.user._id))
      fail(400, "Cannot change your own access");
    if (
      (await Company.countDocuments({ _id: { $in: v.companyIds } })) !==
      new Set(v.companyIds).size
    )
      fail(400, "Unknown company assignment");
    await transaction(async (session) => {
      const u = await User.findByIdAndUpdate(
        id(req.params.id),
        { $set: v, $inc: { tokenVersion: 1 } },
        { session, new: true },
      );
      if (!u) fail(404, "User not found");
      await audit(req.user._id, "user.access", u._id, {}, session);
    });
    res.json({ ok: true });
  });
  app.get("/api/companies", async (req, res) =>
    res.json(
      await Company.find(
        req.user.role === "admin" ? {} : { _id: { $in: req.user.companyIds } },
      ).sort({ name: 1 }),
    ),
  );
  app.get("/api/companies/:id", async (req, res) =>
    res.json(await company(req, req.params.id)),
  );
  app.post("/api/companies", admin, async (req, res) => {
    let c;
    await transaction(async (session) => {
      [c] = await Company.create([companyInput.parse(req.body)], { session });
      await audit(req.user._id, "company.create", c._id, {}, session);
    });
    res.status(201).json(c);
  });
  app.put("/api/companies/:id", admin, async (req, res) => {
    const c = await company(req, req.params.id);
    const v = companyInput.parse(req.body);
    await transaction(async (session) => {
      await Company.updateOne({ _id: c._id }, v, { session });
      await audit(req.user._id, "company.update", c._id, {}, session);
    });
    res.json(await Company.findById(c._id));
  });
  app.get("/api/companies/:id/letterheads", async (req, res) => {
    await company(req, req.params.id);
    res.json(
      await LetterheadVersion.find({ companyId: req.params.id }).sort({
        version: -1,
      }),
    );
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2 },
  });
  app.post(
    "/api/companies/:id/letterheads",
    admin,
    rateLimit({ windowMs: 15 * 60000, limit: 30 }),
    upload.single("file"),
    async (req, res) => {
      const c = await company(req, req.params.id);
      if (req.body.authorized !== "true")
        fail(400, "Confirm authority to use this company letterhead");
      if (!req.file) fail(400, "Select a PDF, PNG or JPG file");
      let info;
      let initialLayout;
      try {
        info = await inspectUpload(req.file.buffer);
        initialLayout = {
          ...defaultLayout,
          top: Math.min(145, Math.round(info.height * 0.17)),
          bottom: Math.min(90, Math.round(info.height * 0.1)),
          left: Math.min(45, Math.round(info.width * 0.075)),
          right: Math.min(45, Math.round(info.width * 0.075)),
        };
        validateLayout(initialLayout, info.width, info.height);
      } catch (e) {
        fail(400, e.message);
      }
      const key = await save(req.file.buffer);
      let record;
      try {
        await transaction(async (session) => {
          const updated = await Company.findByIdAndUpdate(
            c._id,
            { $inc: { letterheadSequence: 1 } },
            { new: true, session },
          );
          [record] = await LetterheadVersion.create(
            [
              {
                companyId: c._id,
                version: updated.letterheadSequence,
                originalName: path
                  .basename(req.file.originalname)
                  .replace(/[^a-zA-Z0-9._ -]/g, "_")
                  .slice(0, 120),
                ...info,
                storageKey: key,
                sha256: hash(req.file.buffer),
                layout: initialLayout,
                authorizedBy: req.user._id,
                authorizedAt: new Date(),
              },
            ],
            { session },
          );
          await audit(
            req.user._id,
            "letterhead.upload",
            record._id,
            {},
            session,
          );
        });
      } catch (e) {
        await remove(key);
        throw e;
      }
      res.status(201).json(meta(record));
    },
  );
  app.get("/api/companies/:id/letterheads/:version/file", async (req, res) => {
    const v = await lh(req, req.params.id, req.params.version);
    res.set({
      "Content-Type": v.mime,
      "Content-Disposition":
        'inline; filename="letterhead.' +
        (v.mime === "application/pdf"
          ? "pdf"
          : v.mime === "image/png"
            ? "png"
            : "jpg") +
        '"',
      "X-Content-Type-Options": "nosniff",
    });
    const bytes = await fs.readFile(await storage(v.storageKey));
    assertFileIntegrity(bytes, v.sha256);
    res.send(bytes);
  });
  app.post(
    "/api/companies/:id/letterheads/:version/activate",
    admin,
    async (req, res) => {
      const v = await lh(req, req.params.id, req.params.version);
      if (req.body.authorized !== true)
        fail(400, "Authorization confirmation is required");
      await transaction(async (session) => {
        await Company.updateOne(
          { _id: req.params.id },
          { $set: { activeLetterhead: v._id } },
          { session },
        );
        await audit(req.user._id, "letterhead.activate", v._id, {}, session);
      });
      res.json({ ok: true });
    },
  );
  app.delete("/api/companies/:id/letterhead", admin, async (req, res) => {
    await company(req, req.params.id);
    await transaction(async (session) => {
      await Company.updateOne(
        { _id: req.params.id },
        { $unset: { activeLetterhead: 1 } },
        { session },
      );
      await audit(
        req.user._id,
        "letterhead.deactivate",
        req.params.id,
        {},
        session,
      );
    });
    res.json({ ok: true });
  });
  app.post(
    "/api/companies/:id/letterheads/:version/layout",
    admin,
    async (req, res) => {
      const v = await lh(req, req.params.id, req.params.version);
      const layout = layoutInput.parse(req.body);
      try {
        validateLayout(layout, v.width, v.height);
      } catch (e) {
        fail(400, e.message);
      }
      let result;
      await transaction(async (session) => {
        const c = await Company.findByIdAndUpdate(
          req.params.id,
          { $inc: { letterheadSequence: 1 } },
          { new: true, session },
        );
        const { _id, createdAt, updatedAt, __v, ...base } = v.toObject();
        [result] = await LetterheadVersion.create(
          [
            {
              ...base,
              layout,
              version: c.letterheadSequence,
              authorizedBy: req.user._id,
              authorizedAt: new Date(),
            },
          ],
          { session },
        );
        await audit(
          req.user._id,
          "letterhead.layoutVersion",
          result._id,
          {},
          session,
        );
      });
      res.status(201).json(meta(result));
    },
  );
  const business = () => ({
    name: config.businessName,
    address: config.businessAddress,
  });
  const snapshot = async (req, input) => {
    const data = billInput.parse(input);
    const c = await company(req, data.companyId);
    if (c.archived) fail(400, "Archived companies cannot receive new bills");
    let v = null;
    if (data.design === "client") {
      if (!data.authorized)
        fail(400, "Confirm permission to use client stationery");
      if (!data.letterheadId) fail(400, "Select an active letterhead");
      v = await lh(req, data.companyId, data.letterheadId);
      if (String(c.activeLetterhead) !== String(v._id))
        fail(
          409,
          "Company letterhead changed. Select the current active version.",
        );
    } else if (data.letterheadId)
      fail(400, "Non-client designs cannot reference a client letterhead");
    return {
      companyId: c._id,
      data,
      companySnapshot: companyInput.parse(c.toObject()),
      businessSnapshot: business(),
      letterheadId: v?._id || null,
      letterheadVersion: v?.version || null,
      layout: v?.layout || defaultLayout,
      ...calculate(data),
    };
  };
  const pdf = async (b) => {
    let background;
    if (b.letterheadId) {
      const v = await LetterheadVersion.findById(b.letterheadId).select(
        "+storageKey",
      );
      assertLetterhead(b.companyId, v);
      const bytes = await fs.readFile(await storage(v.storageKey));
      assertFileIntegrity(bytes, v.sha256);
      background = {
        ...v.toObject(),
        bytes,
      };
    }
    return generatePDF(b, background);
  };
  app.post("/api/invoices/preview", async (req, res) => {
    const b = await snapshot(req, req.body);
    res.type("pdf").send(await pdf({ ...b, number: "DRAFT - NOT ISSUED" }));
  });
  app.post(
    "/api/companies/:id/letterheads/:version/preview",
    admin,
    async (req, res) => {
      const v = await lh(req, req.params.id, req.params.version);
      const layout = layoutInput.parse(req.body);
      try {
        validateLayout(layout, v.width, v.height);
      } catch (e) {
        fail(400, e.message);
      }
      const bytes = await fs.readFile(await storage(v.storageKey));
      assertFileIntegrity(bytes, v.sha256);
      const c = await Company.findById(req.params.id);
      const data = {
        date: businessDate(),
        dueDate: businessDate(new Date(Date.now() + 30 * 86400000)),
        recipient: c.name,
        address: c.address,
        description:
          "Apprenticeship registration and administrative services actually provided",
        candidates: 25,
        stipend: 150000,
        establishment: 100000,
        basis: "fixed",
        agreedBase: 0,
        rate: 5000,
        otherCharges: 0,
        adjustment: 0,
        terms: c.terms,
        notes: "Layout preview only - not a bill",
        design: "client",
      };
      res.type("pdf").send(
        await generatePDF(
          {
            number: "LAYOUT PREVIEW",
            data,
            companySnapshot: c,
            businessSnapshot: business(),
            layout,
            ...calculate(data),
          },
          {
            ...v.toObject(),
            bytes,
          },
        ),
      );
    },
  );
  app.post("/api/bills", async (req, res) => {
    const key = tokenKey.parse(req.headers["idempotency-key"]);
    const normalized = billInput.parse(req.body);
    const requestHash = requestDigest(normalized);
    const existing = await Bill.findOne({ idempotencyKey: key });
    if (existing) {
      await company(req, String(existing.companyId));
      assertIdempotent(existing, requestHash, req.user._id);
      return res.json(existing);
    }
    const s = await snapshot(req, req.body);
    let b;
    await transaction(async (session) => {
      const n = await Counter.findOneAndUpdate(
        { key: "bill" },
        { $inc: { value: 1 } },
        { new: true, upsert: true, session },
      );
      [b] = await Bill.create(
        [
          {
            ...s,
            number: `EAS-${String(n.value).padStart(6, "0")}`,
            createdBy: req.user._id,
            idempotencyKey: key,
            requestHash,
          },
        ],
        { session },
      );
      await audit(req.user._id, "bill.create", b._id, {}, session);
    });
    res.status(201).json(b);
  });
  app.put("/api/bills/:id", async (req, res) => {
    const b = await bill(req, req.params.id);
    assertMutable(b);
    assertDraftRevision(req.headers["if-match"], b.revision);
    const s = await snapshot(req, req.body);
    if (String(s.companyId) !== String(b.companyId))
      fail(400, "Create a new draft to change company");
    await transaction(async (session) => {
      const r = await Bill.updateOne(
        { _id: b._id, status: "draft", revision: b.revision },
        {
          $set: { ...s },
          $unset: { pdfKey: 1, previewHash: 1 },
          $inc: { revision: 1 },
        },
        { session },
      );
      if (!r.modifiedCount) fail(409, "Bill changed. Reload before editing");
      await audit(req.user._id, "bill.edit", b._id, {}, session);
    });
    await remove(b.pdfKey);
    res.json({ ok: true, revision: b.revision + 1 });
  });
  app.post("/api/bills/:id/preview", async (req, res) => {
    const b = await bill(req, req.params.id);
    assertMutable(b);
    const bytes = await pdf(b);
    const key = await save(bytes, "pdf");
    const digest = hash(bytes);
    const r = await Bill.updateOne(
      { _id: b._id, status: "draft", revision: b.revision },
      { $set: { pdfKey: key, previewHash: digest }, $inc: { revision: 1 } },
    );
    if (!r.modifiedCount) {
      await remove(key);
      fail(409, "Draft changed. Preview again");
    }
    await remove(b.pdfKey);
    res.json({
      hash: digest,
      revision: b.revision + 1,
      url: `/api/bills/${b._id}/pdf`,
    });
  });
  app.post("/api/bills/:id/issue", async (req, res) => {
    const b = await bill(req, req.params.id);
    assertMutable(b);
    if (!b.data.verified)
      fail(
        400,
        "Verify that the fee arrangement is permitted under the applicable scheme",
      );
    assertPreviewReceipt(b, req.body);
    const previewBytes = await fs.readFile(await storage(b.pdfKey));
    assertFileIntegrity(previewBytes, b.previewHash);
    if (b.data.design === "client" && !b.data.authorized)
      fail(400, "Letterhead authorization is required");
    await transaction(async (session) => {
      // Writing the company document serializes issuance with archive/letterhead changes.
      const currentCompany = await Company.findByIdAndUpdate(
        b.companyId,
        { $inc: { issuanceSequence: 1 } },
        { new: true, session },
      );
      assertIssuableCompany(b, currentCompany);
      const r = await Bill.updateOne(
        {
          _id: b._id,
          status: "draft",
          revision: b.revision,
          previewHash: req.body.previewHash,
        },
        {
          $set: { status: "issued", issuedAt: new Date() },
          $inc: { revision: 1 },
        },
        { session },
      );
      if (!r.modifiedCount) fail(409, "Bill changed. Reload");
      await audit(
        req.user._id,
        "bill.issue",
        b._id,
        { pdfHash: b.previewHash },
        session,
      );
    });
    res.json({ ok: true });
  });
  app.post("/api/bills/:id/cancel", admin, async (req, res) => {
    const b = await bill(req, req.params.id);
    const reason = z.string().min(5).max(500).parse(req.body.reason);
    await transaction(async (session) => {
      const r = await Bill.updateOne(
        { _id: b._id, paidCents: 0, status: { $ne: "cancelled" } },
        {
          $set: { status: "cancelled", cancelReason: reason },
          $inc: { revision: 1 },
        },
        { session },
      );
      if (!r.modifiedCount)
        fail(409, "Paid or already cancelled bills cannot be cancelled");
      await audit(req.user._id, "bill.cancel", b._id, { reason }, session);
    });
    res.json({ ok: true });
  });
  app.get("/api/bills/:id/pdf", async (req, res) => {
    const b = await bill(req, req.params.id);
    if (!b.pdfKey) fail(404, "Generate a preview first");
    if (req.query.v !== undefined && req.query.v !== b.previewHash)
      fail(
        409,
        "That preview is no longer current. Return to the bill and generate a fresh preview.",
      );
    const bytes = await fs.readFile(await storage(b.pdfKey));
    assertFileIntegrity(bytes, b.previewHash);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `${req.query.download === "1" ? "attachment" : "inline"}; filename="${b.number}.pdf"`,
    });
    res.send(bytes);
  });
  app.get("/api/bills/:id", async (req, res) => {
    const b = await bill(req, req.params.id);
    const result = b.toObject();
    delete result.pdfKey;
    res.set("ETag", `"${b.revision}"`);
    res.json({
      ...result,
      displayStatus: paymentStatus(b),
      payments: await Payment.find({ billId: b._id }).sort({ date: -1 }),
    });
  });
  app.post("/api/bills/:id/payments", async (req, res) => {
    const b = await bill(req, req.params.id);
    const key = tokenKey.parse(req.headers["idempotency-key"]);
    const v = z
      .object({
        amount: money.refine((n) => n > 0),
        date: z.string().date(),
        reference: z.string().min(1).max(160),
      })
      .parse(req.body);
    const cents = Math.round(v.amount * 100);
    const requestHash = requestDigest({ ...v, billId: String(b._id) });
    let payment;
    await transaction(async (session) => {
      payment = await Payment.findOne({ idempotencyKey: key }).session(session);
      if (payment) {
        if (String(payment.billId) !== String(b._id))
          fail(409, "Payment key already used");
        assertIdempotent(payment, requestHash, req.user._id);
        return;
      }
      const updated = await Bill.findOneAndUpdate(
        {
          _id: b._id,
          status: "issued",
          paidCents: { $lte: b.totalCents - cents },
        },
        { $inc: { paidCents: cents, revision: 1 } },
        { new: true, session },
      );
      if (!updated)
        fail(409, "Payment exceeds outstanding balance or bill is not issued");
      [payment] = await Payment.create(
        [
          {
            billId: b._id,
            companyId: b.companyId,
            amountCents: cents,
            date: v.date,
            reference: v.reference,
            createdBy: req.user._id,
            idempotencyKey: key,
            requestHash,
          },
        ],
        { session },
      );
      await audit(req.user._id, "payment.create", payment._id, {}, session);
    });
    res.status(201).json(payment);
  });
  async function report(req) {
    const q = z
      .object({
        search: z.string().max(120).optional(),
        from: z.string().date().optional(),
        to: z.string().date().optional(),
        status: z
          .enum([
            "draft",
            "issued",
            "paid",
            "partially paid",
            "overdue",
            "cancelled",
          ])
          .optional(),
        companyId: z
          .string()
          .regex(/^[a-f\d]{24}$/i)
          .optional(),
      })
      .parse(req.query);
    if (q.from && q.to && q.from > q.to)
      fail(400, "Report start date must not be after end date");
    const filter = scope(req.user);
    if (q.companyId) {
      await company(req, q.companyId);
      filter.companyId = q.companyId;
    }
    if (q.from || q.to)
      filter["data.date"] = {
        ...(q.from ? { $gte: q.from } : {}),
        ...(q.to ? { $lte: q.to } : {}),
      };
    if (q.search) {
      const escaped = q.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { number: { $regex: escaped, $options: "i" } },
        { "companySnapshot.name": { $regex: escaped, $options: "i" } },
      ];
    }
    const count = await Bill.countDocuments(filter);
    if (count > 10000)
      fail(400, "Narrow the date range to fewer than 10,000 bills");
    const rows = (await Bill.find(filter).sort({ createdAt: -1 }).lean())
      .map((b) => ({
        ...b,
        displayStatus: paymentStatus(b),
        outstandingCents: ["draft", "cancelled"].includes(b.status)
          ? 0
          : b.totalCents - b.paidCents,
      }))
      .filter((b) => !q.status || b.displayStatus === q.status);
    return rows;
  }
  app.get("/api/bills", async (req, res) => res.json(await report(req)));
  app.get("/api/reports", async (req, res) => {
    const rows = await report(req);
    const issued = rows.filter((b) => b.status === "issued");
    const companies = {};
    issued.forEach((b) => {
      const key = String(b.companyId);
      companies[key] ??= {
        name: b.companySnapshot.name,
        billedCents: 0,
        collectedCents: 0,
        outstandingCents: 0,
      };
      companies[key].billedCents += b.totalCents;
      companies[key].collectedCents += b.paidCents;
      companies[key].outstandingCents += b.outstandingCents;
    });
    res.json({
      totalBills: rows.length,
      paidBills: issued.filter((b) => b.displayStatus === "paid").length,
      serviceCents: issued.reduce((s, b) => s + b.feeCents, 0),
      collectedCents: issued.reduce((s, b) => s + b.paidCents, 0),
      outstandingCents: issued.reduce((s, b) => s + b.outstandingCents, 0),
      companies: Object.values(companies),
      recent: rows.slice(0, 6),
    });
  });
  app.get("/api/reports.csv", async (req, res) => {
    const rows = await report(req);
    const cell = (v) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    res
      .attachment("invoiceelite-report.csv")
      .type("text/csv")
      .send(
        [
          [
            "Bill",
            "Company",
            "Date",
            "Status",
            "Service fee INR",
            "Total INR",
            "Collected INR",
            "Outstanding INR",
          ],
          ...rows.map((b) => [
            b.number,
            b.companySnapshot.name,
            b.data.date,
            b.displayStatus,
            b.feeCents / 100,
            b.totalCents / 100,
            b.paidCents / 100,
            b.outstandingCents / 100,
          ]),
        ]
          .map((row) => row.map(cell).join(","))
          .join("\r\n"),
      );
  });
  app.get("/api/audit", admin, async (req, res) =>
    res.json(
      await AuditLog.find()
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("actor", "name"),
    ),
  );
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API endpoint not found" }),
  );
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    let status = err.status || 500;
    let message = err.message;
    if (err instanceof ZodError) {
      status = 400;
      message = err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    }
    if (err instanceof multer.MulterError) {
      status = 400;
      message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Maximum upload size is 10 MB"
          : "Invalid upload";
    }
    if (err.code === 11000) {
      status = 409;
      message =
        "Duplicate record or request. Refresh to check whether it was saved.";
    }
    if (status >= 500) {
      console.error("Request failed:", err.name, err.code || "internal");
      message =
        "The operation could not be completed. Please retry or contact your administrator.";
    }
    res.status(status).json({ error: message });
  });
  return app;
}
