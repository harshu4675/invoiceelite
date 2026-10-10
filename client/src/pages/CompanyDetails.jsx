import React, { useState, useEffect } from "react";
import { api, currency } from "../api";
import {
  PageHeader,
  Notice,
  Badge,
  BillTable,
  useAction,
} from "../components/UI";
export default function CompanyDetails({ id, onBack, onLetterhead, go }) {
  const [company, setCompany] = useState(null),
    [report, setReport] = useState(null),
    [versions, setVersions] = useState([]);
  const a = useAction();
  useEffect(() => {
    let live = true;
    a.run(async () => {
      const [c, r, v] = await Promise.all([
        api("/companies/" + id),
        api("/reports?companyId=" + id),
        api(`/companies/${id}/letterheads`),
      ]);
      if (live) {
        setCompany(c);
        setReport(r);
        setVersions(v);
      }
    });
    return () => {
      live = false;
    };
  }, [id]);
  const active = versions.find((v) => v._id === company?.activeLetterhead);
  return (
    <>
      <button className="text-button back" onClick={onBack}>
        ← Company directory
      </button>
      <Notice type="error">{a.error}</Notice>
      {company ? (
        <>
          <PageHeader
            eyebrow="CLIENT PROFILE"
            title={company.name}
            subtitle="Contact information, agreed terms and client billing history."
          >
            <Badge value={company.archived ? "archived" : "active"} />
            <button onClick={() => onLetterhead(company)}>
              Manage / preview letterhead
            </button>
          </PageHeader>
          <div className="dashboard-grid">
            <section className="card form-card">
              <h2>Company details</h2>
              <dl className="company-details">
                {[
                  ["Authorized contact", company.contact],
                  ["Email", company.email],
                  ["Phone", company.phone],
                  ["Registered address", company.address],
                  ["Identification", company.identification],
                  ["Default agreed rate", company.defaultRate.toFixed(2)],
                  ["Payment terms", company.terms],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v || "Not provided"}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="card form-card">
              <h2>Authorized letterhead</h2>
              {active ? (
                <>
                  <strong>{active.originalName}</strong>
                  <p>
                    Version {active.version} · {active.orientation}
                    <br />
                    {active.width.toFixed(1)} × {active.height.toFixed(1)} pt
                  </p>
                  <p className="muted">
                    Uploaded{" "}
                    {new Date(active.createdAt).toLocaleDateString("en-IN")}.
                    Earlier versions remain available for historical bills.
                  </p>
                  <a
                    className="button secondary"
                    target="_blank"
                    rel="noreferrer"
                    href={`/api/companies/${id}/letterheads/${active._id}/file`}
                  >
                    Preview original
                  </a>
                </>
              ) : (
                <Notice>
                  No active authorized letterhead. An administrator must upload
                  and activate one before issuing a client-letterhead bill.
                </Notice>
              )}
            </section>
          </div>
          <div className="stats three">
            {[
              [
                "Issued total",
                report.companies.reduce((s, c) => s + c.billedCents, 0),
              ],
              ["Collected", report.collectedCents],
              ["Outstanding", report.outstandingCents],
            ].map(([k, v]) => (
              <div className="stat" key={k}>
                <span>{k}</span>
                <strong>{currency(v)}</strong>
              </div>
            ))}
          </div>
          <section className="card">
            <div className="section-heading">
              <h2>Recent company bills</h2>
            </div>
            <BillTable rows={report.recent} go={go} />
          </section>
        </>
      ) : (
        !a.error && <p>Loading company details…</p>
      )}
    </>
  );
}
