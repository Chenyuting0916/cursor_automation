const SCOPE_LABELS = {
  1: "個人",
  2: "團隊",
  3: "團隊可看",
  4: "團隊可編輯",
  5: "你可編輯",
  AUTOMATION_SCOPE_USER: "個人",
  AUTOMATION_SCOPE_TEAM: "團隊",
  AUTOMATION_SCOPE_TEAM_VISIBLE: "團隊可看",
  AUTOMATION_SCOPE_TEAM_EDITABLE: "團隊可編輯",
  AUTOMATION_SCOPE_TEAM_EDITABLE_USER: "你可編輯",
  USER: "個人",
  TEAM: "團隊",
};

const TRIGGER_LABELS = {
  cron: "排程",
  git: "程式庫",
  slackTrigger: "Slack 訊息",
  slack_trigger: "Slack 訊息",
  linear: "Linear",
  webhook: "Webhook",
  slackChannelCreated: "Slack 新頻道",
  slack_channel_created: "Slack 新頻道",
  pagerduty: "PagerDuty",
  sentry: "Sentry",
  microsoftTeamsTrigger: "Teams 訊息",
  microsoft_teams_trigger: "Teams 訊息",
  microsoftTeamsChannelCreated: "Teams 新頻道",
  microsoft_teams_channel_created: "Teams 新頻道",
  slackReactionAdded: "Slack 表情",
  slack_reaction_added: "Slack 表情",
  slackMention: "Slack 提及",
  slack_mention: "Slack 提及",
  slackAnyReactionAdded: "Slack 任何表情",
  slack_any_reaction_added: "Slack 任何表情",
  emailReceived: "電子郵件",
  email_received: "電子郵件",
};

const GIT_EVENT_LABELS = {
  pullRequest: "Pull request",
  pull_request: "Pull request",
  push: "Push",
  ciCompleted: "CI 完成",
  ci_completed: "CI 完成",
  issueLabeled: "Issue 標籤",
  label: "標籤變更",
  issueComment: "Issue 留言",
  pullRequestReviewComment: "PR review 留言",
  pullRequestReview: "PR review",
  reviewThread: "Review 討論",
  workflowRun: "GitHub Actions",
  pullRequestReviewRequested: "被要求 review",
  issueAssigned: "Issue 指派",
};

const PR_ACTION_LABELS = {
  GIT_PULL_REQUEST_ACTION_OPENED: "開啟",
  GIT_PULL_REQUEST_ACTION_PUSHED: "有新 commit",
  GIT_PULL_REQUEST_ACTION_MERGED: "合併",
  GIT_PULL_REQUEST_ACTION_COMMENTED: "留言",
  GIT_PULL_REQUEST_ACTION_DRAFT_OPENED: "草稿開啟",
  GIT_PULL_REQUEST_ACTION_LABELED: "加上標籤",
  GIT_PULL_REQUEST_ACTION_UNLABELED: "移除標籤",
  GIT_PULL_REQUEST_ACTION_CLOSED: "關閉",
  opened: "開啟",
  pushed: "有新 commit",
  merged: "合併",
  commented: "留言",
};

const ACTION_LABELS = {
  gitPr: "開啟 Pull Request",
  git_pr: "開啟 Pull Request",
  prComment: "PR 留言",
  pr_comment: "PR 留言",
  slack: "傳送到 Slack",
  mcp: "MCP",
  manageCheckRun: "GitHub Check",
  manage_check_run: "GitHub Check",
  requestReviewers: "邀請審閱者",
  request_reviewers: "邀請審閱者",
  readSlack: "讀取 Slack",
  read_slack: "讀取 Slack",
  approvePr: "核准 PR",
  approve_pr: "核准 PR",
  resolveReviewThreads: "解決 review 討論",
  resolve_review_threads: "解決 review 討論",
  microsoftTeams: "傳送到 Teams",
  microsoft_teams: "傳送到 Teams",
  readMicrosoftTeams: "讀取 Teams",
  read_microsoft_teams: "讀取 Teams",
};

const RUN_STATUS_LABELS = {
  FINISHED: "完成",
  SUCCESS: "完成",
  SUCCEEDED: "完成",
  COMPLETED: "完成",
  ERROR: "失敗",
  FAILED: "失敗",
  RUNNING: "執行中",
  CREATING: "準備中",
  CANCELLED: "已取消",
  CANCELED: "已取消",
  EXPIRED: "已過期",
  IDLE: "閒置",
  SKIPPED: "略過",
  PENDING: "等待中",
};

const SKIP_TRIGGER_KEYS = new Set([
  "agenticFilterPrompt",
  "agentic_filter_prompt",
]);

