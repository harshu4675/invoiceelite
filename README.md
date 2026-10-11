# InvoiceElite

A full-stack billing workspace for **Elite Apprenticeship Services**, built in this repository with React 19, Vite, external CSS, Express 5, MongoDB/Mongoose, JWT cookies, bcrypt, `pdf-lib`, and Sharp.

## Verification status

- Frontend production build: **passed** in the implementation sandbox.
- Financial, permission, upload-validation, worker, PDF and HTTP-security tests: **36 passed** (see `npm test`; the count may increase as tests are added).
- Browser smoke tests: **8 passed**, using isolated API fixtures (not a substitute for real database integration). Desktop/mobile navigation, company details, login/account validation, itemized fees, renewed verification and reviewed-preview receipt handling are covered.
- Dependency audit: **zero reported vulnerabilities** at implementation time.
- Real MongoDB integration suite: **implemented but not verified in this sandbox**. The latest local-replica-set attempt failed with `ECONNREFUSED 127.0.0.1:27017` because no MongoDB service is installed. The sandbox also blocks `fastdl.mongodb.org`, so `mongodb-memory-server` cannot download its binary. This is not replaced with a mock database or a fake login.
- An **inactive** GitHub Actions template is provided at `docs/ci/github-actions.yml.example`. CI is not enabled by this PR because the GitHub integration lacks workflow-write permission. A maintainer with that permission can copy the template to `.github/workflows/ci.yml`; it starts a real MongoDB replica set and runs the integration suite. Run that suite successfully, complete acceptance testing and configure production infrastructure **before using real financial records**. This implementation is not a certification of production readiness or scheme/legal compliance.

## Features

- Private login/logout with bcrypt passwords, eight-hour JWT sessions in HttpOnly cookies, session revocation, server-enforced administrator/staff roles and company assignments.
- Responsive navy/gold dashboard, companies, billing wizard, bill history, payments, reports, CSV export, team access and audit trail.
- Company create/edit/view/archive; terms, default agreed rate, contact and billing details, company-specific history and explicit company filters.
- Private PDF/PNG/JPG letterheads with content validation, single-page restrictions, authorization declarations, immutable numbered versions and explicit activation/deactivation.
- Numeric layout editor with live actual-PDF preview: original page dimensions/orientation, margins, title/body font sizes, line spacing, section positions, description-column width, explicit section page breaks and repeated-letterhead control.
- Fixed, per-candidate, establishment-percentage and explicit-agreed-base percentage fees. Shared client/server calculations use integer paise and `BigInt` intermediate arithmetic with half-up rounding. Stipend/DBT amounts **never automatically enter the payable total**. No GST, invented government affiliations, statutory fees or apprentice personal/banking data.
- Scheme fee verification is required before issue; client stationery also requires explicit authorization. PDFs identify Elite as the billing entity rather than representing the client as the issuer.
- Plain, built-in text-based business stationery, and uploaded client-stationery designs.
- Selectable text, embedded fonts, preserved vector PDF backgrounds, proportional image backgrounds and automatic pagination. Download/print the exact saved PDF that was reviewed.
- Revision-checked draft edits; hash-verified issued snapshots/PDFs; cancellation with reason for unpaid records; separate payment ledger, partial/paid/overdue states, overpayment protection, transactional audits and actor/request-bound idempotency keys.
- Up to 100 itemized authorized charges, with per-line quantity × rate rounding, transparent PDF rows and server reconciliation. Aggregate charges remain available for existing drafts.
- Self-service password changes with current-password verification, bcrypt byte-length validation and revocation of every previous session.

## Repository structure

