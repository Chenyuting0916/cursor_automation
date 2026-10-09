import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.mjs";

const ID = "11111111-1111-4111-8111-111111111111";
const outDir = "/opt/cursor/artifacts/screenshots";

function cursorFixture() {
  return createServer((req, res) => {
    const auth = req.headers.authorization || "";
    const json = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/auth/exchange_user_api_key") {
      if (auth !== "Bearer key_valid_example") return json(401, { message: "nope" });
      return json(200, { accessToken: "session-token" });
    }
    if (auth !== "Bearer session-token") return json(401, { code: "unauthenticated", message: "Error" });
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      if (req.url.endsWith("/GetMe")) return json(200, { user: { name: "Ada", email: "ada@example.com" } });
      if (req.url.endsWith("/GetTeams")) return json(200, { teams: [] });
      if (req.url.endsWith("/ListAutomations")) {
        return json(200, {
          automations: [
            {
              workflow: {
                name: "每日摘要",
                enabled: true,
                automationId: ID,
                description: "每個工作日早上整理變更",
                scope: "AUTOMATION_SCOPE_USER",
                updatedAt: Math.floor(Date.now() / 1000) - 3600,
                workflow: {
                  model: "auto",
                  triggers: [{ cron: { cron: "0 9 * * 1-5" } }],
                  actions: [{ slack: { channels: ["#dev"] } }],
                  prompts: [{ prompt: "摘要昨天合併的 pull request，並標出需要看的風險。" }],
                  gitConfig: { repo: "github.com/octo/repo", branch: "main" },
                },
              },
              ownerName: "Ada",
            },
            {
              workflow: {
                name: "PR 審查",
                enabled: false,
                automationId: "22222222-2222-4222-8222-222222222222",
                workflow: {
                  triggers: [{ git: { pullRequest: { repos: ["octo/repo"], prAction: "GIT_PULL_REQUEST_ACTION_OPENED" } } }],
                  prompts: [{ prompt: "審查新的 pull request" }],
                },
              },
              ownerName: "Ada",
            },
          ],
        });
      }
      if (req.url.endsWith("/GetAutomation")) {
        return json(200, {
          workflow: {
            workflow: {
              name: body.automationId === ID ? "每日摘要" : "PR 審查",
              enabled: body.automationId === ID,
              automationId: body.automationId,
              description: "每個工作日早上整理變更",
              scope: "AUTOMATION_SCOPE_USER",
              workflow: {
                model: "auto",
                memoryEnabled: true,
                triggers: [{ cron: { cron: "0 9 * * 1-5" } }, { webhook: {} }],
                actions: [{ slack: { channels: ["#dev"] } }],
                prompts: [{ prompt: "摘要昨天合併的 pull request，並標出需要看的風險。" }],
                gitConfig: { repo: "github.com/octo/repo", branch: "main" },
              },
            },
            ownerName: "Ada",
          },
        });
      }
      if (req.url.endsWith("/ListAutomationRuns")) {
        return json(200, {
          runs: [
            { runId: "run-1", status: "FINISHED", name: "早上那次", createdAt: Date.now() - 3600_000, bcId: "bc-demo" },
            { runId: "run-2", status: "ERROR", name: "失敗的一次", createdAt: Date.now() - 7200_000 },
          ],
        });
      }
      json(404, { message: "missing" });
    });
  });
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

async function connectChrome() {
  const dir = await mkdtemp(join(tmpdir(), "chrome-automations-"));
  const chrome = spawn("google-chrome", [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--remote-debugging-port=9222",
    `--user-data-dir=${dir}`,
    "about:blank",
  ], { stdio: "ignore" });
  let version;
  for (let i = 0; i < 50; i += 1) {
    try {
      version = await fetch("http://127.0.0.1:9222/json/version").then((res) => res.json());
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!version) throw new Error("Chrome 沒有啟動");
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (message) => {
      if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`));
      else resolve(message.result);
    });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const session = (method, params = {}) => send(method, params, sessionId);
  return { chrome, ws, session };
}

async function evaluate(session, expression) {
  const result = await session("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "evaluate failed");
  return result.result.value;
}

async function click(session, selector) {
  const clicked = await evaluate(session, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`找不到 ${selector}`);
}

async function fill(session, selector, value) {
  const filled = await evaluate(session, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.focus();
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return el.value === ${JSON.stringify(value)};
  })()`);
  if (!filled) throw new Error(`無法填入 ${selector}`);
}

async function waitFor(session, text) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    const found = await evaluate(session, `document.body.innerText.includes(${JSON.stringify(text)})`);
    if (found) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const body = await evaluate(session, "document.body.innerText");
  throw new Error(`等不到「${text}」\n${body}`);
}

async function shot(session, name) {
  const metrics = await session("Page.getLayoutMetrics");
  const size = metrics.cssContentSize || metrics.contentSize;
  const { data } = await session("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: size.width, height: Math.min(size.height, 2200), scale: 1 },
  });
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, name);
  await writeFile(file, Buffer.from(data, "base64"));
  return file;
}

const fixture = cursorFixture();
const cursorBase = await listen(fixture);
const app = createApp({ cursorApiBase: cursorBase });
const base = await listen(app);
const browser = await connectChrome();

try {
  await browser.session("Page.enable");
  await browser.session("Runtime.enable");
  await browser.session("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await browser.session("Page.navigate", { url: base });
  await waitFor(browser.session, "在手機上看 Automations");
  await shot(browser.session, "mobile-connect.png");

  await fill(browser.session, "#api-key", "key_not_valid_example");
  await evaluate(browser.session, `document.querySelector("form.connect").requestSubmit()`);
  await waitFor(browser.session, "API key");
  const wrong = await evaluate(browser.session, "document.body.innerText");
  if (!wrong.includes("無法登入")) throw new Error(wrong);

  await fill(browser.session, "#api-key", "key_valid_example");
  await evaluate(browser.session, `document.querySelector("form.connect").requestSubmit()`);
  await waitFor(browser.session, "每日摘要");
  await waitFor(browser.session, "PR 審查");
  const overflow = await evaluate(browser.session, "document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1");
  if (!overflow) throw new Error("手機寬度出現橫向捲軸");
  await shot(browser.session, "mobile-list.png");

  await click(browser.session, "button.chip:nth-of-type(3)");
  await waitFor(browser.session, "PR 審查");
  const hidden = await evaluate(browser.session, "document.body.innerText.includes('每日摘要')");
  if (hidden) throw new Error("停用篩選仍顯示啟用中的項目");
  await click(browser.session, "button.chip:nth-of-type(1)");

  await fill(browser.session, "input[type=search]", "沒有這則");
  await waitFor(browser.session, "沒有符合的 automation");
  await fill(browser.session, "input[type=search]", "");
  await waitFor(browser.session, "每日摘要");

  await click(browser.session, ".card");
  await waitFor(browser.session, "摘要昨天合併的 pull request");
  await waitFor(browser.session, "早上那次");
  await waitFor(browser.session, "Webhook");
  await shot(browser.session, "mobile-detail.png");

  await browser.session("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click(browser.session, "button.back");
  await waitFor(browser.session, "每日摘要");
  const columns = await evaluate(browser.session, `getComputedStyle(document.querySelector(".grid")).gridTemplateColumns.split(" ").length`);
  if (columns < 2) throw new Error(`桌面應為多欄，目前 ${columns}`);
  await shot(browser.session, "desktop-list.png");
  console.log("browser check ok");
} finally {
  browser.chrome.kill();
  browser.ws.close();
  app.close();
  fixture.close();
}
