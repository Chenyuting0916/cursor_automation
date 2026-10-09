import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../server.mjs";

const ID = "11111111-1111-4111-8111-111111111111";

function cursorFixture() {
  let exchanges = 0;
  const server = createServer((req, res) => {
    const auth = req.headers.authorization || "";
    const json = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/auth/exchange_user_api_key") {
      exchanges += 1;
      if (auth !== "Bearer key_valid_example") return json(401, { message: "nope" });
      return json(200, { accessToken: "session-token" });
    }
    if (auth !== "Bearer session-token") return json(401, { code: "unauthenticated", message: "Error" });
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      if (req.url.endsWith("/GetMe")) return json(200, { user: { name: "Ada", email: "ada@example.com" } });
      if (req.url.endsWith("/GetTeams")) return json(200, { teams: [{ id: 7, name: "Lab" }] });
      if (req.url.endsWith("/ListAutomations")) {
        if (body.teamId === 7) return json(200, { automations: [] });
        return json(200, {
          automations: [
            {
              workflow: {
                name: "每日摘要",
                enabled: true,
                automationId: ID,
                deployKey: "do-not-leak",
                workflow: {
                  triggers: [{ cron: { cron: "0 9 * * 1-5" } }],
                  prompts: [{ prompt: "摘要昨天的 PR" }],
                  gitConfig: { repo: "github.com/octo/repo", branch: "main" },
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
              name: "每日摘要",
              enabled: true,
              automationId: body.automationId,
              workflow: { prompts: [{ prompt: "摘要昨天的 PR" }], triggers: [{ webhook: {} }] },
            },
            ownerName: "Ada",
          },
        });
      }
      if (req.url.endsWith("/ListAutomationRuns")) {
        return json(200, {
          runs: [{ runId: "run-1", status: "RUNNING", createdAt: Date.now(), bcId: "bc-demo" }],
        });
      }
      json(404, { message: "missing" });
    });
  });
  return { server, exchanges: () => exchanges };
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test("serves automations for a valid key and rejects a bad one", async () => {
  const fixture = cursorFixture();
  const cursorBase = await listen(fixture.server);
  const app = createApp({ cursorApiBase: cursorBase });
  const base = await listen(app);
  try {
    const denied = await fetch(`${base}/api/automations`, { headers: { Authorization: "Bearer key_not_valid_example" } });
    assert.equal(denied.status, 401);
    const deniedBody = await denied.json();
    assert.match(deniedBody.error, /API key/);

    const headers = { Authorization: "Bearer key_valid_example" };
    const list = await fetch(`${base}/api/automations`, { headers });
    assert.equal(list.status, 200);
    const listed = await list.json();
    assert.equal(listed.account.email, "ada@example.com");
    assert.equal(listed.automations.length, 1);
    assert.equal(listed.automations[0].name, "每日摘要");
    assert.equal(listed.automations[0].triggers[0].detail, "0 9 * * 1-5");
    assert.equal(JSON.stringify(listed).includes("do-not-leak"), false);

    const detail = await fetch(`${base}/api/automations/${ID}`, { headers });
    const detailBody = await detail.json();
    assert.equal(detailBody.automation.prompts[0], "摘要昨天的 PR");
    assert.equal(detailBody.automation.triggers[0].label, "Webhook");

    const runs = await fetch(`${base}/api/automations/${ID}/runs`, { headers });
    const runBody = await runs.json();
    assert.equal(runBody.available, true);
    assert.equal(runBody.runs[0].url, "https://cursor.com/agents/bc-demo");
    assert.equal(runBody.runs[0].statusLabel, "執行中");

    const page = await fetch(`${base}/`);
    const html = await page.text();
    assert.match(html, /在手機上看你的 Cursor Automations/);
    assert.match(html, /viewport/);
    assert.equal(fixture.exchanges() < 5, true);
  } finally {
    app.close();
    fixture.server.close();
  }
});