```text
client/
  index.html
  src/
    App.jsx                   Session and workspace navigation
    main.jsx                  React entry point
    api.js                    Same-origin API client
    styles.css                Responsive external CSS; no Tailwind
    components/UI.jsx         Accessible shared controls, tables, PDF viewer
    pages/                    Login/account, dashboard, company/letterhead, bill, reports, team, audit
shared/domain.js              Validation schemas, calculations, permissions and status rules
server/
  app.js                      Express API, authorization, transactions and secure file access
  config.js                   Fail-closed environment validation
  index.js                    Database readiness and HTTP lifecycle
  models.js                   User, Company, LetterheadVersion, Bill, Payment, AuditLog, Counter
  integrity.js                Revision/receipt guards, request and stored-file hashes
  pdf.js                      File inspection and PDF composition
  pdf-jobs.js / pdf-worker.js  Bounded document workers with timeout/heap limits
  fonts/                      Bundled DejaVu fonts and license
  seed.js                     Initial administrator and optional fictional company
  reset-password.js           Operator-only password recovery / session revocation
storage/                      Private local files; contents excluded from Git
tests/                        Unit, integrity, PDF and HTTP-security tests
tests/integration/            Real replica-set business workflow tests
Dockerfile / compose.yml      Application image and local development database
docs/ci/github-actions.yml.example  Inactive CI template; requires maintainer activation
```

## Prerequisites

- Node.js **22.12+**, npm.
- MongoDB 7/8 **replica set** or MongoDB Atlas; a standalone server is deliberately refused. Transactions are required for payment/audit and billing consistency.
- A persistent private filesystem for `STORAGE_DIR`. A single application instance is the initial deployment architecture. Do not put this directory inside `dist`, a public webroot, or ephemeral container storage.
- No external service is required for PDF generation or fonts.

## Local setup

```bash
npm ci
cp .env.example .env
```

Edit `.env` privately:

- `JWT_SECRET`: generate a random secret, for example `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Never use the example value.
- `MONGODB_URI`: your replica-set connection, e.g. `mongodb://127.0.0.1:27017/invoiceelite?replicaSet=rs0`.
- `APP_ORIGIN`: exact browser origin, initially `http://localhost:5173`, without trailing slash/path.
- `BUSINESS_NAME`, `BUSINESS_ADDRESS`: the genuine billing entity and address. Production startup refuses the placeholder address.
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`: a unique email and strong password of at least 12 characters. No default account/password is built in.

### Optional local MongoDB using Docker

This compose configuration is **local development only**, bound to loopback with no authentication:

```bash
docker compose up -d mongo
# Wait for the health check to become healthy, then initialize once:
docker compose exec mongo mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
# Confirm the replica set has elected its primary:
docker compose exec mongo mongosh --quiet --eval 'rs.status()'
```

The Node process runs on the host, where `localhost:27017` is reachable. For a containerized app or production cluster, configure replica-set member hostnames that are reachable from that app; do not reuse this development topology unchanged.

```bash
npm run seed
# Or also create a clearly fictional sample company:
npm run seed -- --sample
npm run dev
```

Open `http://localhost:5173` and sign in with the administrator you configured. Seed is idempotent and does **not** reset existing passwords. Remove the seed password from the deployed environment after initial setup. The API runs on `0.0.0.0:3001`; Vite proxies relative `/api` requests to it. No browser requests call the sandbox's localhost directly.

### Arena / remote preview

Vite accepts `*.e2b.app`. Set `APP_ORIGIN` to the **exact HTTPS preview origin** serving port 5173. Use the standalone preview tab: strict session cookies and anti-framing protection intentionally do not weaken authentication for cross-site embedding. The database must be reachable from the running API; a laptop's localhost is not the sandbox's localhost. The frontend can render its login screen without MongoDB, but cannot authenticate or create records until the real API/database is configured.

## Working through the application