function text(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function toIso(value) {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric) && numeric > 0 && String(value).trim() !== "") {
    const ms = numeric < 1e12 ? numeric * 1000 : numeric;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function workflowOf(node) {
  const workflow = node?.workflow;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) return null;
  if (
    workflow.triggers ||
    workflow.prompts ||
    workflow.actions ||
    workflow.gitConfig ||
    workflow.git_config ||
    workflow.model ||
    workflow.modelSelection
  ) {
    return workflow;
  }
  return null;
}

function promptsOf(workflow) {
  if (!workflow) return [];
  return asList(workflow.prompts)
    .map((prompt) => (typeof prompt === "string" ? prompt : text(prompt?.prompt)))
    .filter(Boolean);
}

function labelFor(map, key) {
  if (!key) return "";
  if (map[key]) return map[key];
  return String(key)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function summarizeGit(git) {
  if (!git || typeof git !== "object") return "";
  const eventKey = Object.keys(git).find(
    (key) => !["userAllowlist", "user_allowlist", "prNumber", "pr_number"].includes(key),
  );
  const event = eventKey ? git[eventKey] : null;
  if (!event || typeof event !== "object") return labelFor(GIT_EVENT_LABELS, eventKey);
  const repos = asList(event.repos || event.repo);
  const parts = [
    labelFor(GIT_EVENT_LABELS, eventKey),
    repos.join("、"),
    text(event.branch),
    labelFor(PR_ACTION_LABELS, event.prAction || event.pr_action),
  ].filter(Boolean);
  return parts.join(" · ");
}

function summarizeTrigger(trigger) {
  if (!trigger || typeof trigger !== "object") return null;
  const key = Object.keys(trigger).find((item) => !SKIP_TRIGGER_KEYS.has(item));
  if (!key) return null;
  const value = trigger[key];
  let detail = "";
  if (key === "cron" && value && typeof value === "object") {
    detail = text(value.cron, value.nominalCron, value.nominal_cron);
  } else if (key === "git") {
    detail = summarizeGit(value);
  } else if (value && typeof value === "object") {
    const repos = asList(value.repos || value.repo || value.channels || value.channel);
    const extra = text(value.schedule, value.cron, value.messageContains, value.message_contains);
    detail = [repos.join("、"), extra].filter(Boolean).join(" · ");
  }
  return {
    type: key,
    label: labelFor(TRIGGER_LABELS, key),
    detail,
  };
}

function summarizeAction(action) {
  if (!action || typeof action !== "object") return null;
  const key = Object.keys(action)[0];
  if (!key) return null;
  const value = action[key];
  let detail = "";
  if (value && typeof value === "object") {
    detail = [
      text(value.server?.name, value.server, value.name),
      asList(value.channels || value.channel).join("、"),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return {
    type: key,
    label: labelFor(ACTION_LABELS, key),
    detail,
  };
}

function collectRepos(node, workflow, triggers) {
  const repos = new Set();
  const gitConfig = workflow?.gitConfig || workflow?.git_config || {};
  for (const repo of asList(gitConfig.repos || gitConfig.repo)) repos.add(String(repo));
  const branch = text(gitConfig.branch);
  for (const trigger of triggers) {
    if (!trigger.detail) continue;
    for (const part of trigger.detail.split(" · ")) {
      if (part.includes("/") && !part.includes(" ")) repos.add(part);
    }
  }
  return {
    repos: [...repos],
    branch,
  };
}

export function toIsoTime(value) {
  return toIso(value);
}

export function normalizeAutomation(node, options = {}) {
  const workflow = workflowOf(node);
  const triggers = asList(workflow?.triggers).map(summarizeTrigger).filter(Boolean);
  const actions = asList(workflow?.actions).map(summarizeAction).filter(Boolean);
  const prompts = promptsOf(workflow);
  const { repos, branch } = collectRepos(node, workflow, triggers);
  const scope = node.scope ?? node.automationScope ?? "";
  const updatedAt = toIso(node.updatedAt ?? node.updated_at);
  const createdAt = toIso(node.createdAt ?? node.created_at);
  const preview = prompts[0] || text(node.description) || "";
  return {
    id: text(node.automationId, node.automation_id),
    name: text(node.name) || "未命名 automation",
    enabled: typeof node.enabled === "boolean" ? node.enabled : null,
    description: text(node.description),
    scope: scope === "" ? null : scope,
    scopeLabel: SCOPE_LABELS[scope] || (scope ? String(scope) : ""),
    ownerName: text(node.ownerName, node.owner_name),
    createdAt,
    updatedAt,
    model: text(
      workflow?.modelSelection?.modelId,
      workflow?.model_selection?.model_id,
      workflow?.model,
    ),
    memoryEnabled: Boolean(workflow?.memoryEnabled ?? workflow?.memory_enabled),
    repos,
    branch,
    triggers,
    actions,
    prompts,
    promptPreview: preview.length > 160 ? `${preview.slice(0, 160)}…` : preview,
    restricted: Boolean(options.restricted),
  };
}

function richer(current, next) {
  const score = (item) =>
    (item.prompts?.length || 0) * 10 +
    (item.triggers?.length || 0) * 3 +
    (item.description ? 1 : 0);
  const winner = score(next) > score(current) ? { ...current, ...next } : { ...next, ...current };
  winner.ownerName = current.ownerName || next.ownerName || "";
  winner.prompts = winner.prompts?.length ? winner.prompts : current.prompts || next.prompts || [];
  return winner;
}

export function extractAutomations(root) {
  const found = new Map();
  function visit(node, parent) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, parent);
      return;
    }
    const id = text(node.automationId, node.automation_id);
    if (id) {
      const ownerName = text(node.ownerName, node.owner_name, parent?.ownerName, parent?.owner_name);
      const normalized = normalizeAutomation({ ...node, ownerName });
      const previous = found.get(id);
      found.set(id, previous ? richer(previous, normalized) : normalized);
    }
    for (const value of Object.values(node)) visit(value, node);
  }
  visit(root, null);
  return [...found.values()];
}

