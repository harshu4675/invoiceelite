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
export default function Users() {
  const [users, setUsers] = useState([]),
    [companies, setCompanies] = useState([]),
    [form, setForm] = useState({
      name: "",
      email: "",
      password: "",
      role: "staff",
      companyIds: [],
    }),
    [success, setSuccess] = useState("");
  const a = useAction();
  const load = async () => {
    setUsers(await api("/users"));
    setCompanies(await api("/companies"));
  };
  useEffect(() => {
    a.run(load);
  }, []);
  return (
    <>
      <PageHeader
        title="Team & access"
        subtitle="Administrators manage configuration. Staff can bill only assigned companies."
      />
      <Notice type="error">{a.error}</Notice>
      <Notice type="success">{success}</Notice>
      <div className="dashboard-grid">
        <section className="card form-card">
          <h2>Create team account</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              a.run(async () => {
                await api("/users", { method: "POST", body: form });
                setForm({
                  name: "",
                  email: "",
                  password: "",
                  role: "staff",
                  companyIds: [],
                });
                setSuccess(
                  "Account created. Share the initial password through a secure channel.",
                );
                await load();
              });
            }}
          >
            <div className="form-grid">
              {[
                ["name", "Full name", "text"],
                ["email", "Email", "email"],
                ["password", "Initial password (12+ characters)", "password"],
              ].map(([k, l, t]) => (
                <Field
                  key={k}
                  label={l}
                  type={t}
                  minLength={k === "password" ? 12 : 2}
                  required
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              ))}
              <Field label="Role">
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="staff">Authorized staff</option>
                  <option value="admin">Administrator</option>
                </select>
              </Field>
            </div>
            <h3>Company assignments</h3>
            {companies.map((c) => (
              <label className="checkbox" key={c._id}>
                <input
                  type="checkbox"
                  checked={form.companyIds.includes(c._id)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      companyIds: e.target.checked
                        ? [...form.companyIds, c._id]
                        : form.companyIds.filter((id) => id !== c._id),
                    })
                  }
                />
                {c.name}
              </label>
            ))}
            <Button busy={a.busy}>Create account</Button>
          </form>
        </section>
        <section className="card form-card">
          <h2>Workspace members</h2>
          {users.map((u) => (
            <div className="user-row" key={u._id}>
              <strong>{u.name}</strong>
              <small>
                {u.email} · {u.role} · {u.disabled ? "Disabled" : "Active"}
              </small>
              <div className="actions">
                <button
                  className="small secondary"
                  disabled={a.busy}
                  onClick={() =>
                    a.run(async () => {
                      await api("/users/" + u._id, {
                        method: "PATCH",
                        body: {
                          companyIds: u.companyIds,
                          disabled: !u.disabled,
                        },
                      });
                      await load();
                    })
                  }
                >
                  {u.disabled ? "Enable" : "Disable"} access
                </button>
              </div>
              {u.role === "staff" && (
                <details>
                  <summary>Manage company access</summary>
                  {companies.map((c) => (
                    <label className="checkbox" key={c._id}>
                      <input
                        type="checkbox"
                        disabled={a.busy}
                        checked={u.companyIds.includes(c._id)}
                        onChange={(e) =>
                          a.run(async () => {
                            await api("/users/" + u._id, {
                              method: "PATCH",
                              body: {
                                disabled: u.disabled,
                                companyIds: e.target.checked
                                  ? [...u.companyIds, c._id]
                                  : u.companyIds.filter((id) => id !== c._id),
                              },
                            });
                            await load();
                          })
                        }
                      />
                      {c.name}
                    </label>
                  ))}
                </details>
              )}
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