1. **Client companies → Add company**. Save the genuine client details.
2. **Letterhead**. Select an authorized single-page file, inspect its local preview, confirm authority and upload. Uploading does **not** activate it automatically.
3. Select the saved version. Inspect the original and sample invoice preview. Adjust safe margins, typography, section positions and page-break settings. Layout changes save a **new immutable version**; activate that saved version after review.
4. **Create service bill**. Choose the company, dates, recipient, actual services, counts and explicit agreed fee basis. Stipend/DBT is shown separately. Add itemized authorized charges when needed. Explain authorization for any additional charges/adjustments in notes; this is validated on the server. Confirm the arrangement has been verified as permissible.
5. Select a design. Client design requires that company's active authorized version; changing companies resets this choice. Preview, save the draft, then **Generate & preview PDF** on the saved record.
6. Check every page, logo, watermark, table and total. Edit the draft if necessary; this invalidates its saved preview. Check the review confirmation and **Confirm & issue bill**. The issued file is byte-for-byte the saved preview, not a fresh rendering.
7. Download/print from the viewer. Some browsers require **Open PDF** followed by the browser's print action.
8. Record payments against issued bills. Payments never rewrite the issued PDF; the current balance and payment dates/references are shown in the ledger.
9. Correct an unpaid issued bill by cancelling it with a reason and creating a replacement referencing the original number. Issued data cannot be silently edited. Paid bills cannot be cancelled by this workflow.
10. **My account** lets each user change their password after verifying the current one; all sessions are revoked and the user must sign in again.
11. **Team & access**: administrators can create/disable accounts and change staff company assignments. Staff can manage drafts/issue bills/payments only within their assignments. Staff cannot upload stationery, change company configuration, manage users or view global audit records.

### Layout coordinate rules

All page coordinates are **PDF points (72 pt = 1 inch)**. The uploaded page's visible CropBox, size and orientation are retained. Images use metadata DPI, or 96 DPI if absent, with unchanged aspect ratio. A4 is the default for plain/business designs only.

- Top margin controls the content start; left/right establish the shared horizontal content region.
- Section Y values are minimum offsets below the content start. Zero means natural flow. If preceding text requires more space, the section moves down or onto a new page rather than overlapping it.
- Bottom margin reserves the printed footer. Invoice page numbers are placed within the safe region, not inside the reserved printed footer.
- Explicit page-break toggles start selected sections on a new page. Long text also paginates automatically with repeated table column headings.
- Uploaded stationery is never edited. Saving layout settings creates a metadata revision referencing the same original file.
- The application cannot infer which regions of arbitrary stationery are important. **Human alignment review remains mandatory**; margins must avoid printed elements and watermarks. There is no claim of automatic logo/watermark collision detection.

## Financial and historical invariants

- `fixed`: agreed rate in INR.
- `per_candidate`: candidates × agreed rate.
- `establishment_percent`: explicit establishment amount × agreed percentage / 100.
- `agreed_base_percent`: explicit agreed base × agreed percentage / 100.
- Itemized additional charges are rounded half-up per line from quantity × rate, then summed; a submitted aggregate that differs from that sum is rejected. Additional charges/adjustments require an authorization explanation in notes.
- Final amount = rounded service fee + authorized additional charges + signed adjustment. Negative totals and excessive amounts are rejected. Decimal inputs accept at most two places. Fees/totals/payments are stored in integer paise.
- Informational stipend/DBT is **not a calculation base option**. No amount is deducted from apprentice benefits. The operator must verify any proposed fee base is legally permissible; the software cannot certify scheme compliance.
- Each bill snapshots client identity/address, business identity, full validated bill data, fee results, letterhead ID/version and layout.
- Bill numbers use a transactional unique counter (`EAS-000001`, etc.), never a row count. Gaps are not reused.
- A stored preview returns its SHA-256 hash **and revision**. Issuance requires that exact reviewed receipt and rechecks the stored bytes; PDF download also verifies integrity. A stale preview URL returns a conflict rather than a different document. Other configuration changes cannot affect issued files.
- Draft edits require the last-read revision in `If-Match: "<revision>"`. A stale editor cannot silently overwrite a newer draft.
- Issuance serializes with company configuration changes. An archived company or replaced/deactivated client letterhead blocks new issuance until the draft is updated and previewed again; already-issued records remain unchanged.
- Business dates and overdue checks use `Asia/Kolkata`, including the UTC midnight boundary.
- Replaced/deactivated letterheads are retained. “Remove active” removes the current selection, not audit history.
- Payments and bill ledger updates commit atomically with audit entries. Idempotency keys are bound to the submitting actor and a canonical hash of the original validated payload. Identical retries replay the existing record; changed amounts, references or other details return a conflict, not a silently different operation. Concurrent payments cannot overpay.
- Reports filter **bill dates**, not receipt dates. Collections are all payments against bills in that cohort. Draft/cancelled records do not contribute to financial totals. The UI explicitly states this. CSV formulas are escaped. Queries over 10,000 matching bills require a narrower date range rather than silently truncating totals.