function cursorAgentUrl(node) {
  const direct = text(node.url, node.agentUrl, node.agent_url);
  if (/^https:\/\/cursor\.com\/agents\/[A-Za-z0-9-]+\/?$/.test(direct)) return direct;
  const bcId = text(node.bcId, node.bc_id, node.agentId, node.agent_id);
  if (/^bc-[A-Za-z0-9-]+$/.test(bcId)) return `https://cursor.com/agents/${bcId}`;
  return "";
}

export function normalizeRun(node) {
  const status = text(node.status, node.state, node.runStatus, node.run_status).toUpperCase();
  const createdAt = toIso(
    node.createdAt ?? node.created_at ?? node.startedAt ?? node.started_at ?? node.createdAtMs ?? node.created_at_ms,
  );
  return {
    id: text(node.runId, node.run_id, node.id, node.bcId, node.bc_id) || createdAt || status,
    status,
    statusLabel: RUN_STATUS_LABELS[status] || status || "未知",
    createdAt,
    title: text(node.name, node.title, node.summary),
    url: cursorAgentUrl(node),
  };
}

export function extractRuns(root) {
  const found = [];
  const seen = new Set();
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const status = text(node.status, node.state, node.runStatus, node.run_status);
    const time = node.createdAt ?? node.created_at ?? node.startedAt ?? node.started_at ?? node.createdAtMs;
    const looksLikeAutomation = text(node.automationId, node.automation_id) && (node.name || typeof node.enabled === "boolean") && !status;
    if (status && (time || node.runId || node.run_id || node.bcId || node.bc_id) && !looksLikeAutomation) {
      const run = normalizeRun(node);
      if (!seen.has(run.id)) {
        seen.add(run.id);
        found.push(run);
      }
      return;
    }
    for (const value of Object.values(node)) visit(value);
  }
  visit(root);
  return found.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function extractAccount(root) {
  let email = "";
  let name = "";
  function visit(node) {
    if (!node || typeof node !== "object" || (email && name)) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string") {
        if (!email && /email/i.test(key) && value.includes("@")) email = value.trim();
        if (!name && /^(name|displayName|display_name|userName)$/i.test(key) && value.trim() && !value.includes("@")) {
          name = value.trim();
        }
      } else {
        visit(value);
      }
    }
  }
  visit(root);
  return { name, email };
}

export function extractTeamIds(root) {
  const ids = new Set();
  function add(value) {
    const number = Number(value);
    if (Number.isInteger(number) && number > 0) ids.add(number);
  }
  function visit(node, keyHint) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, keyHint);
      return;
    }
    if (node.teamId != null) add(node.teamId);
    if (node.team_id != null) add(node.team_id);
    if ((keyHint === "teams" || keyHint === "team") && node.id != null) add(node.id);
    for (const [key, value] of Object.entries(node)) visit(value, key);
  }
  visit(root, "");
  return [...ids];
}

export function findPageToken(page) {
  if (!page || typeof page !== "object") return "";
  for (const key of ["nextPageToken", "nextCursor", "next_page_token", "next_cursor"]) {
    if (typeof page[key] === "string" && page[key].trim()) return page[key].trim();
  }
  return "";
}
