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
export default function Letterheads({ company, user, onBack, notify }) {
  const [versions, setVersions] = useState([]),
    [current, setCurrent] = useState(company.activeLetterhead),
    [selected, setSelected] = useState(null),
    [file, setFile] = useState(null),
    [localUrl, setLocalUrl] = useState(""),
    [authorized, setAuthorized] = useState(false),
    [layout, setLayout] = useState(null),
    [preview, setPreview] = useState("");
  const a = useAction();
  const load = async () => {
    const vs = await api(`/companies/${company._id}/letterheads`);
    setVersions(vs);
    if (!selected && vs.length) {
      const v = vs.find((v) => v._id === current) || vs[0];
      setSelected(v);
      setLayout(v.layout);
    }
  };
  useEffect(() => {
    a.run(load);
  }, []);
  useEffect(() => {
    if (!file) {
      setLocalUrl("");
      return;
    }
    const u = URL.createObjectURL(file);
    setLocalUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    if (!selected || !layout) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api(`/companies/${company._id}/letterheads/${selected._id}/preview`, {
        method: "POST",
        body: layout,
        blob: true,
      })
        .then((b) => {
          if (!cancelled) {
            a.setError("");
            setPreview(URL.createObjectURL(b));
          }
        })
        .catch((e) => {
          if (!cancelled) a.setError(e.message);
        });
    }, 650);
    return () => {
      clearTimeout(t);
      cancelled = true;
    };
  }, [selected, layout]);
  const base = `/companies/${company._id}`;
  return (
    <>
      <button className="text-button back" onClick={onBack}>
        ← Client companies
      </button>
      <PageHeader
        eyebrow="COMPANY LETTERHEAD"
        title={company.name}
        subtitle="Original stationery. Versioned layouts. Protected billing history."
      />
      <Notice type="error">{a.error}</Notice>
      <Notice>
        Only upload stationery you are authorized to use. Using a client
        letterhead does not make the client the invoice issuer. Files are
        private; replacing or removing the active version does not alter issued
        bills.
      </Notice>
      <div className="letterhead-grid">
        <section className="card form-card">
          <h2>Company letterhead</h2>
          {!current && (
            <Notice>
              No active letterhead. Upload, preview and activate an authorized
              version before creating letterhead-based bills.
            </Notice>
          )}
          {user.role === "admin" && (
            <>
              <div className="upload-box">
                <div>⇧</div>
                <strong>Upload authorized stationery</strong>
                <p>Single-page PDF, PNG or JPG · Maximum 10 MB</p>
                <input
                  aria-label="Letterhead file"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={(e) => setFile(e.target.files[0] || null)}
                />
              </div>
              {localUrl &&
                (file.type === "application/pdf" ? (
                  <iframe
                    className="file-preview"
                    src={localUrl}
                    title="Upload preview"
                  />
                ) : (
                  <img
                    className="file-preview"
                    src={localUrl}
                    alt="Uploaded letterhead preview"
                  />
                ))}
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={authorized}
                  onChange={(e) => setAuthorized(e.target.checked)}
                />{" "}
                I am authorized to use this company's letterhead for invoices
                issued by Elite Apprenticeship Services.
              </label>
              <div className="actions">
                <Button
                  busy={a.busy}
                  disabled={!file || !authorized}
                  onClick={() =>
                    a.run(async () => {
                      const f = new FormData();
                      f.append("file", file);
                      f.append("authorized", "true");
                      const v = await api(base + "/letterheads", {
                        method: "POST",
                        body: f,
                      });
                      setSelected(v);
                      setLayout(v.layout);
                      setFile(null);
                      await load();
                      notify(
                        "Letterhead uploaded. Preview and activate when ready.",
                      );
                    })
                  }
                >
                  Upload new version
                </Button>
                {current && (
                  <button
                    className="secondary"
                    disabled={a.busy}
                    onClick={() =>
                      a.run(async () => {
                        await api(base + "/letterhead", { method: "DELETE" });
                        setCurrent(null);
                        notify(
                          "Active letterhead removed. Historical versions retained.",
                        );
                      })
                    }
                  >
                    Remove active
                  </button>
                )}
              </div>
            </>
          )}
          <hr />
          <Field label="Saved letterhead version">
            <select
              value={selected?._id || ""}
              onChange={(e) => {
                const v = versions.find((v) => v._id === e.target.value);
                setSelected(v);
                setLayout(v.layout);
              }}
            >
              <option value="" disabled>
                Select a version
              </option>
              {versions.map((v) => (
                <option key={v._id} value={v._id}>
                  v{v.version} — {v.originalName}{" "}
                  {v._id === current ? "(active)" : ""}
                </option>
              ))}
            </select>
          </Field>
          {selected && (
            <>
              <div className="metadata">
                <span>
                  Page size
                  <strong>
                    {selected.width.toFixed(1)} × {selected.height.toFixed(1)}{" "}
                    pt
                  </strong>
                </span>
                <span>
                  Orientation<strong>{selected.orientation}</strong>
                </span>
                <span>
                  Uploaded
                  <strong>
                    {new Date(selected.createdAt).toLocaleDateString()}
                  </strong>
                </span>
                <span>
                  Version
                  <strong>
                    v{selected.version} ·{" "}
                    {selected._id === current ? "Active" : "Inactive"}
                  </strong>
                </span>
              </div>
              <a
                className="button secondary"
                href={"/api" + base + `/letterheads/${selected._id}/file`}
                target="_blank"
                rel="noreferrer"
              >
                Preview original letterhead ↗
              </a>
              {user.role === "admin" && (
                <>
                  <h3>Letterhead layout editor</h3>
                  <p className="muted">
                    Coordinates are in points (72 pt = 1 inch). The preview
                    updates as you adjust. Content flows safely within these
                    margins.
                  </p>
                  <div className="form-grid compact">
                    {[
                      ["top", "Top margin / title Y"],
                      ["bottom", "Bottom safe area"],
                      ["left", "Left content margin"],
                      ["right", "Right content margin"],
                      ["fontSize", "Body font size"],
                      ["titleSize", "Title font size"],
                      ["lineSpacing", "Line spacing"],
                      ["sectionGap", "Section spacing"],
                      ["descriptionColumn", "Description column fraction"],
                    ].map(([key, label]) => (
                      <Field
                        label={label}
                        key={key}
                        type="number"
                        step={
                          ["lineSpacing", "descriptionColumn"].includes(key)
                            ? ".05"
                            : "1"
                        }
                        value={layout[key]}
                        onChange={(e) =>
                          setLayout({
                            ...layout,
                            [key]: Number(e.target.value),
                          })
                        }
                      />
                    ))}
                  </div>
                  <h3>Section positions</h3>
                  <p className="muted">
                    Minimum vertical offset from the top content margin. Zero
                    uses automatic flow. Content moves down automatically to
                    prevent overlaps; long sections paginate.
                  </p>
                  <div className="form-grid compact">
                    {[
                      ["title", "Invoice title"],
                      ["details", "Bill number & dates"],
                      ["billedTo", "Billed-to section"],
                      ["table", "Service details table"],
                      ["summary", "Candidate & payment summary"],
                      ["terms", "Payment terms"],
                      ["signature", "Signature & stamp area"],
                    ].map(([key, label]) => (
                      <Field
                        key={key}
                        label={label + " Y offset"}
                        type="number"
                        min="0"
                        value={layout.positions?.[key] || 0}
                        onChange={(e) =>
                          setLayout({
                            ...layout,
                            positions: {
                              ...layout.positions,
                              [key]: Number(e.target.value),
                            },
                          })
                        }
                      />
                    ))}
                  </div>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={layout.repeat}
                      onChange={(e) =>
                        setLayout({ ...layout, repeat: e.target.checked })
                      }
                    />{" "}
                    Repeat letterhead on continuation pages
                  </label>
                  <h3>Explicit page breaks</h3>
                  <p className="muted">
                    Start selected sections on a new page. Automatic pagination
                    still protects long content.
                  </p>
                  <div className="form-grid">
                    {[
                      "details",
                      "billedTo",
                      "table",
                      "summary",
                      "terms",
                      "signature",
                    ].map((key) => (
                      <label className="checkbox" key={key}>
                        <input
                          type="checkbox"
                          checked={layout.pageBreaks?.includes(key) || false}
                          onChange={(e) =>
                            setLayout({
                              ...layout,
                              pageBreaks: e.target.checked
                                ? [...(layout.pageBreaks || []), key]
                                : (layout.pageBreaks || []).filter(
                                    (k) => k !== key,
                                  ),
                            })
                          }
                        />
                        {key.replace("billedTo", "Billed to")}
                      </label>
                    ))}
                  </div>
                  <div className="actions">
                    <Button
                      busy={a.busy}
                      onClick={() =>
                        a.run(async () => {
                          const v = await api(
                            base + `/letterheads/${selected._id}/layout`,
                            { method: "POST", body: layout },
                          );
                          setSelected(v);
                          setLayout(v.layout);
                          await load();
                          notify(
                            "Layout saved as a new immutable version. Activate to use.",
                          );
                        })
                      }
                    >
                      Save layout as new version
                    </Button>
                    <Button
                      className="secondary"
                      busy={a.busy}
                      disabled={!authorized || selected._id === current}
                      onClick={() =>
                        a.run(async () => {
                          if (
                            JSON.stringify(layout) !==
                            JSON.stringify(selected.layout)
                          )
                            throw new Error(
                              "Save the changed layout before activation",
                            );
                          await api(
                            base + `/letterheads/${selected._id}/activate`,
                            { method: "POST", body: { authorized } },
                          );
                          setCurrent(selected._id);
                          notify("Letterhead activated");
                        })
                      }
                    >
                      Activate selected version
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
        <section>
          {preview ? (
            <PDFView url={preview} title="Live layout preview" />
          ) : (
            <div className="card">
              <Empty title="Your letterhead, your layout">
                Upload a letterhead to preview sample invoice content.
              </Empty>
            </div>
          )}
          <p className="muted">
            The preview uses sample content. Review every actual bill before
            issuance. Ensure the safe content area avoids printed logos, footers
            and watermarks.
          </p>
        </section>
      </div>
    </>
  );
}
