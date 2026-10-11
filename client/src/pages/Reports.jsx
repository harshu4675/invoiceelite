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
export default function Reports() {
  const [companies, setCompanies] = useState([]);
  useEffect(() => {
    api("/companies")
      .then(setCompanies)
      .catch((e) => setError(e.message));
  }, []);
  const [filters, setFilters] = useState({
      search: "",
      from: "",
      to: "",
      status: "",
    }),
    [r, setR] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const t = setTimeout(
      () =>
        api("/reports?" + query(filters))
          .then((v) => {
            if (live) {
              setR(v);
              setError("");
            }
          })
          .catch((e) => {
            if (live) setError(e.message);
          }),
      250,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [filters]);
  return (
    <>
      <PageHeader
        eyebrow="BUSINESS INSIGHTS"
        title="Billing reports"
        subtitle="Reconciled totals from issued bills and recorded payments."
      >
        <a className="button" href={"/api/reports.csv?" + query(filters)}>
          ↓ Export CSV
        </a>
      </PageHeader>
      <Notice type="error">{error}</Notice>
      <section className="card">
        <Filters
          filters={filters}
          setFilters={setFilters}
          companies={companies}
        />
      </section>
      <Notice>
        Date filters apply to bill dates. Collections below are all payments
        received against those bills, not cash receipts by payment date. Draft
        and cancelled bills are excluded from financial totals.
      </Notice>
      {r && (
        <>
          <div className="stats three">
            {[
              ["Service fees", r.serviceCents],
              ["Collected payments", r.collectedCents],
              ["Outstanding", r.outstandingCents],
            ].map(([k, v]) => (
              <div className="stat" key={k}>
                <span>{k}</span>
                <strong>{currency(v)}</strong>
              </div>
            ))}
          </div>
          <section className="card">
            <div className="section-heading">
              <h2>Company-wise summary</h2>
            </div>
            {r.companies.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th className="numeric">Billed</th>
                      <th className="numeric">Collected</th>
                      <th className="numeric">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.companies.map((c, i) => (
                      <tr key={i}>
                        <td>{c.name}</td>
                        <td className="numeric">{currency(c.billedCents)}</td>
                        <td className="numeric">
                          {currency(c.collectedCents)}
                        </td>
                        <td className="numeric">
                          {currency(c.outstandingCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No issued bills in this range">
                Adjust the filters or issue your first bill.
              </Empty>
            )}
          </section>
        </>
      )}
    </>
  );
}
