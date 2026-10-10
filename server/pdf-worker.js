import { parentPort, workerData } from "node:worker_threads";
import { inspectFile, renderBill } from "./pdf.js";
try {
  const result =
    workerData.operation === "inspect"
      ? await inspectFile(Buffer.from(workerData.bytes))
      : await renderBill(
          workerData.bill,
          workerData.background
            ? {
                ...workerData.background,
                bytes: Buffer.from(workerData.background.bytes),
              }
            : undefined,
        );
  parentPort.postMessage({ result });
} catch (e) {
  parentPort.postMessage({ error: e.message, status: e.status || 400 });
}