## API summary

All private routes use `/api`, a session cookie, and company authorization. Every mutation requires the exact `Origin` configured in `APP_ORIGIN` and `X-Requested-With: InvoiceElite`. Financial creation/payment requests also require a UUID `Idempotency-Key`.

| Route | Purpose |
|---|---|
| `POST /auth/login`, `/auth/logout`, `/auth/password`; `GET /auth/me` | Authentication / password changes |
| `GET/POST /users`; `PATCH /users/:id` | Admin account and assignment management |
| `GET/POST /companies`; `GET/PUT /companies/:id` | Company management / authorized details |
| `GET/POST /companies/:id/letterheads` | Metadata / authorized upload (`file`, `authorized=true`) |
| `GET /companies/:id/letterheads/:version/file` | Authorized original preview |
| `POST /companies/:id/letterheads/:version/activate` | Explicit activation |
| `DELETE /companies/:id/letterhead` | Remove active selection only |
| `POST /companies/:id/letterheads/:version/layout` | Create immutable layout revision |
| `POST /companies/:id/letterheads/:version/preview` | Sample PDF using proposed layout |
| `POST /invoices/preview` | Actual unsaved bill PDF preview |
| `GET/POST /bills`; `GET/PUT /bills/:id` | History, draft creation/edit and details |
| `POST /bills/:id/preview`, `/issue`, `/cancel` | Saved preview, issuance and cancellation |
| `GET /bills/:id/pdf?download=1` | Original generated PDF |
| `POST /bills/:id/payments` | Transactional payment record |
| `GET /reports`, `/reports.csv` | Company summaries / authorized export |
| `GET /audit` | Admin audit history |

## Testing

```bash
npm test                    # No database needed: domain, real PDF and HTTP-security tests
npm run build               # Production React build
npm run format:check
npm run test:ui             # Real browser with isolated API fixtures
npm audit --audit-level=high

# Uses a DISPOSABLE test database; it is dropped before and after testing:
TEST_MONGODB_URI='mongodb://127.0.0.1:27017/invoiceelite_test?replicaSet=rs0' npm run test:integration
```

**Never point integration tests at business data.** The suite requires the database name `invoiceelite_test`. Without `TEST_MONGODB_URI`, it starts an ephemeral MongoDB replica set using `mongodb-memory-server`; this requires access to the MongoDB binary download host or `MONGOMS_SYSTEM_BINARY` set to an installed `mongod`.

UI smoke tests use a bundled headless Chromium on Linux (native libraries are extracted into the OS temporary directory). On other platforms install a Playwright browser or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to your compatible browser path. These test fixtures never run in the application itself.

The integration suite covers real login, authenticated password changes, stale-draft conflicts, reviewed-receipt binding, modified request-key rejection, disk-corruption detection, company scoping, invalid uploads, activation, cross-company rejection, idempotent drafts, issue gating, exact PDF hashes, locked history after company/layout changes, partial payments, concurrent settlement/overpayment, report reconciliation, audits and token revocation. The inactive template `docs/ci/github-actions.yml.example` provides the database and runs this suite once a maintainer copies it to `.github/workflows/ci.yml` with workflow-write permission. Until then, run these commands locally; no automated GitHub checks are enabled. No database tests are silently marked passed when the service is unavailable.

## Deployment

```bash
npm ci
npm run build
# Configure .env with NODE_ENV=production, HTTPS APP_ORIGIN and real database/business settings.
npm start
```

Express serves `dist` and `/api` from the same origin. Terminate HTTPS at a trusted reverse proxy. If exactly one trusted proxy is in front of Express, set `TRUST_PROXY=1` and restrict direct access to the backend; otherwise leave it `0`. Do not trust arbitrary forwarded IP headers. Configure an upload body limit slightly above 10 MB, request timeouts, security monitoring and resource limits.

