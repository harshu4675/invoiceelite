import React, { useState } from "react";
import { api } from "../api";
import { Field, Notice, PageHeader, Button, useAction } from "../components/UI";
import { passwordInput } from "../../../shared/domain";
export default function Account({ user, onPasswordChanged }) {
  const [currentPassword, setCurrentPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const a = useAction();
  return (
    <>
      <PageHeader
        eyebrow="ACCOUNT SECURITY"
        title="My account"
        subtitle={`${user.name} · ${user.role === "admin" ? "Administrator" : "Authorized staff"}`}
      />
      <section className="card form-card account-card">
        <h2>Change your password</h2>
        <Notice>
          Changing your password signs out all current sessions, including this
          one. You will return to the sign-in screen. Use a unique password
          stored in a password manager.
        </Notice>
        <Notice type="error">{a.error}</Notice>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            a.run(async () => {
              const result = passwordInput.safeParse(newPassword);
              if (!result.success)
                throw new Error(
                  result.error.issues.map((i) => i.message).join("; "),
                );
              if (newPassword !== confirmation)
                throw new Error("New password and confirmation do not match");
              await api("/auth/password", {
                method: "POST",
                body: { currentPassword, newPassword },
              });
              setCurrentPassword("");
              setNewPassword("");
              setConfirmation("");
              onPasswordChanged();
            });
          }}
        >
          <Field
            label="Current password"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            hint="At least 12 characters; maximum 72 UTF-8 bytes."
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Field
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <Button busy={a.busy}>Change password & sign out</Button>
        </form>
      </section>
    </>
  );
}
