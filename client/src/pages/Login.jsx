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
export default function Login({ onLogin }) {
  const a = useAction();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  return (
    <div className="login-page">
      <div className="login-story">
        <div className="brand">
          Invoice<span>Elite</span>
        </div>
        <div>
          <div className="eyebrow">ELITE APPRENTICESHIP SERVICES</div>
          <h1>
            Better billing.
            <br />
            Clearer business.
          </h1>
          <p>
            Your companies, service bills and authorized letterheads.
            <br />
            One secure workspace.
          </p>
        </div>
        <small>Professional billing. Accountable by design.</small>
      </div>
      <div className="login-panel">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            a.run(async () =>
              onLogin(
                (
                  await api("/auth/login", {
                    method: "POST",
                    body: { email, password },
                  })
                ).user,
              ),
            );
          }}
        >
          <div className="eyebrow">WELCOME BACK</div>
          <h2>Sign in to your workspace</h2>
          <p className="muted">
            Use your administrator-provided account to continue.
          </p>
          <Notice type="error">{a.error}</Notice>
          <Field
            label="Email address"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button busy={a.busy} className="wide">
            Sign in securely →
          </Button>
          <p className="login-help">
            Access is limited to authorized team members.
            <br />
            Contact your administrator for account assistance.
          </p>
        </form>
      </div>
    </div>
  );
}
