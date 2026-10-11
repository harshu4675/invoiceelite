import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import request from "supertest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { PDFDocument, rgb } from "pdf-lib";
import { createApp } from "../../server/app.js";
import {
  User,
  Company,
  LetterheadVersion,
  Bill,
  Payment,
  AuditLog,
} from "../../server/models.js";
let repl,
  storage,
  app,
  admin,
  staff,
  companyA,
  companyB,
  version,
  billId,
  previewHash,
  previewRevision,
  issuedBytes;
const origin = "http://localhost:5173";
const post = (agent, route, method = "post") =>
  agent[method]("/api" + route)
    .set("Origin", origin)
    .set("X-Requested-With", "InvoiceElite");
const payload = () => ({
  companyId: companyA._id,
  date: "2026-10-10",
  dueDate: "2026-11-10",
  recipient: companyA.name,
  address: companyA.address,
  description: "Services actually provided",
  reference: "October 2026",
  candidates: 10,
  stipend: 100000,
  establishment: 50000,
  basis: "per_candidate",
  agreedBase: 0,
  rate: 250,
  otherCharges: 0,
  adjustment: 0,
  terms: "30 days",
  notes: "",
  design: "client",
  letterheadId: version._id,
  verified: true,
  authorized: true,
});
before(
  async () => {
    let uri = process.env.TEST_MONGODB_URI;
    if (uri && !/\/invoiceelite_test(?:[?]|$)/.test(uri))
      throw new Error(
        "TEST_MONGODB_URI must use the disposable database invoiceelite_test",
      );
    if (!uri) {
      repl = await MongoMemoryReplSet.create({
        replSet: { count: 1 },
        instanceOpts: [{ dbName: "invoiceelite_test" }],
      });
      uri = repl.getUri("invoiceelite_test");
    }
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
    await mongoose.connection.dropDatabase();
    await Promise.all(
      Object.values(mongoose.models).map((m) => m.createCollection()),
    );
    await Promise.all(
      Object.values(mongoose.models).map((m) => m.syncIndexes()),
    );
    storage = await fs.mkdtemp(path.join(os.tmpdir(), "invoiceelite-tests-"));
    app = createApp({
      origin,
      secret: "test-secret-not-for-production-123456789",
      storage,
      businessName: "Elite Apprenticeship Services",
      businessAddress: "Example address",
    });
    await User.create({
      name: "Test Admin",
      email: "admin@example.test",
      passwordHash: await bcrypt.hash("TestPassword-12345", 4),
      role: "admin",
    });
    admin = request.agent(app);
    let r = await post(admin, "/auth/login").send({
      email: "admin@example.test",
      password: "TestPassword-12345",
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  },
  { timeout: 180000 },
);
after(async () => {
  if (mongoose.connection.readyState) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  if (repl) await repl.stop();
  if (storage) await fs.rm(storage, { recursive: true, force: true });
});
test("full transactional billing and historical preservation workflow", async (t) => {
  await t.test(
    "admin creates companies and scopes staff to one company",
    async () => {
      let r = await post(admin, "/companies").send({
        name: "Example Company A",
        address: "Address A",
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      companyA = r.body;
      r = await post(admin, "/companies").send({
        name: "Example Company B",
        address: "Address B",
      });
      assert.equal(r.status, 201);
      companyB = r.body;
      r = await post(admin, "/users").send({
        name: "Test Staff",
        email: "staff@example.test",
        password: "TestPassword-12345",
        role: "staff",
        companyIds: [companyA._id],
      });
      assert.equal(r.status, 201);
      staff = request.agent(app);
      assert.equal(
        (
          await post(staff, "/auth/login").send({
            email: "staff@example.test",
            password: "TestPassword-12345",
          })
        ).status,
        200,
      );
      const list = await staff.get("/api/companies");
      assert.deepEqual(
        list.body.map((c) => c._id),
        [companyA._id],
      );
      assert.equal(
        (await staff.get(`/api/companies/${companyB._id}/letterheads`)).status,
        403,
      );
      assert.equal(
        (
          await post(staff, "/companies").send({
            name: "Bad",
            address: "Unauthorized",
          })
        ).status,
        403,
      );
    },
  );
  await t.test(
    "authorized single-page letterhead is stored privately and activated",
    async () => {
      const doc = await PDFDocument.create();
      doc.addPage([595, 842]).drawRectangle({
        x: 10,
        y: 10,
        width: 575,
        height: 822,
        borderWidth: 1,
        borderColor: rgb(0.1, 0.2, 0.3),
      });
      const bytes = Buffer.from(await doc.save());
      let r = await post(admin, `/companies/${companyA._id}/letterheads`)
        .field("authorized", "false")
        .attach("file", bytes, "stationery.pdf");
      assert.equal(r.status, 400);
      r = await post(admin, `/companies/${companyA._id}/letterheads`)
        .field("authorized", "true")
        .attach("file", Buffer.from("bad file"), "forged.pdf");
      assert.equal(r.status, 400);
      r = await post(admin, `/companies/${companyA._id}/letterheads`)
        .field("authorized", "true")
        .attach("file", bytes, "stationery.pdf");
      assert.equal(r.status, 201, JSON.stringify(r.body));
      version = r.body;
      assert.equal(version.storageKey, undefined);
      assert.equal(version.version, 1);
      assert.equal(
        (
          await post(
            admin,
            `/companies/${companyA._id}/letterheads/${version._id}/activate`,
          ).send({ authorized: true })
        ).status,
        200,
      );
      assert.equal(
        (
          await admin.get(
            `/api/companies/${companyB._id}/letterheads/${version._id}/file`,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await staff.get(
            `/api/companies/${companyB._id}/letterheads/${version._id}/file`,
          )
        ).status,
        403,
      );
    },
  );
  await t.test(
    "draft validation, idempotent creation, actual preview and issuance",
    async () => {
      const key = crypto.randomUUID();
      let r = await post(staff, "/bills")
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ ...payload(), companyId: companyB._id });
      assert.equal(r.status, 403);
      r = await post(admin, "/bills")
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ ...payload(), companyId: companyB._id });
      assert.equal(r.status, 400);
      r = await post(staff, "/bills")
        .set("Idempotency-Key", key)
        .send(payload());
      assert.equal(r.status, 201, JSON.stringify(r.body));
      billId = r.body._id;
      assert.equal(r.body.totalCents, 250000);
      r = await post(staff, "/bills")
        .set("Idempotency-Key", key)
        .send(payload());
      assert.equal(r.body._id, billId);
      assert.equal(await Bill.countDocuments(), 1);
      assert.equal(
        (
          await post(staff, "/bills")
            .set("Idempotency-Key", key)
            .send({ ...payload(), rate: 251 })
        ).status,
        409,
      );
      const draft = (await staff.get(`/api/bills/${billId}`)).body;
      assert.equal(
        (await post(staff, `/bills/${billId}`, "put").send(payload())).status,
        428,
      );
      assert.equal(
        (
          await post(staff, `/bills/${billId}`, "put")
            .set("If-Match", `"${draft.revision}"`)
            .send(payload())
        ).status,
        200,
      );
      assert.equal(
        (
          await post(staff, `/bills/${billId}`, "put")
            .set("If-Match", `"${draft.revision}"`)
            .send({ ...payload(), notes: "Stale editor" })
        ).status,
        409,
      );
      assert.equal(
        (
          await post(staff, `/bills/${billId}/issue`).send({
            previewHash: "invented",
          })
        ).status,
        409,
      );
      r = await post(staff, `/bills/${billId}/preview`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      previewHash = r.body.hash;
      previewRevision = r.body.revision;
      const preview = await staff
        .get(`/api/bills/${billId}/pdf`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      assert.equal(
        (await staff.get(`/api/bills/${billId}/pdf?v=wrong-digest`)).status,
        409,
      );
      assert.equal(
        (
          await post(staff, `/bills/${billId}/issue`).send({
            previewHash,
            previewRevision: previewRevision - 1,
          })
        ).status,
        409,
      );
      // Deactivation must block issuance without changing any existing snapshot.
      assert.equal(
        (await post(admin, `/companies/${companyA._id}/letterhead`, "delete"))
          .status,
        200,
      );
      assert.equal(
        (
          await post(staff, `/bills/${billId}/issue`).send({
            previewHash,
            previewRevision,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await post(
            admin,
            `/companies/${companyA._id}/letterheads/${version._id}/activate`,
          ).send({ authorized: true })
        ).status,
        200,
      );
      issuedBytes = preview.body;
      assert.equal(
        crypto.createHash("sha256").update(issuedBytes).digest("hex"),
        previewHash,
      );
      assert.equal(
        (
          await post(staff, `/bills/${billId}/issue`).send({
            previewHash,
            previewRevision,
          })
        ).status,
        200,
      );
    },
  );
  await t.test(
    "company updates and layout replacements do not mutate an issued bill or PDF",
    async () => {
      const before = await Bill.findById(billId).lean();
      assert.equal(
        (
          await post(admin, `/companies/${companyA._id}`, "put").send({
            name: "Changed Company Name",
            address: "Changed address",
          })
        ).status,
        200,
      );
      let r = await post(
        admin,
        `/companies/${companyA._id}/letterheads/${version._id}/layout`,
      ).send({ ...version.layout, top: 160 });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.version, 2);
      assert.equal(
        (
          await post(
            admin,
            `/companies/${companyA._id}/letterheads/${r.body._id}/activate`,
          ).send({ authorized: true })
        ).status,
        200,
      );
      assert.equal(
        (
          await post(admin, `/bills/${billId}`, "put").send({
            ...payload(),
            rate: 9999,
          })
        ).status,
        409,
      );
      assert.equal((await post(admin, `/bills/${billId}/preview`)).status, 409);
      const after = await Bill.findById(billId).lean();
      assert.deepEqual(after.data, before.data);
      assert.deepEqual(after.companySnapshot, before.companySnapshot);
      assert.deepEqual(after.layout, before.layout);
      assert.equal(String(after.letterheadId), version._id);
      const pdf = await admin
        .get(`/api/bills/${billId}/pdf`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      assert.deepEqual(pdf.body, issuedBytes);
      const saved = await Bill.findById(billId).select("+pdfKey");
      await fs.writeFile(
        path.join(storage, saved.pdfKey),
        Buffer.from("corrupt bytes"),
      );
      assert.equal((await admin.get(`/api/bills/${billId}/pdf`)).status, 409);
      await fs.writeFile(path.join(storage, saved.pdfKey), issuedBytes);
    },
  );
  await t.test(
    "payments are idempotent, cannot overpay, reconcile reports, and preserve the original PDF",
    async () => {
      const key = crypto.randomUUID();
      let r = await post(staff, `/bills/${billId}/payments`)
        .set("Idempotency-Key", key)
        .send({ amount: 1000, date: "2026-10-10", reference: "Test payment" });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      r = await post(staff, `/bills/${billId}/payments`)
        .set("Idempotency-Key", key)
        .send({ amount: 1000, date: "2026-10-10", reference: "Test payment" });
      assert.equal(r.status, 201);
      assert.equal(await Payment.countDocuments(), 1);
      assert.equal(
        (
          await post(staff, `/bills/${billId}/payments`)
            .set("Idempotency-Key", key)
            .send({
              amount: 999,
              date: "2026-10-10",
              reference: "Changed amount",
            })
        ).status,
        409,
      );
      assert.equal(
        (await staff.get(`/api/bills/${billId}`)).body.displayStatus,
        "partially paid",
      );
      assert.equal(
        (
          await post(admin, `/bills/${billId}/cancel`).send({
            reason: "Attempt paid cancellation",
          })
        ).status,
        409,
      );
      r = await post(staff, `/bills/${billId}/payments`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ amount: 1600, date: "2026-10-11", reference: "Overpayment" });
      assert.equal(r.status, 409);
      const results = await Promise.all(
        [1, 2].map(() =>
          post(staff, `/bills/${billId}/payments`)
            .set("Idempotency-Key", crypto.randomUUID())
            .send({
              amount: 1500,
              date: "2026-10-11",
              reference: "Concurrent settlement",
            }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      assert.equal(
        (await staff.get(`/api/bills/${billId}`)).body.displayStatus,
        "paid",
      );
      const report = await staff.get("/api/reports");
      assert.equal(report.body.collectedCents, 250000);
      assert.equal(report.body.outstandingCents, 0);
      assert.equal((await Bill.findById(billId)).previewHash, previewHash);
      assert.equal((await staff.get("/api/reports.csv")).status, 200);
      assert.ok(await AuditLog.countDocuments({ action: "bill.issue" }));
      assert.equal(
        await AuditLog.countDocuments({ action: "payment.create" }),
        2,
      );
    },
  );
  await t.test(
    "password changes verify current credentials and revoke all old sessions",
    async () => {
      let login = await post(admin, "/auth/login").send({
        email: "admin@example.test",
        password: "TestPassword-12345",
      });
      const cookie = login.headers["set-cookie"][0].split(";")[0];
      assert.equal(
        (
          await post(admin, "/auth/password").send({
            currentPassword: "wrong-password",
            newPassword: "ChangedPassword-98765",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await post(admin, "/auth/password").send({
            currentPassword: "TestPassword-12345",
            newPassword: "ChangedPassword-98765",
          })
        ).status,
        200,
      );
      assert.equal(
        (await request(app).get("/api/auth/me").set("Cookie", cookie)).status,
        401,
      );
      assert.equal(
        (
          await post(admin, "/auth/login").send({
            email: "admin@example.test",
            password: "ChangedPassword-98765",
          })
        ).status,
        200,
      );
    },
  );
  await t.test(
    "logout invalidates even a previously copied JWT cookie",
    async () => {
      const r = await post(staff, "/auth/login").send({
        email: "staff@example.test",
        password: "TestPassword-12345",
      });
      const cookie = r.headers["set-cookie"][0].split(";")[0];
      assert.equal((await post(staff, "/auth/logout")).status, 200);
      assert.equal(
        (await request(app).get("/api/bills").set("Cookie", cookie)).status,
        401,
      );
    },
  );
});
