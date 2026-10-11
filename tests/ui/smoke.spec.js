import { test, expect } from "@playwright/test";
// These tests isolate the real React UI with API fixtures. They are NOT database integration tests.
const company = {
  _id: "507f1f77bcf86cd799439011",
  name: "Example Engineering",
  address: "Example Industrial Estate",
  contact: "Sample Contact",
  email: "contact@example.test",
  terms: "Payment within 30 days",
  defaultRate: 250,
  archived: false,
};
const report = {
  totalBills: 0,
  paidBills: 0,
  serviceCents: 0,
  collectedCents: 0,
  outstandingCents: 0,
  recent: [],
  companies: [],
};
async function fixture(page, authenticated = true) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let data = {};
    let status = 200;
    if (url.pathname === "/api/auth/me") {
      if (authenticated)
        data = {
          user: {
            _id: "507f1f77bcf86cd799439099",
            name: "Test Administrator",
            role: "admin",
          },
        };
      else {
        status = 401;
        data = { error: "Sign in required" };
      }
    } else if (url.pathname === "/api/auth/login") {
      status = 401;
      data = { error: "Invalid email or password" };
    } else if (url.pathname === "/api/companies") data = [company];
    else if (url.pathname === `/api/companies/${company._id}`) data = company;
    else if (url.pathname.includes("/letterheads")) data = [];
    else if (url.pathname === "/api/reports") data = report;
    else if (["/api/bills", "/api/audit", "/api/users"].includes(url.pathname))
      data = [];
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
}
test("login page shows errors accessibly without navigating to private data", async ({
  page,
}) => {
  await fixture(page, false);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill("wrong@example.test");
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Invalid email or password",
  );
});
test("dashboard, companies, reports and team navigation render without browser errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await fixture(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Workspace overview" }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Client companies" })
    .click();
  await expect(
    page.getByText("Example Engineering", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Letterhead", exact: true }).click();
  await expect(
    page.getByText("No active letterhead.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Reports", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Billing reports" }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Team & access", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create team account" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("bill wizard calculates fees and blocks unavailable client stationery", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create service bill", exact: false })
    .first()
    .click();
  await page
    .getByLabel("Client company", { exact: true })
    .selectOption(company._id);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Number of candidates", { exact: true }).fill("10");
  await page
    .getByLabel("Explicitly agreed calculation basis")
    .selectOption("per_candidate");
  await page.getByLabel("Stipend / DBT — information only").fill("100000");
  await expect(page.locator(".summary-total strong")).toContainText("2,500.00");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: "Client Company Letterhead" }).check();
  await expect(page.getByRole("alert")).toContainText(
    "no active authorized letterhead",
  );
});
test("mobile navigation and sign out remain usable without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: "test-results/mobile-overview.png",
    fullPage: true,
  });
});

test("itemized charge totals are read-only and fee changes require renewed verification", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await fixture(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create service bill", exact: false })
    .first()
    .click();
  await page
    .getByLabel("Client company", { exact: true })
    .selectOption(company._id);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Add authorized charge" }).click();
  await page
    .getByLabel("Charge 1 description")
    .fill("Authorized document handling");
  await page.getByLabel("Charge 1 quantity").fill("2.5");
  await page.getByLabel("Charge 1 rate (INR)").fill("10.01");
  await expect(page.getByLabel("Other authorized charges (INR)")).toHaveValue(
    "25.03",
  );
  await expect(
    page.getByLabel("Other authorized charges (INR)"),
  ).toHaveJSProperty("readOnly", true);
  await expect(page.locator(".summary-total strong")).toContainText("275.03");
  await page.getByLabel("Stipend / DBT — information only").fill("500000");
  await expect(page.locator(".summary-total strong")).toContainText("275.03");
  await page
    .getByLabel("Notes / explanation of authorized charges")
    .fill("Agreed by client in service agreement");
  const verification = page.getByRole("checkbox", { name: "I have verified" });
  await verification.check();
  await expect(verification).toBeChecked();
  await page.getByLabel("Agreed rate / fixed fee (INR)").fill("500");
  await expect(verification).not.toBeChecked();
  await page.getByRole("button", { name: "Remove charge 1" }).click();
  await expect(page.getByLabel("Other authorized charges (INR)")).toHaveValue(
    "0",
  );
  await expect(page.locator(".summary-total strong")).toContainText("500.00");
  expect(errors).toEqual([]);
});
test("company details show contact, terms and authorized-letterhead status", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Client companies" })
    .click();
  await page
    .getByRole("button", { name: "Example Engineering", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Example Engineering", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Example Industrial Estate", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent company bills" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manage / preview letterhead" })
    .click();
  await expect(
    page.getByText("No active letterhead.", { exact: false }),
  ).toBeVisible();
});
test("account form rejects mismatched new passwords before posting credentials", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "My account" })
    .click();
  await page
    .getByLabel("Current password", { exact: true })
    .fill("CurrentTestPassword-123");
  await page
    .getByLabel("New password", { exact: true })
    .fill("NewTestPassword-123");
  await page
    .getByLabel("Confirm new password")
    .fill("DifferentTestPassword-123");
  await page
    .getByRole("button", { name: "Change password & sign out" })
    .click();
  await expect(page.getByRole("alert")).toContainText("do not match");
});
test("issuance submits the reviewed receipt even when a later detail fetch reports a newer preview", async ({
  page,
}) => {
  await fixture(page);
  const id = "507f1f77bcf86cd799439055";
  const b = {
    _id: id,
    number: "EAS-000001",
    companySnapshot: company,
    businessSnapshot: { name: "Elite Apprenticeship Services" },
    data: {
      date: "2026-10-10",
      dueDate: "2026-11-10",
      verified: true,
      basis: "fixed",
    },
    status: "draft",
    displayStatus: "draft",
    totalCents: 25000,
    paidCents: 0,
    outstandingCents: 0,
    payments: [],
    previewHash: "newer-unreviewed-hash",
    revision: 99,
  };
  await page.route(
    (url) => url.pathname === "/api/bills",
    (route) => route.fulfill({ json: [b] }),
  );
  await page.route(`**/api/bills/${id}`, (route) => route.fulfill({ json: b }));
  await page.route(`**/api/bills/${id}/preview`, (route) =>
    route.fulfill({
      json: { hash: "reviewed-hash", revision: 2, url: `/api/bills/${id}/pdf` },
    }),
  );
  await page.route(`**/api/bills/${id}/pdf?*`, (route) =>
    route.fulfill({ status: 409, json: { error: "Newer preview exists" } }),
  );
  let submitted;
  await page.route(`**/api/bills/${id}/issue`, (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({
      status: 409,
      json: { error: "The reviewed preview is no longer current" },
    });
  });
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Service bills" })
    .click();
  await page.getByRole("button", { name: "EAS-000001", exact: true }).click();
  await page.getByRole("button", { name: "Generate & preview PDF" }).click();
  await page.getByRole("checkbox", { name: "I have reviewed" }).check();
  await page.getByRole("button", { name: "Confirm & issue bill" }).click();
  await expect(page.getByRole("alert")).toContainText("no longer current");
  expect(submitted).toEqual({
    previewHash: "reviewed-hash",
    previewRevision: 2,
  });
});
