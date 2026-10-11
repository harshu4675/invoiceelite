import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFDict, rgb } from "pdf-lib";
import sharp from "sharp";
import { renderBill, inspectFile, validateLayout } from "../server/pdf.js";
import { generatePDF, inspectUpload } from "../server/pdf-jobs.js";
import { defaultLayout, calculate } from "../shared/domain.js";
const data = {
  date: "2026-10-10",
  dueDate: "2026-11-10",
  recipient: "Example Company",
  address: "Example address",
  description: "Registration and administrative services",
  candidates: 3,
  stipend: 90000,
  establishment: 1234.56,
  basis: "fixed",
  agreedBase: 0,
  rate: 500,
  otherCharges: 0,
  adjustment: 0,
  terms: "30 days",
  notes: "",
  design: "plain",
};
const bill = {
  number: "EAS-000001",
  data,
  companySnapshot: { name: "Example Company", contact: "Example contact" },
  businessSnapshot: {
    name: "Elite Apprenticeship Services",
    address: "Example business address",
  },
  layout: defaultLayout,
  ...calculate(data),
};
test("PDF invoice is generated with actual text and fonts, not a flattened bitmap", async () => {
  const bytes = await renderBill(bill);
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() > 0);
  const page = doc.getPage(0);
  assert.ok(
    page.node.Resources().lookup(PDFName.of("Font"), PDFDict).keys().length,
  );
  assert.equal(page.getWidth(), 595.28);
  assert.equal(page.getHeight(), 841.89);
});
test("PDF letterhead keeps landscape dimensions and vector form background", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([842, 595]);
  page.drawRectangle({
    x: 10,
    y: 10,
    width: 822,
    height: 575,
    borderColor: rgb(1, 0, 0),
    borderWidth: 2,
  });
  const bytes = Buffer.from(await source.save());
  const info = await inspectFile(bytes);
  assert.equal(info.orientation, "landscape");
  const out = await PDFDocument.load(
    await renderBill(
      { ...bill, data: { ...data, design: "client" } },
      { ...info, bytes },
    ),
  );
  assert.equal(out.getPage(0).getWidth(), 842);
  assert.equal(out.getPage(0).getHeight(), 595);
  assert.ok(
    out
      .getPage(0)
      .node.Resources()
      .lookup(PDFName.of("XObject"), PDFDict)
      .keys().length,
  );
});
test("PNG and JPEG content are inspected and embedded without aspect-ratio changes", async () => {
  for (const format of ["png", "jpeg"]) {
    const bytes = await sharp({
      create: { width: 800, height: 1100, channels: 3, background: "#fff" },
    })
      [format]()
      .toBuffer();
    const info = await inspectFile(bytes);
    assert.equal(info.width / info.height, 800 / 1100);
    const out = await PDFDocument.load(
      await renderBill(bill, { ...info, bytes }),
    );
    assert.equal(
      out.getPage(0).getWidth() / out.getPage(0).getHeight(),
      800 / 1100,
    );
  }
});
test("malformed, multi-page, interactive and wrong-content uploads are rejected", async () => {
  for (const bytes of [
    Buffer.from("not a pdf"),
    Buffer.from("%PDF-malformed"),
    Buffer.from("<svg></svg>"),
  ])
    await assert.rejects(() => inspectFile(bytes));
  const multi = await PDFDocument.create();
  multi.addPage();
  multi.addPage();
  const multiBytes = Buffer.from(await multi.save());
  await assert.rejects(() => inspectFile(multiBytes), /exactly one page/);
  const active = await PDFDocument.create();
  active.addPage();
  active.catalog.set(
    PDFName.of("OpenAction"),
    active.context.obj({ S: "JavaScript", JS: "alert(1)" }),
  );
  const activeBytes = Buffer.from(await active.save());
  await assert.rejects(() => inspectFile(activeBytes), /content|Unsafe/);
});
test("long invoices paginate, repeat backgrounds only when configured, and retain final signature", async () => {
  const source = await PDFDocument.create();
  source.addPage().drawRectangle({ x: 0, y: 0, width: 20, height: 20 });
  const bytes = Buffer.from(await source.save());
  const info = await inspectFile(bytes);
  const b = {
    ...bill,
    data: {
      ...data,
      description:
        "Administrative services and candidate registration. ".repeat(500),
    },
  };
  for (const repeat of [true, false]) {
    const out = await PDFDocument.load(
      await renderBill(
        { ...b, layout: { ...defaultLayout, repeat } },
        { ...info, bytes },
      ),
    );
    assert.ok(out.getPageCount() > 2);
    const backgrounds = out
      .getPages()
      .map(
        (p) =>
          p.node.Resources().lookup(PDFName.of("XObject"), PDFDict)?.keys()
            .length || 0,
      );
    assert.ok(backgrounds[0]);
    assert.equal(backgrounds[1] > 0, repeat);
  }
});
test("unsafe margins, section positions, and unsupported glyphs fail visibly", async () => {
  assert.throws(() => validateLayout({ ...defaultLayout, top: 800 }, 595, 842));
  assert.throws(() =>
    validateLayout({ ...defaultLayout, positions: { title: 900 } }, 595, 842),
  );
  await assert.rejects(
    () => renderBill({ ...bill, data: { ...data, recipient: "Example 🦄" } }),
    /does not support/,
  );
});
test("PDF worker validates uploads and returns a readable invoice", async () => {
  const bytes = await generatePDF(bill);
  assert.equal((await PDFDocument.load(bytes)).getPageCount() > 0, true);
  const info = await inspectUpload(
    await sharp({
      create: { width: 800, height: 1100, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer(),
  );
  assert.equal(info.mime, "image/png");
});

test("independent PDF reader can search text, totals and signature on the final page", async () => {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(
      await renderBill({
        ...bill,
        data: {
          ...data,
          description: "Services actually provided. ".repeat(200),
        },
      }),
    ),
    useSystemFonts: false,
  });
  const doc = await task.promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!item.str) continue;
      assert.ok(item.transform[4] >= defaultLayout.left - 1);
      assert.ok(
        item.transform[4] + item.width <= 595.28 - defaultLayout.right + 1,
        "Text exceeds right margin: " + item.str,
      );
      assert.ok(
        item.transform[5] >= defaultLayout.bottom - 1,
        "Text is clipped below safe area",
      );
    }
    text += content.items.map((x) => x.str || "").join(" ");
  }
  assert.match(
    text,
    /TOTAL PAYABLE TO ELITE APPRENTICESHIP SERVICES: INR 500.00/,
  );
  assert.match(text, /90000.00/);
  assert.match(text, /Authorized signatory/);
  const last = await (await doc.getPage(doc.numPages)).getTextContent();
  assert.match(
    last.items.map((x) => x.str || "").join(" "),
    /Signature \/ stamp/,
  );
});

