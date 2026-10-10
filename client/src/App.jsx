import React, { useState, useEffect } from "react";
import { api } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Companies from "./pages/Companies";
import BillForm from "./pages/BillForm";
import Bills from "./pages/Bills";
import BillDetail from "./pages/BillDetail";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import Audit from "./pages/Audit";
import Account from "./pages/Account";
const nav = [
  ["dashboard", "◫", "Overview"],
  ["companies", "▤", "Client companies"],
  ["bills", "▧", "Service bills"],
  ["reports", "↗", "Reports"],
  ["users", "♙", "Team & access"],
  ["audit", "◷", "Audit trail"],
  ["account", "⚙", "My account"],
];
export default function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState("dashboard"),
    [selected, setSelected] = useState(null),
    [notice, setNotice] = useState("");
  useEffect(() => {
    api("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setLoading(false));
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  const go = (p, id = null) => {
    setPage(p);
    setSelected(id);
    setNotice("");
  };
  const notify = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 6000);
  };
  if (loading)
    return <div className="loading-screen">Loading InvoiceElite…</div>;
  if (!user)
    return (
      <Login
        onLogin={(u) => {
          go("dashboard");
          setUser(u);
        }}
      />
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" onClick={() => go("dashboard")}>
          <span className="brand-mark">
            E<span>✦</span>
          </span>
          <div>
            Invoice<span>Elite</span>
            <small>ELITE APPRENTICESHIP SERVICES</small>
          </div>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {nav
            .filter(
              ([p]) => user.role === "admin" || !["users", "audit"].includes(p),
            )
            .map(([p, icon, label]) => (
              <button
                key={p}
                className={
                  page === p ||
                  (p === "bills" && ["new", "detail"].includes(page))
                    ? "active"
                    : ""
                }
                onClick={() => go(p)}
              >
                <span>{icon}</span>
                {label}
                {p === "bills" && <i>↗</i>}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-label">
            ◈ &nbsp; Private business workspace
          </div>
          <div className="profile">
            <div className="avatar">{user.name[0]}</div>
            <div>
              <strong>{user.name}</strong>
              <small>
                {user.role === "admin" ? "Administrator" : "Authorized staff"}
              </small>
            </div>
            <button
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                try {
                  await api("/auth/logout", { method: "POST" });
                  setUser(null);
                } catch (e) {
                  notify(e.message);
                }
              }}
            >
              ↪
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span>
            Elite Apprenticeship Services <span className="divider">/</span>{" "}
            <strong>Billing workspace</strong>
          </span>
          <button
            className="text-button mobile-logout"
            onClick={async () => {
              try {
                await api("/auth/logout", { method: "POST" });
                setUser(null);
              } catch (e) {
                notify(e.message);
              }
            }}
          >
            Sign out
          </button>
          <span className="top-date">
            {new Date().toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </header>
        <main>
          {notice && (
            <div className="toast" role="status">
              ✓ {notice}
            </div>
          )}
          {page === "dashboard" && <Dashboard go={go} />}
          {page === "companies" && (
            <Companies user={user} notify={notify} go={go} />
          )}
          {page === "bills" && <Bills go={go} />}
          {page === "new" && <BillForm id={selected} go={go} notify={notify} />}
          {page === "detail" && (
            <BillDetail id={selected} go={go} user={user} notify={notify} />
          )}
          {page === "reports" && <Reports />}
          {page === "users" && <Users />}
          {page === "audit" && <Audit />}
          {page === "account" && (
            <Account
              user={user}
              onPasswordChanged={() => {
                go("dashboard");
                setUser(null);
              }}
            />
          )}
        </main>
        <footer>
          InvoiceElite <span>•</span> Built for clear, accountable billing{" "}
          <span className="footer-right">Elite Apprenticeship Services</span>
        </footer>
      </div>
    </div>
  );
}
