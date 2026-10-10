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
export default function Audit() {
  const [rows, setRows] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    api("/audit")
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <PageHeader
        title="Audit trail"
        subtitle="The latest 100 significant configuration and billing actions."
      />
      <Notice type="error">{error}</Notice>
      <section className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.actor?.name || "System"}</td>
                  <td>{r.action}</td>
                  <td>
                    <code>{r.entityId}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
