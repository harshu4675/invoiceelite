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
export default function BillDetail({ id, go, user, notify }) {
  const [b, setB] = useState(null),
    [pdfUrl, setPdfUrl] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [receipt, setReceipt] = useState(null),
    [payment, setPayment] = useState({
      amount: 0,
      date: today(),
      reference: "",
    }),
    [reason, setReason] = useState("");
  const a = useAction(),
    paymentKey = useRef(crypto.randomUUID());
  const load = async () => {
    const bill = await api("/bills/" + id);
    setB(bill);
  };
  useEffect(() => {
    a.run(load);
  }, [id]);
  if (!b)
    return (
      <>
        <Notice type="error">{a.error}</Notice>
        <p>Loading bill…</p>
      </>
    );
  return (
    <>
      <button className="text-button back" onClick={() => go("bills")}>
        ← All service bills
      </button>
      <PageHeader
        eyebrow="BILL RECORD"
        title={b.number}
        subtitle={`${b.companySnapshot.name} · ${b.data.date}`}
      >
        <Badge value={b.displayStatus} />
        {b.status === "draft" && (
          <button className="secondary" onClick={() => go("new", id)}>
            Edit draft
          </button>
        )}
        <Button
          busy={a.busy}
          onClick={() =>
            a.run(async () => {
              if (b.status === "draft") {
                const p = await api(`/bills/${id}/preview`, { method: "POST" });
                setPdfUrl(p.url + "?v=" + p.hash);
                setReviewed(false);
                setReceipt({
                  previewHash: p.hash,
                  previewRevision: p.revision,
                });
                await load();
              } else setPdfUrl(`/api/bills/${id}/pdf`);
            })
          }
        >
          {b.status === "draft" ? "Generate & preview PDF" : "View issued PDF"}
        </Button>
      </PageHeader>
      <Notice type="error">{a.error}</Notice>
      <div className="stats three">
        <div className="stat">
          <span>Invoice total</span>
          <strong>{currency(b.totalCents)}</strong>
        </div>
        <div className="stat">
          <span>Payments received</span>
          <strong>{currency(b.paidCents)}</strong>
        </div>
        <div className="stat">
          <span>
            {b.status === "draft"
              ? "Draft amount (not due)"
              : "Outstanding balance"}
          </span>
          <strong>
            {currency(
              b.status === "cancelled" ? 0 : b.totalCents - b.paidCents,
            )}
          </strong>
        </div>
      </div>
      {b.status === "cancelled" && (
        <Notice type="error">
          Cancelled: {b.cancelReason}. The original document is retained for
          audit only and must not be used as an active bill.
        </Notice>
      )}
      {b.status === "draft" && (
        <section className="card form-card">
          <h2>Review before issuance</h2>
          <p>
            Generate the saved PDF, check content and alignment, then issue. The
            exact preview bytes are preserved permanently. Issued data cannot be
            edited.
          </p>
          <p>
            Scheme verification:{" "}
            <strong>
              {b.data.verified
                ? "Confirmed"
                : "Not confirmed — edit the draft before issuing"}
            </strong>{" "}
            · Letterhead:{" "}
            <strong>
              {b.letterheadVersion
                ? "Version " + b.letterheadVersion
                : "No client stationery"}
            </strong>
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={!pdfUrl}
              onChange={(e) => setReviewed(e.target.checked)}
            />{" "}
            I have reviewed the displayed PDF and confirm the details and layout
            are correct.
          </label>
          <Button
            busy={a.busy}
            disabled={!reviewed || !b.data.verified || !receipt}
            onClick={() =>
              a.run(async () => {
                await api(`/bills/${id}/issue`, {
                  method: "POST",
                  body: receipt,
                });
                await load();
                notify(
                  "Bill issued. The PDF and its historical snapshots are preserved.",
                );
              })
            }
          >
            Confirm & issue bill
          </Button>
        </section>
      )}
      {pdfUrl && (
        <PDFView
          url={pdfUrl.startsWith("/api") ? pdfUrl : "/api" + pdfUrl}
          title={
            b.status === "draft"
              ? "Saved bill preview"
              : b.status === "cancelled"
                ? "Cancelled bill — archive copy"
                : "Original issued PDF"
          }
        />
      )}
      <div className="dashboard-grid">
        <section className="card form-card">
          <h2>Payments</h2>
          {b.payments.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th className="numeric">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {b.payments.map((p) => (
                    <tr key={p._id}>
                      <td>{p.date}</td>
                      <td>{p.reference}</td>
                      <td className="numeric">{currency(p.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No payments recorded.</p>
          )}
          {b.status === "issued" && b.paidCents < b.totalCents && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                a.run(async () => {
                  await api(`/bills/${id}/payments`, {
                    method: "POST",
                    headers: { "Idempotency-Key": paymentKey.current },
                    body: payment,
                  });
                  paymentKey.current = crypto.randomUUID();
                  setPayment({ amount: 0, date: today(), reference: "" });
                  await load();
                  notify("Payment recorded");
                });
              }}
            >
              <div className="form-grid">
                <Field
                  label="Amount received (INR)"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={(b.totalCents - b.paidCents) / 100}
                  required
                  value={payment.amount}
                  onChange={(e) =>
                    setPayment({ ...payment, amount: Number(e.target.value) })
                  }
                />
                <Field
                  label="Payment date"
                  type="date"
                  required
                  value={payment.date}
                  onChange={(e) =>
                    setPayment({ ...payment, date: e.target.value })
                  }
                />
              </div>
              <Field
                label="Payment reference"
                required
                value={payment.reference}
                onChange={(e) =>
                  setPayment({ ...payment, reference: e.target.value })
                }
              />
              <Button busy={a.busy}>Record payment</Button>
            </form>
          )}
        </section>
        <section className="card form-card">
          <h2>Historical record</h2>
          <p>
            Billing entity: <strong>{b.businessSnapshot.name}</strong>
          </p>
          <p>
            Calculation basis:{" "}
            <strong>{b.data.basis.replaceAll("_", " ")}</strong>
          </p>
          <p>
            Letterhead:{" "}
            <strong>
              {b.letterheadVersion
                ? "Version " + b.letterheadVersion
                : "Plain / business stationery"}
            </strong>
          </p>
          <p>
            Issued:{" "}
            {b.issuedAt
              ? new Date(b.issuedAt).toLocaleString()
              : "Not yet issued"}
          </p>
          <p className="muted">
            Payments update the ledger, not the original issued document. To
            correct an unpaid bill, cancel it and create a replacement with the
            original bill number in the reference.
          </p>
          {user.role === "admin" &&
            b.status !== "cancelled" &&
            b.paidCents === 0 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!confirm("Cancel this bill? This cannot be undone."))
                    return;
                  a.run(async () => {
                    await api(`/bills/${id}/cancel`, {
                      method: "POST",
                      body: { reason },
                    });
                    await load();
                    notify("Bill cancelled; original record retained.");
                  });
                }}
              >
                <Field
                  label="Cancellation reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  minLength="5"
                />
                <Button className="danger secondary" busy={a.busy}>
                  Cancel bill
                </Button>
              </form>
            )}
        </section>
      </div>
    </>
  );
}
