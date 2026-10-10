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
import Letterheads from "./Letterheads";
import CompanyDetails from "./CompanyDetails";
const blankCompany = {
  name: "",
  contact: "",
  email: "",
  phone: "",
  address: "",
  identification: "",
  terms: "Payment within 30 days",
  defaultRate: 0,
  archived: false,
};
export default function Companies({ user, notify, go }) {
  const [rows, setRows] = useState([]),
    [edit, setEdit] = useState(null),
    [details, setDetails] = useState(null),
    [letterhead, setLetterhead] = useState(null),
    [search, setSearch] = useState("");
  const a = useAction();
  const load = () => a.run(async () => setRows(await api("/companies")));
  useEffect(() => {
    load();
  }, []);
  const save = (e) => {
    e.preventDefault();
    a.run(async () => {
      const {
        _id,
        createdAt,
        updatedAt,
        __v,
        activeLetterhead,
        letterheadSequence,
        issuanceSequence,
        ...data
      } = edit;
      await api("/companies" + (_id ? "/" + _id : ""), {
        method: _id ? "PUT" : "POST",
        body: data,
      });
      setEdit(null);
      setRows(await api("/companies"));
      notify("Company saved");
    });
  };
  if (letterhead)
    return (
      <Letterheads
        company={letterhead}
        user={user}
        onBack={() => {
          setLetterhead(null);
          load();
        }}
        notify={notify}
      />
    );
  if (details)
    return (
      <CompanyDetails
        id={details}
        onBack={() => setDetails(null)}
        onLetterhead={(c) => {
          setDetails(null);
          setLetterhead(c);
        }}
        go={go}
      />
    );
  return (
    <>
      <PageHeader
        eyebrow="CLIENT RELATIONSHIPS"
        title="Client companies"
        subtitle="Company profiles, agreed terms and authorized stationery."
      >
        {user.role === "admin" && (
          <button onClick={() => setEdit({ ...blankCompany })}>
            + Add company
          </button>
        )}
      </PageHeader>
      <Notice type="error">{a.error}</Notice>
      {edit && (
        <section className="card form-card">
          <div className="section-heading">
            <h2>{edit._id ? "Edit company" : "New client company"}</h2>
            <button className="secondary" onClick={() => setEdit(null)}>
              Close
            </button>
          </div>
          <form onSubmit={save}>
            <div className="form-grid">
              {[
                ["name", "Company / establishment name"],
                ["contact", "Authorized contact person"],
                ["email", "Email address"],
                ["phone", "Phone"],
                ["identification", "Company identification (optional)"],
              ].map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  required={key === "name"}
                  type={key === "email" ? "email" : "text"}
                  value={edit[key]}
                  onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
                />
              ))}
              <Field
                label="Default agreed rate"
                type="number"
                min="0"
                step="0.01"
                value={edit.defaultRate}
                onChange={(e) =>
                  setEdit({ ...edit, defaultRate: Number(e.target.value) })
                }
              />
              <Field label="Registered / billing address">
                <textarea
                  required
                  value={edit.address}
                  onChange={(e) =>
                    setEdit({ ...edit, address: e.target.value })
                  }
                />
              </Field>
              <Field label="Payment terms">
                <textarea
                  value={edit.terms}
                  onChange={(e) => setEdit({ ...edit, terms: e.target.value })}
                />
              </Field>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={edit.archived}
                onChange={(e) =>
                  setEdit({ ...edit, archived: e.target.checked })
                }
              />{" "}
              Archive company (existing records remain available)
            </label>
            <Button busy={a.busy}>Save company</Button>
          </form>
        </section>
      )}
      <section className="card">
        <div className="section-heading">
          <h2>
            Company directory <span className="count">{rows.length}</span>
          </h2>
          <input
            aria-label="Search companies"
            className="search"
            placeholder="Search company name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!rows.length ? (
          <Empty
            title={a.busy ? "Loading companies…" : "Your clients belong here"}
          >
            Add your first company, then configure its authorized letterhead.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Letterhead</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((c) =>
                    c.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((c) => (
                    <tr key={c._id}>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setDetails(c._id)}
                        >
                          {c.name}
                        </button>
                        <small>
                          {c.identification || "Client establishment"}
                        </small>
                      </td>
                      <td>
                        {c.contact || "—"}
                        <small>{c.email}</small>
                      </td>
                      <td>
                        <Badge
                          value={c.activeLetterhead ? "active" : "not uploaded"}
                        />
                      </td>
                      <td>
                        <Badge value={c.archived ? "archived" : "active"} />
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            className="small secondary"
                            onClick={() => setLetterhead(c)}
                          >
                            Letterhead
                          </button>
                          {user.role === "admin" && (
                            <button
                              className="small secondary"
                              onClick={() => setEdit(c)}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
