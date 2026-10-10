import { defineConfig } from "@playwright/test";
import chromium from "@sparticuz/chromium";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";
// Test-only Linux browser bundle. Supply a local browser path on other platforms.
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const env = { ...process.env };
if (!executablePath && process.platform === "linux") {
  executablePath = await chromium.executablePath();
  const libs = path.join(os.tmpdir(), "invoiceelite-browser-libs");
  fs.mkdirSync(libs, { recursive: true });
  if (!fs.existsSync(path.join(libs, "lib/libnspr4.so"))) {
    const archive = fs.readFileSync(
      new URL(
        "./node_modules/@sparticuz/chromium/bin/al2023.tar.br",
        import.meta.url,
      ),
    );
    execFileSync("tar", ["-xf", "-", "-C", libs], {
      input: brotliDecompressSync(archive),
    });
  }
  env.LD_LIBRARY_PATH =
    path.join(libs, "lib") +
    (env.LD_LIBRARY_PATH ? ":" + env.LD_LIBRARY_PATH : "");
}
export default defineConfig({
  testDir: "tests/ui",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    launchOptions: {
      executablePath,
      env,
      args:
        process.platform === "linux"
          ? chromium.args.filter(
              (a) =>
                ![
                  "--single-process",
                  "--disable-web-security",
                  "--allow-running-insecure-content",
                ].includes(a),
            )
          : [],
    },
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npm run client:dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
  reporter: "list",
});
