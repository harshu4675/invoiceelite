import React, { useState, useEffect, useRef } from "react";
import { api, currency, today } from "../api";
import {
  Field,
  Notice,
  Badge,
  Empty,
  Button,
  useAction,
  PDFView,
  PageHeader,
  BillTable,
  Filters,
  query,
} from "../components/UI";
import {
  calculate,
  billInput,
  chargesTotalCents,
  chargeAmountCents,
} from "../../../shared/domain";
const emptyBill = () => ({
  companyId: "",
  date: today(),
  dueDate: today(new Date(Date.now() + 30 * 86400000)),
  recipient: "",
  address: "",
  description:
    "Apprenticeship registration and related administrative services",
  reference: "",
  candidates: 0,
  stipend: 0,
  establishment: 0,
  basis: "fixed",
  agreedBase: 0,
  rate: 0,
  otherCharges: 0,
  charges: [],
  adjustment: 0,
  terms: "Payment within 30 days",
  notes: "",
  design: "plain",
  letterheadId: null,
  verified: false,
  authorized: false,
});
export default function BillForm({ id, go, notify }) {
  const [data, setData] = useState(emptyBill),
    [companies, setCompanies] = useState([]),
    [letterhead, setLetterhead] = useState(null),
    [step, setStep] = useState(0),
    [revision, setRevision] = useState(null),
    [preview, setPreview] = useState("");
  const a = useAction(),
    key = useRef(crypto.randomUUID());
  const chargeDisplay = (item) => {
    try {
      return currency(chargeAmountCents(item));
    } catch {
      return "—";
    }
  };
  const financialFields = [
    "description",
    "candidates",
    "stipend",
    "establishment",
    "basis",
    "agreedBase",
    "rate",
    "otherCharges",
    "adjustment",
    "terms",
    "notes",
  ];
  const set = (k, v) =>
    setData((d) => ({
      ...d,
      [k]: v,
      ...(financialFields.includes(k) ? { verified: false } : {}),
    }));
  const setCharges = (items) => {
    let sum = 0;
    try {
      sum = chargesTotalCents(items);
      a.setError("");
    } catch (e) {
      a.setError(e.message);
    }
    setData((d) => ({
      ...d,
      charges: items,
      otherCharges: sum / 100,
      verified: false,
    }));
  };
  useEffect(() => {
    a.run(async () => {
      setCompanies((await api("/companies")).filter((c) => !c.archived));
      if (id) {
        const b = await api("/bills/" + id);
        setData({ ...b.data, charges: b.data.charges || [] });
        setRevision(b.revision);
      }
    });
  }, [id]);
  useEffect(() => {
    let live = true;
    setLetterhead(null);
    if (data.companyId)
      api(`/companies/${data.companyId}/letterheads`)
        .then((vs) => {
          if (live) {
            const c = companies.find((c) => c._id === data.companyId);
            setLetterhead(
              vs.find((v) => v._id === c?.activeLetterhead) || null,
            );
          }
        })
        .catch((e) => {
          if (live) a.setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [data.companyId, companies]);
  useEffect(() => {
    setPreview("");
  }, [data]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  let totals,
    calculationError = "";
  try {
    totals = calculate(data);
  } catch (e) {
    calculationError = e.message;
    totals = { feeCents: 0, totalCents: 0 };
  }
  const pickCompany = (companyId) => {
    const c = companies.find((c) => c._id === companyId);
    setData((d) => ({
      ...d,
      companyId,
      recipient: c?.name || "",
      address: c?.address || "",
      terms: c?.terms || "",
      rate: c?.defaultRate || 0,
      letterheadId: null,
      design: "plain",
      authorized: false,
      verified: false,
    }));
  };
  const field = (key, label, type = "text", props = {}) => (
    <Field
      label={label}
      type={type}
      value={data[key]}
      onChange={(e) =>
        set(key, type === "number" ? Number(e.target.value) : e.target.value)
      }
      {...props}
    />
  );
  return (
    <>
      <button
        className="text-button back"
        onClick={() => go(id ? "detail" : "bills", id)}
      >
        ← {id ? "Back to bill" : "All service bills"}
      </button>
      <PageHeader
        eyebrow="SERVICE BILLING"
        title={id ? "Edit draft bill" : "Create a service bill"}
        subtitle="Accurate service fees, transparent calculations and a document you can trust."
      />
      <Notice type="error">{a.error || calculationError}</Notice>
      <div className="steps">
        {[
          "Client & bill details",
          "Services & calculation",
          "Document & review",
        ].map((label, i) => (
          <button
            className={step === i ? "selected" : ""}
            onClick={() => setStep(i)}
            key={label}
          >
            <span>{i + 1}</span>
            {label}
          </button>
        ))}
      </div>
      <div className="bill-grid">
        <section className="card form-card">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              a.run(async () => {
                if (step < 2) {
                  setStep(step + 1);
                  return;
                }
                const result = billInput.safeParse(data);
                if (!result.success)
                  throw new Error(
                    result.error.issues
                      .map((i) => i.path.join(".") + ": " + i.message)
                      .join("; "),
                  );
                const b = await api("/bills" + (id ? "/" + id : ""), {
                  method: id ? "PUT" : "POST",
                  headers: {
                    "Idempotency-Key": key.current,
                    ...(id ? { "If-Match": `"${revision}"` } : {}),
                  },
                  body: data,
                });
                go("detail", id || b._id);
                notify("Draft saved. Preview the saved PDF before issuing.");
              });
            }}
          >
            {step === 0 && (
              <>
                <h2>Client & bill details</h2>
                <Field label="Client company">
                  <select
                    required
                    value={data.companyId}
                    disabled={!!id}
                    onChange={(e) => pickCompany(e.target.value)}
                  >
                    <option value="">Select a client company</option>
                    {companies.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="form-grid">
                  {field("date", "Bill date", "date", { required: true })}
                  {field("dueDate", "Payment due date", "date", {
                    required: true,
                    min: data.date,
                  })}
                  {field("recipient", "Bill recipient", "text", {
                    required: true,
                  })}
                  {field("reference", "Service period / reference")}
                </div>
                <Field label="Billing address">
                  <textarea
                    required
                    value={data.address}
                    onChange={(e) => set("address", e.target.value)}
                  />
                </Field>
                <Notice>
                  A unique bill number is assigned when the draft is saved. The
                  billing entity is Elite Apprenticeship Services.
                </Notice>
              </>
            )}
            {step === 1 && (
              <>
                <h2>Services & agreed fee calculation</h2>
                <Field label="Description of services actually provided">
                  <textarea
                    required
                    rows="4"
                    value={data.description}
                    onChange={(e) => set("description", e.target.value)}
                  />
                </Field>
                <div className="form-grid">
                  {field("candidates", "Number of candidates", "number", {
                    min: 0,
                    step: 1,
                    required: true,
                  })}
                  {field(
                    "stipend",
                    "Stipend / DBT — information only",
                    "number",
                    { min: 0, step: ".01" },
                  )}
                  {field(
                    "establishment",
                    "Establishment-side amount (INR)",
                    "number",
                    { min: 0, step: ".01" },
                  )}
                  <Field label="Explicitly agreed calculation basis">
                    <select
                      value={data.basis}
                      onChange={(e) => set("basis", e.target.value)}
                    >
                      <option value="fixed">Fixed service fee</option>
                      <option value="per_candidate">Fee per candidate</option>
                      <option value="establishment_percent">
                        Percentage of establishment amount
                      </option>
                      <option value="agreed_base_percent">
                        Percentage of explicit agreed base
                      </option>
                    </select>
                  </Field>
                  {field(
                    "rate",
                    data.basis.endsWith("percent")
                      ? "Agreed rate (%)"
                      : "Agreed rate / fixed fee (INR)",
                    "number",
                    { min: 0, step: ".01", required: true },
                  )}
                  {data.basis === "agreed_base_percent" &&
                    field(
                      "agreedBase",
                      "Explicit agreed base (INR)",
                      "number",
                      { min: 0, step: ".01" },
                    )}
                  {field(
                    "otherCharges",
                    "Other authorized charges (INR)",
                    "number",
                    {
                      min: 0,
                      step: ".01",
                      readOnly: data.charges.length > 0,
                      hint: data.charges.length
                        ? "Calculated from the itemized charges below."
                        : undefined,
                    },
                  )}
                  {field(
                    "adjustment",
                    "Authorized adjustment (INR)",
                    "number",
                    { step: ".01" },
                  )}
                </div>
                <section
                  className="charge-editor"
                  aria-label="Itemized authorized charges"
                >
                  <h3>Itemized authorized charges</h3>
                  <p className="muted">
                    Add only separately agreed services actually provided. These
                    rows are included in the PDF and total; they never use
                    apprentice benefits.
                  </p>
                  {data.charges.map((item, i) => (
                    <div className="charge-row" key={i}>
                      <Field
                        label={`Charge ${i + 1} description`}
                        required
                        minLength={3}
                        maxLength={1500}
                        value={item.description}
                        onChange={(e) =>
                          setCharges(
                            data.charges.map((x, j) =>
                              j === i
                                ? { ...x, description: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                      <Field
                        label={`Charge ${i + 1} quantity`}
                        type="number"
                        required
                        min="0.01"
                        max="100000"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) =>
                          setCharges(
                            data.charges.map((x, j) =>
                              j === i
                                ? { ...x, quantity: Number(e.target.value) }
                                : x,
                            ),
                          )
                        }
                      />
                      <Field
                        label={`Charge ${i + 1} rate (INR)`}
                        type="number"
                        required
                        min="0"
                        max="100000000"
                        step="0.01"
                        value={item.rate}
                        onChange={(e) =>
                          setCharges(
                            data.charges.map((x, j) =>
                              j === i
                                ? { ...x, rate: Number(e.target.value) }
                                : x,
                            ),
                          )
                        }
                      />
                      <div className="charge-total">
                        <small>Amount</small>
                        <strong>{chargeDisplay(item)}</strong>
                        <button
                          type="button"
                          className="text-button danger"
                          aria-label={`Remove charge ${i + 1}`}
                          onClick={() =>
                            setCharges(data.charges.filter((_, j) => j !== i))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="secondary small"
                    disabled={data.charges.length >= 100}
                    onClick={() => {
                      if (!data.charges.length && data.otherCharges !== 0) {
                        a.setError(
                          "Set the aggregate other charges to zero before adding itemized charges, so no amount is silently replaced.",
                        );
                        return;
                      }
                      setCharges([
                        ...data.charges,
                        { description: "", quantity: 1, rate: 0 },
                      ]);
                    }}
                  >
                    + Add authorized charge
                  </button>
                </section>
                <Notice>
                  Stipend / DBT is informational and is never automatically
                  included in the invoice total. Do not deduct or divert
                  apprentice benefits to pay service fees.
                </Notice>
                <Field label="Payment terms">
                  <textarea
                    value={data.terms}
                    onChange={(e) => set("terms", e.target.value)}
                  />
                </Field>
                <Field
                  label="Notes / explanation of authorized charges"
                  hint="Required when additional charges or an adjustment are present."
                >
                  <textarea
                    required={data.otherCharges !== 0 || data.adjustment !== 0}
                    value={data.notes}
                    onChange={(e) => set("notes", e.target.value)}
                  />
                </Field>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={data.verified}
                    onChange={(e) => set("verified", e.target.checked)}
                  />{" "}
                  I have verified that this agreed fee arrangement is permitted
                  under the applicable apprenticeship scheme. No apprentice
                  benefits are deducted or diverted.
                </label>
              </>
            )}
            {step === 2 && (
              <>
                <h2>Invoice document design</h2>
                <div className="design-options">
                  {[
                    [
                      "business",
                      "My Business Letterhead",
                      "Text-based business stationery",
                    ],
                    [
                      "client",
                      "Client Company Letterhead",
                      "Use authorized client stationery",
                    ],
                    ["plain", "Plain Invoice", "Clean, professional invoice"],
                  ].map(([value, title, desc]) => (
                    <label
                      className={data.design === value ? "chosen" : ""}
                      key={value}
                    >
                      <input
                        type="radio"
                        name="design"
                        checked={data.design === value}
                        onChange={() =>
                          setData((d) => ({
                            ...d,
                            design: value,
                            letterheadId:
                              value === "client"
                                ? letterhead?._id || null
                                : null,
                            authorized: false,
                          }))
                        }
                      />
                      <div>
                        <strong>{title}</strong>
                        <small>{desc}</small>
                      </div>
                    </label>
                  ))}
                </div>
                {data.design === "client" &&
                  (letterhead ? (
                    <>
                      <div className="letterhead-selection">
                        <strong>{letterhead.originalName}</strong>
                        <Badge value={"v" + letterhead.version} />
                        <p>
                          {letterhead.width.toFixed(0)} ×{" "}
                          {letterhead.height.toFixed(0)} pt ·{" "}
                          {letterhead.orientation}
                        </p>
                        <a
                          href={`/api/companies/${data.companyId}/letterheads/${letterhead._id}/file`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Preview letterhead ↗
                        </a>
                        {data.letterheadId !== letterhead._id && (
                          <Notice type="error">
                            Select the current active version before saving this
                            bill.{" "}
                            <button
                              type="button"
                              className="secondary small"
                              onClick={() =>
                                setData((d) => ({
                                  ...d,
                                  letterheadId: letterhead._id,
                                  authorized: false,
                                }))
                              }
                            >
                              Use version {letterhead.version}
                            </button>
                          </Notice>
                        )}
                        {letterhead.mime === "application/pdf" ? (
                          <iframe
                            className="letterhead-thumbnail"
                            title="Selected company letterhead thumbnail"
                            src={`/api/companies/${data.companyId}/letterheads/${letterhead._id}/file`}
                          />
                        ) : (
                          <img
                            className="letterhead-thumbnail"
                            alt="Selected company's letterhead"
                            src={`/api/companies/${data.companyId}/letterheads/${letterhead._id}/file`}
                          />
                        )}
                        <p>
                          To adjust the saved layout, open Client companies →
                          Letterhead. Return and reselect the company
                          afterwards.
                        </p>
                      </div>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={data.authorized}
                          onChange={(e) => set("authorized", e.target.checked)}
                        />{" "}
                        I am authorized to use this company's stationery. The
                        client is not represented as the issuer or approver of
                        this bill.
                      </label>
                    </>
                  ) : (
                    <Notice type="error">
                      This company has no active authorized letterhead.{" "}
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => go("companies")}
                      >
                        Manage company letterheads →
                      </button>
                    </Notice>
                  ))}
                <Notice>
                  The draft is not issued until you inspect the saved PDF and
                  explicitly confirm issuance. Check all amounts and layout
                  alignment.
                </Notice>
                <Button
                  type="button"
                  className="secondary"
                  busy={a.busy}
                  onClick={() =>
                    a.run(async () => {
                      const blob = await api("/invoices/preview", {
                        method: "POST",
                        body: data,
                        blob: true,
                      });
                      setPreview(URL.createObjectURL(blob));
                    })
                  }
                >
                  Preview invoice
                </Button>
              </>
            )}
            <div className="form-footer">
              {step > 0 && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setStep(step - 1)}
                >
                  ← Back
                </button>
              )}
              <Button
                busy={a.busy}
                disabled={!!calculationError || (!!id && revision === null)}
              >
                {step < 2
                  ? "Continue →"
                  : id
                    ? "Save draft changes"
                    : "Save draft bill"}
              </Button>
            </div>
          </form>
        </section>
        <aside>
          <section className="card summary">
            <div className="eyebrow">LIVE CALCULATION</div>
            <h2>Bill summary</h2>
            <div className="summary-client">
              {data.recipient || "Select a client company"}
              <small>
                {data.date} · Due {data.dueDate}
              </small>
            </div>
            <dl>
              <div>
                <dt>Candidates</dt>
                <dd>{data.candidates}</dd>
              </div>
              <div>
                <dt>Agreed basis</dt>
                <dd>{data.basis.replaceAll("_", " ")}</dd>
              </div>
              <div>
                <dt>Service fee</dt>
                <dd>{currency(totals.feeCents)}</dd>
              </div>
              <div>
                <dt>Other charges</dt>
                <dd>{currency(Math.round(data.otherCharges * 100))}</dd>
              </div>
              <div>
                <dt>Adjustment</dt>
                <dd>{currency(Math.round(data.adjustment * 100))}</dd>
              </div>
            </dl>
            <div className="summary-total">
              <span>Total payable</span>
              <strong>{currency(totals.totalCents)}</strong>
              <small>To Elite Apprenticeship Services</small>
            </div>
            <p className="muted">
              Stipend / DBT: {currency(Math.round(data.stipend * 100))}
              <br />
              For information only — excluded from total.
            </p>
          </section>
          <div className="bottom-note">
            ◈{" "}
            <span>
              No GST or statutory charges are added by this application.
            </span>
          </div>
        </aside>
      </div>
      {preview && (
        <PDFView url={preview} title="Draft invoice preview — not issued" />
      )}
    </>
  );
}
