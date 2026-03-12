import fs from "node:fs/promises";
import http from "node:http";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const docsDir = path.join(repoRoot, "docs");
const jsxPath = path.join(docsDir, "groupgo-voter-flow.jsx");
const htmlPath = path.join(docsDir, "groupgo-voter-flow-render.html");
const outputDir = path.join(docsDir, "groupgo-voter-flow-images");

const screenIds = [
  "secure-entry",
  "secure-entry-wrong-pin",
  "preview-mode",
  "zero-yes-preview",
  "active-voting",
  "countdown-normal",
  "countdown-urgent",
  "change-vote",
  "trailer-expanded",
  "flexible-mode",
  "flexible-mode-on",
  "leave-confirm",
  "opted-out",
  "toast-no-movie",
  "toast-no-showtime",
  "toast-both-missing",
  "showtimes-submitted",
  "results-no-votes",
  "results-others-voted",
  "results-all-voted",
  "results-review",
  "results-preview",
  "results-poll-closed",
  "no-active-poll",
  "vote-submitted",
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    console.error("Missing dependency: playwright");
    console.error("Install it with: npm install --save-dev playwright");
    throw error;
  }
}

async function ensureFileExists(targetPath) {
  try {
    await fs.access(targetPath);
  } catch {
    throw new Error(`Required file not found: ${targetPath}`);
  }
}

async function readScreenLabels() {
  const source = await fs.readFile(jsxPath, "utf8");
  const match = source.match(/const screenLabels = \{([\s\S]*?)\};/);
  if (!match) {
    throw new Error("Could not find `screenLabels` in groupgo-voter-flow.jsx");
  }

  const labels = {};
  const entryPattern = /"([^"]+)":\s*"([^"]+)"/g;
  let entry = entryPattern.exec(match[1]);
  while (entry) {
    labels[entry[1]] = entry[2];
    entry = entryPattern.exec(match[1]);
  }

  return labels;
}

async function startStaticServer(rootDirectory) {
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/groupgo-voter-flow-render.html" : requestUrl.pathname);
      const targetPath = path.normalize(path.join(rootDirectory, pathname));

      if (!targetPath.startsWith(rootDirectory)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      await fs.access(targetPath);
      const extension = path.extname(targetPath);
      response.writeHead(200, { "Content-Type": MIME_TYPES[extension] || "application/octet-stream" });
      createReadStream(targetPath).pipe(response);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine local render server address.");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

async function main() {
  await ensureFileExists(htmlPath);
  await ensureFileExists(jsxPath);
  await fs.mkdir(outputDir, { recursive: true });

  const screenLabels = await readScreenLabels();
  const server = await startStaticServer(docsDir);

  const { chromium } = await importPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
  });

  page.on("console", message => {
    if (message.type() === "error") {
      console.error(`[browser] ${message.text()}`);
    }
  });

  try {
    await page.goto(`${server.origin}/groupgo-voter-flow-render.html`, { waitUntil: "networkidle" });

    for (const screenId of screenIds) {
      const label = screenLabels[screenId];
      if (!label) {
        throw new Error(`Missing screen label for ${screenId}`);
      }

      await page.getByText(label, { exact: true }).click();
      await page.waitForTimeout(150);

      const phoneFrame = page.locator("div").filter({ has: page.getByText("9:41", { exact: true }) }).first();
      await phoneFrame.screenshot({
        path: path.join(outputDir, `${screenId}.png`),
        animations: "disabled",
      });

      console.log(`Rendered ${screenId}.png`);
    }

    console.log(`Done. Images saved to ${outputDir}`);
  } finally {
    await browser.close();
    await server.close();
  }
 }

 main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