test("explicit section page breaks and custom crop-box dimensions are respected", async () => {
  const source = await PDFDocument.create();
  const p = source.addPage([700, 1000]);
  p.setCropBox(20, 40, 600, 850);
  p.drawRectangle({ x: 30, y: 50, width: 500, height: 700 });
  const bytes = Buffer.from(await source.save());
  const info = await inspectFile(bytes);
  assert.equal(info.width, 600);
  assert.equal(info.height, 850);
  const output = await PDFDocument.load(
    await renderBill(
      { ...bill, layout: { ...defaultLayout, pageBreaks: ["signature"] } },
      { ...info, bytes },
    ),
  );
  assert.equal(output.getPage(0).getWidth(), 600);
  assert.ok(output.getPageCount() >= 2);
});

test("itemized charges remain searchable and reconcile to the invoice total", async () => {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const d = {
    ...data,
    charges: [
      {
        description: "Authorized document handling",
        quantity: 1.5,
        rate: 10.01,
      },
    ],
    otherCharges: 15.02,
    notes: "Agreed additional administrative work",
  };
  const doc = await getDocument({
    data: new Uint8Array(
      await renderBill({ ...bill, data: d, ...calculate(d) }),
    ),
    useSystemFonts: false,
  }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++)
    text += (await (await doc.getPage(i)).getTextContent()).items
      .map((x) => x.str || "")
      .join(" ");
  assert.match(text, /2. Authorized document handling/);
  assert.match(text, /15.02/);
  assert.match(
    text,
    /TOTAL PAYABLE TO ELITE APPRENTICESHIP SERVICES: INR 515.02/,
  );
});
