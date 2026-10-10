import React, { useState, useRef, useId } from "react";
import { currency } from "../api";
export function Field({ label, children, hint, ...props }) {
  const id = useId();
  const hintId = id + "-hint";
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children ? (
        React.cloneElement(children, {
          id,
          "aria-describedby": hint ? hintId : undefined,
        })
      ) : (
        <input
          {...props}
          id={id}
          aria-describedby={hint ? hintId : undefined}
        />
      )}
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  );
}
export function Notice({ children, type = "info" }) {
  return children ? (
    <div
      role={type === "error" ? "alert" : "status"}
      className={"notice " + type}
    >
      {children}
    </div>
  ) : null;
}
export function Badge({ value }) {
  return (
    <span className={"badge " + value?.replaceAll(" ", "-")}>{value}</span>
  );
}
export function Empty({ title, children }) {
  return (
    <div className="empty">
      <span>▧</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Button({ busy, children, ...p }) {
  return (
    <button disabled={busy || p.disabled} {...p}>
      {busy ? "Working…" : children}
    </button>
  );
}
export function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}
export function PDFView({ url, title = "Invoice preview" }) {
  const frame = useRef();
  return (
    <div className="pdf-view">
      <div className="preview-toolbar">
        <strong>{title}</strong>
        <div className="actions">
          <a
            className="button small secondary"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            Open PDF
          </a>
          <a
            className="button small secondary"
            href={
              url.startsWith("blob:")
                ? url
                : url + (url.includes("?") ? "&" : "?") + "download=1"
            }
            download
          >
            Download
          </a>
          <button
            type="button"
            className="small"
            onClick={() => {
              try {
                frame.current.contentWindow.focus();
                frame.current.contentWindow.print();
              } catch {
                window.open(url, "_blank", "noopener");
              }
            }}
          >
            Print
          </button>
        </div>
      </div>
      <iframe ref={frame} src={url} title={title} />
    </div>
  );
}
export function PageHeader({
  eyebrow = "WORKSPACE",
  title,
  subtitle,
  children,
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function BillTable({ rows, go }) {
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Bill / client company</th>
            <th>Bill date</th>
            <th>Status</th>
            <th className="numeric">Payable</th>
            <th className="numeric">Outstanding</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b._id}>
              <td>
                <button
                  className="text-button"
                  onClick={() => go("detail", b._id)}
                >
                  {b.number}
                </button>
                <small>{b.companySnapshot.name}</small>
              </td>
              <td>{b.data.date}</td>
              <td>
                <Badge value={b.displayStatus} />
              </td>
              <td className="numeric">{currency(b.totalCents)}</td>
              <td className="numeric">{currency(b.outstandingCents)}</td>
              <td>
                <button
                  className="icon-button"
                  aria-label={"View " + b.number}
                  onClick={() => go("detail", b._id)}
                >
                  ↗
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty title="No bills to show">
      Create a service bill to start your billing history.
    </Empty>
  );
}
export function Filters({ filters, setFilters, companies }) {
  return (
    <div className="filters">
      <Field label="Search">
        <input
          placeholder="Bill number or company…"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
      </Field>
      <Field
        label="From"
        type="date"
        value={filters.from}
        onChange={(e) => setFilters({ ...filters, from: e.target.value })}
      />
      <Field
        label="To"
        type="date"
        value={filters.to}
        onChange={(e) => setFilters({ ...filters, to: e.target.value })}
      />
      {companies && (
        <Field label="Company">
          <select
            value={filters.companyId || ""}
            onChange={(e) =>
              setFilters({ ...filters, companyId: e.target.value })
            }
          >
            <option value="">All permitted companies</option>
            {companies.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Status">
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">All statuses</option>
          {[
            "draft",
            "issued",
            "partially paid",
            "paid",
            "overdue",
            "cancelled",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}
export const query = (f) =>
  new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
