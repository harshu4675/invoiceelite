import { PDFDocument, PDFDict, PDFArray, PDFName, rgb } from "pdf-lib";
import sharp from "sharp";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs/promises";
const fontBytes = await fs.readFile(
  new URL("./fonts/DejaVuSans.ttf", import.meta.url),
);
const boldBytes = await fs.readFile(
  new URL("./fonts/DejaVuSans-Bold.ttf", import.meta.url),
);
const unicodeFont = fontkit.create(fontBytes);
function rejectActivePDF(doc) {
  const forbidden = new Set([
    "JavaScript",
    "JS",
    "OpenAction",
    "AA",
    "EmbeddedFiles",
    "Launch",
    "RichMedia",
    "XFA",
    "AcroForm",
    "Annots",
    "Filespec",
    "EmbeddedFile",
    "GoToR",
    "GoToE",
    "SubmitForm",
    "ImportData",
    "URI",
  ]);
  const seen = new Set();
  const scan = (o) => {
    if (!o || seen.has(o)) return;
    seen.add(o);
    if (o.dict instanceof PDFDict) scan(o.dict);
    if (o instanceof PDFDict) {
      for (const [k, v] of o.entries()) {
        if (
          k.decodeText() === "Annots" &&
          doc.context.lookup(v) instanceof PDFArray &&
          doc.context.lookup(v).size() === 0
        )
          continue;
        if (forbidden.has(k.decodeText()))
          throw new Error(
            "Interactive, annotated or embedded PDF content is not supported. Export a clean PDF.",
          );
        scan(v);
      }
    } else if (o instanceof PDFArray) {
      o.asArray().forEach(scan);
    } else if (o instanceof PDFName && forbidden.has(o.decodeText()))
      throw new Error("Unsafe PDF content");
  };
  for (const [, o] of doc.context.enumerateIndirectObjects()) scan(o);
}

