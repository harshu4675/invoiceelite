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
export default function Bills({ go }) {
  const [companies, setCompanies] = useState([]);
  useEffect(() => {
    api("/companies")
      .then(setCompanies)
      .catch((e) => setError(e.message));
  }, []);
  const [rows, setRows] = useState([]),
    [filters, setFilters] = useState({
      search: "",
      from: "",
      to: "",
      status: "",
    }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      api("/bills?" + query(filters))
        .then((r) => {
          if (live) {
            setRows(r);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [filters]);
  return (
    <>
      <PageHeader
        eyebrow="BILLING HISTORY"
        title="Service bills"
        subtitle="Draft, issue and track every bill from one place."
      >
        <button onClick={() => go("new")}>+ Create service bill</button>
      </PageHeader>
      <Notice type="error">{error}</Notice>
      <section className="card">
        <Filters
          filters={filters}
          setFilters={setFilters}
          companies={companies}
        />
        {loading ? (
          <p className="padded">Loading bills…</p>
        ) : (
          <BillTable rows={rows} go={go} />
        )}
      </section>
    </>
  );
}
