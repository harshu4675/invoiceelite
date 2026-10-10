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
export default function Dashboard({ go }) {
  const [report, setReport] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/reports")
      .then(setReport)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <PageHeader
        eyebrow="YOUR BUSINESS AT A GLANCE"
        title="Workspace overview"
        subtitle="A clear view of your billing, collections and client relationships."
      >
        <button onClick={() => go("new")}>+ Create service bill</button>
      </PageHeader>
      <Notice type="error">{error}</Notice>
      <div className="welcome-strip">
        <div>
          <span className="gold-dot" /> PURPOSE-BUILT FOR YOUR SERVICES
          <h2>Every bill. Every client. In order.</h2>
          <p>Manage apprenticeship service fees with clarity and confidence.</p>
        </div>
        <div className="welcome-symbol">
          ▧<span>✓</span>
        </div>
      </div>
      <div className="stats">
        {[
          ["Total bills", report?.totalBills, "▧", "All billing records"],
          [
            "Outstanding balance",
            report && currency(report.outstandingCents),
            "◷",
            "Across issued bills",
          ],
          [
            "Service charges",
            report && currency(report.serviceCents),
            "↗",
            "Issued service fees only",
          ],
          [
            "Collected payments",
            report && currency(report.collectedCents),
            "✓",
            `${report?.paidBills || 0} bills fully paid`,
          ],
        ].map(([label, value, icon, hint]) => (
          <div className="stat" key={label}>
            <div>
              <span>{label}</span>
              <i>{icon}</i>
            </div>
            <strong>{value ?? "—"}</strong>
            <small>{hint}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Recent bills</h2>
              <p>Your latest billing activity</p>
            </div>
            <button className="text-button" onClick={() => go("bills")}>
              View all bills →
            </button>
          </div>
          {report ? (
            <BillTable rows={report.recent} go={go} />
          ) : (
            <p className="padded">Loading billing records…</p>
          )}
        </section>
        <section className="card quick-start">
          <div className="section-heading">
            <h2>Quick actions</h2>
          </div>
          {[
            [
              "companies",
              "▤",
              "Manage client companies",
              "Contacts, terms & letterheads",
            ],
            ["new", "+", "Create a service bill", "Calculate and preview fees"],
            [
              "reports",
              "↗",
              "Review your reports",
              "Collections & outstanding balances",
            ],
          ].map(([p, i, t, s]) => (
            <button key={p} onClick={() => go(p)}>
              <span>{i}</span>
              <div>
                <strong>{t}</strong>
                <small>{s}</small>
              </div>
              <b>→</b>
            </button>
          ))}
          <div className="compliance-note">
            <strong>Service fees, clearly separated.</strong>
            <p>
              Stipend and DBT figures are informational only. They never become
              payable by default.
            </p>
          </div>
        </section>
      </div>
      <div className="bottom-note">
        ◈{" "}
        <span>
          Client stationery is used only with confirmed authorization. Your
          business remains the identified billing entity.
        </span>
      </div>
    </>
  );
}
