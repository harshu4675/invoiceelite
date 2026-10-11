import { Worker } from "node:worker_threads";
let active = 0;
function run(data) {
  if (active >= 4)
    return Promise.reject(
      Object.assign(
        new Error("Document processing is busy. Please try again shortly."),
        { status: 429 },
      ),
    );
  active++;
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./pdf-worker.js", import.meta.url), {
      workerData: data,
      resourceLimits: { maxOldGenerationSizeMb: 192 },
    });
    let done = false;
    const finish = (err, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      active--;
      worker.terminate();
      err ? reject(err) : resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish(
          Object.assign(
            new Error("Document processing timed out. Use a simpler document."),
            { status: 400 },
          ),
        ),
      20000,
    );
    worker.once("message", (m) =>
      m.error
        ? finish(Object.assign(new Error(m.error), { status: m.status }))
        : finish(null, m.result),
    );
    worker.once("error", () =>
      finish(
        Object.assign(new Error("Document could not be processed safely"), {
          status: 400,
        }),
      ),
    );
    worker.once("exit", (code) => {
      if (!done)
        finish(
          Object.assign(new Error("Document processing stopped"), {
            status: 400,
          }),
        );
    });
  });
}
export const inspectUpload = (bytes) => run({ operation: "inspect", bytes });
export const generatePDF = async (bill, background) =>
  Buffer.from(
    await run({
      operation: "render",
      bill: JSON.parse(JSON.stringify(bill)),
      background,
    }),
  );
