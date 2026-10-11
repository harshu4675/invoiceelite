import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";
const app = createApp({
  origin: "http://localhost:5173",
  secret: "test-only-not-used-in-deployment-12345",
  storage: "/tmp/invoiceelite-unit-test",
  businessName: "Test",
  businessAddress: "Test",
});
test("private APIs and files reject unauthenticated access", async () => {
  for (const route of [
    "/companies",
    "/bills",
    "/reports",
    "/reports.csv",
    "/users",
    "/audit",
    "/companies/507f1f77bcf86cd799439011/letterheads/507f1f77bcf86cd799439012/file",
  ]) {
    const r = await request(app).get("/api" + route);
    assert.equal(r.status, 401, route);
    assert.equal(r.headers["cache-control"], "no-store");
  }
});
test("write requests require trusted origin and custom request header", async () => {
  for (const origin of [undefined, "https://evil.example"]) {
    let r = request(app)
      .post("/api/auth/login")
      .send({ email: "a@example.test", password: "x" });
    if (origin) r = r.set("Origin", origin);
    assert.equal((await r).status, 403);
  }
  const r = await request(app)
    .post("/api/auth/login")
    .set("Origin", "http://localhost:5173")
    .send({});
  assert.equal(r.status, 403);
});
test("malformed login input fails before database access", async () => {
  const r = await request(app)
    .post("/api/auth/login")
    .set("Origin", "http://localhost:5173")
    .set("X-Requested-With", "InvoiceElite")
    .send({ email: { $ne: null }, password: "anything" });
  assert.equal(r.status, 400);
});
test("forged JWT cannot authenticate", async () => {
  const r = await request(app)
    .get("/api/companies")
    .set("Cookie", "session=eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.");
  assert.equal(r.status, 401);
});
test("security headers are present and implementation details not exposed", async () => {
  const r = await request(app).get("/api/health");
  assert.equal(r.headers["x-content-type-options"], "nosniff");
  assert.ok(
    r.headers["content-security-policy"].includes("object-src 'self' blob:"),
  );
  assert.equal(r.headers["x-powered-by"], undefined);
});
test("missing deployment secrets fail closed", () => {
  const old = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  assert.throws(() => loadConfig(), /JWT_SECRET/);
  if (old !== undefined) process.env.JWT_SECRET = old;
});