Alternatively build `Dockerfile`, supply environment variables at runtime (no `.env` is copied), and mount a persistent private volume at `/app/storage`. The app runs as the non-root `node` user; ensure the mounted directory is writable only by that account. Connect to an authenticated, TLS-protected MongoDB replica set. The development compose database is **not** a production configuration.

### Production checklist

- Run and pass the real database integration suite and your browser acceptance tests.
- Configure genuine billing identity, HTTPS origin, unique secret and a least-privilege database account.
- Seed only your real administrator; remove seed secrets; grant staff only required companies.
- Back up **MongoDB and private storage together**. Test a restore, including historical PDF hashes and letterhead files. Never delete old versions blindly.
- Restrict file-system access and encrypt backups/disks. No file is exposed by Express static serving; file keys are generated UUIDs and storage keys are omitted from metadata APIs.
- Document retention, cancellation/replacement, legal fee verification, payment reconciliation and authorization-evidence procedures with the business owner.
- Monitor failed requests, storage capacity, worker timeouts and audit records without logging bill bodies, passwords or tokens.
- Keep the dependency lockfile and patched runtime current. Upload validation is not an antivirus guarantee. For high-assurance environments add a malware scanning/quarantine service before accepting untrusted documents.
- Use a single app instance initially. Distributed deployment requires shared private storage, a distributed rate limiter and operational design review. The current limiter and worker concurrency cap are per process.

### Password changes and recovery

Signed-in users can use **My account** to change their own password. Passwords must have at least 12 characters and at most 72 UTF-8 bytes to avoid bcrypt truncation.


An operator with authorized server access can set `RESET_USER_EMAIL` and `RESET_USER_PASSWORD` in the process environment, then run `npm run reset-password`. Do not place passwords in command arguments, shell history, Git or chat. The script hashes the new password, revokes all existing sessions and records an audit event. Self-service **email** recovery and MFA are not implemented; authenticated password changes are implemented.

## Explicit scope and remaining limitations

- **Database-backed runtime and integration tests have not yet been verified in the restricted implementation sandbox.** A configured replica set and an operator-run acceptance pass are required before real use.
- Local private filesystem storage is implemented. Object-storage/S3 adapters, distributed locking/rate limiting, automated retention and backup tooling are not included.
- Layout editing is numeric with live preview, not drag-and-drop. Horizontal positions share the configured content margins; sections use flow-aware vertical offsets, not independently overlapping absolute canvases.
- Client letterheads are fully uploaded/versioned. “My Business Letterhead” is a built-in text-based navy/gold header using configured business identity; uploading custom business stationery is not implemented.
- Each bill has one primary apprenticeship fee calculation plus up to 100 itemized separately authorized charges, with descriptions, quantities, rates and amounts. A reusable service catalog, multiple independent apprenticeship fee bases on one bill, credit notes, payment reversal/refund UI and paid-invoice cancellation are not included.
- PDFs must be readable, unencrypted, non-interactive and single-page. Rotated page dictionaries / EXIF-rotated images require normalization before upload. PDF annotations, forms, scripts and embedded files are rejected. Files are limited to 10 MB; images to 24 megapixels; page dimensions to 250–2000 points with a usable safe area.
- Bundled DejaVu fonts cover Latin and several additional alphabets, but not every language (notably full Devanagari). Unsupported characters cause an explicit validation error, **not silent character substitution**. Add and test properly licensed fonts/shaping support before billing in unsupported scripts.
- Signature/stamp area is a printable placeholder, not an electronic signature or approval certificate. The application records the operator's authorization declaration, not independent legal proof of client authorization.
- Dashboard “recent activity” shows recent bills; the dedicated audit page shows the latest 100 actions. Reports are bill-date cohort reports, not a payment-date cashflow or tax accounting system.
- The application is not government-approved and does not itself establish NAPS/NATS eligibility, authorization or the legality of any fee arrangement.