import { defaultLayout, chargeAmountCents } from "../shared/domain.js";
export async function inspectFile(buffer) {
  let mime, width, height;
  if (buffer.subarray(0, 5).toString() === "%PDF-") {
    const raw = buffer.toString("latin1");
    if (
      /\/(JavaScript|JS|OpenAction|AA|EmbeddedFiles|Launch|RichMedia|XFA)\b/.test(
        raw,
      )
    )
      throw new Error(
        "Active PDF content is not accepted. Export a clean single-page PDF.",
      );
    const doc = await PDFDocument.load(buffer);
    if (doc.getPageCount() !== 1)
      throw new Error("Letterhead must contain exactly one page");
    rejectActivePDF(doc);
    const p = doc.getPage(0);
    if (p.getRotation().angle !== 0)
      throw new Error("Normalize rotated PDF pages before uploading");
    ({ width, height } = p.getCropBox());
    mime = "application/pdf";
  } else {
    if (!(
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    ))
      throw new Error("The file content is not PDF, PNG or JPG");
    const meta = await sharp(buffer, { limitInputPixels: 24000000 }).metadata();
    if (!["png", "jpeg"].includes(meta.format) || meta.pages > 1)
      throw new Error("Only single-page PDF, PNG or JPG is supported");
    await sharp(buffer, { limitInputPixels: 24000000 }).stats();
    if (meta.orientation && meta.orientation !== 1)
      throw new Error("Normalize image orientation before uploading");
    width = (meta.width * 72) / (meta.density || 96);
    height = (meta.height * 72) / (meta.density || 96);
    mime = meta.format === "png" ? "image/png" : "image/jpeg";
  }
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 250 ||
    height < 250 ||
    width > 2000 ||
    height > 2000
  )
    throw new Error("Page dimensions must be between 250 and 2000 points");
  return {
    mime,
    width,
    height,
    orientation: width > height ? "landscape" : "portrait",
  };
}
export function validateLayout(l, w, h) {
  if (l.left + l.right > w - 200 || l.top + l.bottom > h - 180)
    throw Object.assign(
      new Error("Margins must leave at least 200 × 180 points for content"),
      { status: 400 },
    );
  if (((w - l.left - l.right) * (1 - l.descriptionColumn)) / 3 - 8 < l.fontSize)
    throw Object.assign(
      new Error(
        "Table columns are too narrow. Reduce margins, description fraction or font size.",
      ),
      { status: 400 },
    );
  if (
    Object.values(l.positions || {}).some((y) => y > h - l.top - l.bottom - 40)
  )
    throw Object.assign(
      new Error("Section positions must stay inside the safe content area"),
      { status: 400 },
    );
}
const safe = (s) => {
  const text = String(s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "    ");
  for (const ch of text) {
    if (ch !== "\n" && !unicodeFont.hasGlyphForCodePoint(ch.codePointAt(0)))
      throw Object.assign(
        new Error(
          "The bundled PDF font does not support character " +
            ch +
            ". Use supported Latin text or configure a suitable font before issuing.",
        ),
        { status: 400 },
      );
  }
  return text;
};
export async function renderBill(bill, background) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  let w = 595.28,
    h = 841.89,
    bg;
  const l = bill.layout || defaultLayout;
  if (background) {
    w = background.width;
    h = background.height;
    if (background.mime === "application/pdf") {
      const source = await PDFDocument.load(background.bytes);
      const sourcePage = source.getPage(0);
      const box = sourcePage.getCropBox();
      bg = await doc.embedPage(sourcePage, {
        left: box.x,
        bottom: box.y,
        right: box.x + box.width,
        top: box.y + box.height,
      });
    } else
      bg =
        background.mime === "image/png"
          ? await doc.embedPng(background.bytes)
          : await doc.embedJpg(background.bytes);
  }
  validateLayout(l, w, h);
  let page, y;
  let count = 0;
  const leading = l.fontSize * l.lineSpacing;
  const newPage = () => {
    page = doc.addPage([w, h]);
    count++;
    if (bg && (count === 1 || l.repeat)) {
      if (background.mime === "application/pdf")
        page.drawPage(bg, { x: 0, y: 0, width: w, height: h });
      else page.drawImage(bg, { x: 0, y: 0, width: w, height: h });
    }
    y = h - l.top;
  };
  newPage();
  const wrap = (text, width, size, f) => {
    let lines = [];
    for (const paragraph of safe(text).split("\n")) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        if (
          f.widthOfTextAtSize((line ? line + " " : "") + word, size) > width
        ) {
          if (line) lines.push(line);
          line = "";
          for (const ch of word) {
            if (f.widthOfTextAtSize(line + ch, size) > width) {
              lines.push(line);
              line = "";
            }
            line += ch;
          }
        } else line += (line ? " " : "") + word;
      }
      lines.push(line);
    }
    return lines;
  };
  const text = (s, { strong = false, size = l.fontSize } = {}) => {
    const f = strong ? bold : font;
    for (const line of wrap(s, w - l.left - l.right, size, f)) {
      if (y - size < l.bottom + 18) newPage();
      page.drawText(line, {
        x: l.left,
        y: y - size,
        font: f,
        size,
        color: rgb(0.09, 0.17, 0.24),
      });
      y -= Math.max(leading, size * 1.3);
    }
  };
  const gap = () => {
    y -= l.sectionGap;
  };
  const position = (key) => {
    const target = h - l.top - (l.positions?.[key] || 0);
    if (l.pageBreaks?.includes(key) || y < l.bottom + 18 + leading * 3)
      newPage();
    y = Math.min(y, target);
  };
  const amount = (c) => (c / 100).toFixed(2);
  const d = bill.data;
  if (d.design === "business") {
    page.drawRectangle({
      x: 0,
      y: h - 65,
      width: w,
      height: 65,
      color: rgb(0.09, 0.21, 0.32),
    });
    page.drawText(safe(bill.businessSnapshot.name), {
      x: l.left,
      y: h - 40,
      size: 14,
      font,
      color: rgb(1, 1, 1),
    });
    page.drawRectangle({
      x: 0,
      y: h - 68,
      width: w,
      height: 3,
      color: rgb(0.83, 0.67, 0.27),
    });
  }
  position("title");
  text("SERVICE INVOICE", { strong: true, size: l.titleSize || 18 });
  position("details");
  text(`${bill.number}  |  Date: ${d.date}  |  Due: ${d.dueDate}`);
  text(`Issued by: ${bill.businessSnapshot.name}`, { strong: true });
  text(bill.businessSnapshot.address);
  if (d.design === "client")
    text(
      "Client-authorized stationery. Billing entity: " +
        bill.businessSnapshot.name +
        ".",
    );
  gap();
  position("billedTo");
  text("BILLED TO", { strong: true });
  text(bill.companySnapshot.name, { strong: true });
  if (d.recipient !== bill.companySnapshot.name)
    text("Attention: " + d.recipient);
  text(d.address);
  if (
    bill.companySnapshot.contact ||
    bill.companySnapshot.email ||
    bill.companySnapshot.phone
  )
    text(
      `Contact: ${[bill.companySnapshot.contact, bill.companySnapshot.email, bill.companySnapshot.phone].filter(Boolean).join(" | ")}`,
    );
  if (d.reference) text(`Service period / reference: ${d.reference}`);
  gap();
  position("table");
  text("SERVICE DETAILS", { strong: true });
  const contentWidth = w - l.left - l.right;
  const otherWidth = (contentWidth * (1 - l.descriptionColumn)) / 3;
  const cols = [
    l.left,
    l.left + contentWidth * l.descriptionColumn,
    l.left + contentWidth * l.descriptionColumn + otherWidth,
    l.left + contentWidth * l.descriptionColumn + otherWidth * 2,
  ];
  const widths = [
    contentWidth * l.descriptionColumn - 8,
    otherWidth - 8,
    otherWidth - 8,
    otherWidth,
  ];
  const tableHeaders = ["Item / description", "Qty", "Rate", "Amount INR"];
  const row = (cells, header = false) => {
    let lines = cells.map((c, i) =>
      wrap(c, widths[i], l.fontSize, header ? bold : font),
    );
    const n = Math.max(...lines.map((a) => a.length));
    for (let i = 0; i < n; i++) {
      if (y - leading < l.bottom + 18) {
        newPage();
        text("SERVICE DETAILS (continued)", { strong: true });
        if (!header) {
          row(tableHeaders, true);
          if (y - leading < l.bottom + 18)
            throw Object.assign(
              new Error(
                "The safe content area cannot fit the table header and a data row. Reduce font size or margins.",
              ),
              { status: 400 },
            );
        }
      }
      lines.forEach((a, j) => {
        if (a[i])
          page.drawText(a[i], {
            x: cols[j],
            y: y - l.fontSize,
            size: l.fontSize,
            font: header ? bold : font,
          });
      });
      y -= leading;
    }
    y -= 5;
  };
  row(tableHeaders, true);
  row([
    "1. " + d.description,
    d.basis === "per_candidate" ? String(d.candidates) : "1",
    d.rate.toFixed(2) + (d.basis.endsWith("percent") ? "%" : ""),
    amount(bill.feeCents),
  ]);
  for (const [i, item] of (d.charges || []).entries())
    row([
      `${i + 2}. ${item.description}`,
      String(item.quantity),
      item.rate.toFixed(2),
      amount(chargeAmountCents(item)),
    ]);
  gap();
  position("summary");
  text("CALCULATION & PAYMENT SUMMARY", { strong: true });
  text(
    `Candidates: ${d.candidates} | Stipend / DBT (information only): INR ${d.stipend.toFixed(2)}`,
  );
  text(`Establishment amount: INR ${d.establishment.toFixed(2)}`);
  text(
    `Agreed basis: ${d.basis.replaceAll("_", " ")} | Rate: ${d.rate}${d.basis.endsWith("percent") ? "%" : ""}`,
  );
  if (d.basis === "agreed_base_percent")
    text(`Explicit agreed base: INR ${d.agreedBase.toFixed(2)}`);
  text(
    `Service fee: INR ${amount(bill.feeCents)} | Other charges: INR ${d.otherCharges.toFixed(2)} | Adjustment: INR ${d.adjustment.toFixed(2)}`,
  );
  text(
    `TOTAL PAYABLE TO ${safe(bill.businessSnapshot.name).toUpperCase()}: INR ${amount(bill.totalCents)}`,
    { strong: true },
  );
  text(
    `Amount paid at issuance: INR ${amount(bill.paidCents || 0)} | Balance at issuance: INR ${amount(bill.totalCents - (bill.paidCents || 0))}`,
  );
  text(
    "Stipend / DBT is not payable to the service provider. No apprentice benefits are deducted.",
  );
  gap();
  position("terms");
  text("PAYMENT TERMS", { strong: true });
  text(d.terms);
  if (d.notes) text(d.notes);
  gap();
  position("signature");
  text("For " + bill.businessSnapshot.name, { strong: true });
  text("Authorized signatory: ____________________");
  text("Signature / stamp");
  for (const [i, p] of doc.getPages().entries())
    p.drawText(`${bill.number} | ${i + 1} / ${doc.getPageCount()}`, {
      x: l.left,
      y: l.bottom + 2,
      size: 8,
      font,
    });
  doc.setTitle(bill.number);
  doc.setCreator("InvoiceElite");
  return Buffer.from(await doc.save());
}
