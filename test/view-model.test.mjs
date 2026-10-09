import assert from "node:assert/strict";
import test from "node:test";
import { redact } from "../src/redact.mjs";
import { extractAutomations, extractRuns, extractAccount, extractTeamIds } from "../src/view-model.mjs";

const payload = {
  automations: [
    {
      workflow: {
        name: "每日摘要",
        enabled: true,
        automationId: "11111111-1111-4111-8111-111111111111",
        description: "整理昨天的變更",
        scope: "AUTOMATION_SCOPE_USER",
        createdAt: "1710000000",
        updatedAt: "1710003600",
        deployKey: "super-secret-deploy",
        workflow: {
          model: "auto",
          memoryEnabled: true,
          gitConfig: { repo: "github.com/octo/repo", branch: "main" },
          triggers: [
            { cron: { cron: "0 9 * * 1-5" } },
            { webhook: {} },
          ],
          actions: [{ slack: { channels: ["C123"] } }, { prComment: {} }],
          prompts: [{ prompt: "請摘要昨天合併的 pull request" }],
        },
      },
      ownerName: "Ada",
    },
  ],
};

test("extracts an automation and hides secrets", () => {
  const safe = redact(payload);
  assert.equal(JSON.stringify(safe).includes("super-secret-deploy"), false);
  const [item] = extractAutomations(safe);
  assert.equal(item.name, "每日摘要");
  assert.equal(item.ownerName, "Ada");
  assert.equal(item.enabled, true);
  assert.equal(item.scopeLabel, "個人");
  assert.equal(item.triggers[0].label, "排程");
  assert.equal(item.triggers[0].detail, "0 9 * * 1-5");
  assert.equal(item.triggers[1].label, "Webhook");
  assert.equal(item.actions[0].label, "傳送到 Slack");
  assert.equal(item.repos[0], "github.com/octo/repo");
  assert.equal(item.branch, "main");
  assert.match(item.prompts[0], /pull request/);
  assert.equal(item.updatedAt, new Date(1710003600 * 1000).toISOString());
});

test("reads snake_case runs and account fields", () => {
  const runs = extractRuns({
    automation_runs: [
      {
        run_id: "run-1",
        status: "FINISHED",
        created_at_ms: 1710007200000,
        bc_id: "bc-abc",
        name: "早上那次",
      },
    ],
  });
  assert.equal(runs[0].statusLabel, "完成");
  assert.equal(runs[0].url, "https://cursor.com/agents/bc-abc");
  assert.equal(runs[0].title, "早上那次");
  assert.deepEqual(extractAccount({ user: { displayName: "Ada", email: "ada@example.com" } }), {
    name: "Ada",
    email: "ada@example.com",
  });
  assert.deepEqual(extractTeamIds({ teams: [{ id: 42, name: "Lab" }, { id: "nope" }] }), [42]);
});

test("redact keeps webhook triggers and strips key-shaped strings", () => {
  const safe = redact({ webhook: { note: "key_abcdefghijklmnopqrstuvwxyz" }, token: "abc" });
  assert.deepEqual(safe.webhook, { note: "[已隱藏]" });
  assert.equal(safe.token, "[已隱藏]");
});
