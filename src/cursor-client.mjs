import { redact } from "./redact.mjs";
import {
  extractAccount,
  extractAutomations,
  extractRuns,
  extractTeamIds,
  findPageToken,
} from "./view-model.mjs";

const LIST = "aiserver.v1.AutomationsService/ListAutomations";
const GET = "aiserver.v1.AutomationsService/GetAutomation";
const RUNS = "aiserver.v1.AutomationsService/ListAutomationRuns";
const ME = "aiserver.v1.DashboardService/GetMe";
const TEAMS = "aiserver.v1.DashboardService/GetTeams";

export function createCursorClient({
  base = "https://api2.cursor.sh",
  fetchImpl = fetch,
  now = () => Date.now(),
  cacheTtlMs = 10 * 60 * 1000,
} = {}) {
  const cache = new Map();
  const endpoint = base.replace(/\/$/, "");

  async function readJson(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { message: text.slice(0, 300) };
    }
  }

  function fail(response, body) {
    const error = new Error(body.message || body.error || `Cursor 回應 HTTP ${response.status}`);
    error.status = response.status;
    error.code = body.code || "";
    return error;
  }

  async function resolve(apiKey) {
    const key = String(apiKey || "").trim();
    if (key.length < 8) {
      const error = new Error("請貼上 Cursor User API Key");
      error.status = 401;
      throw error;
    }
    if (!/^(key_|crsr_)/.test(key)) return key;
    const cached = cache.get(key);
    if (cached && cached.exp > now()) return cached.token;
    const response = await fetchImpl(`${endpoint}/auth/exchange_user_api_key`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(20000),
    });
    const body = await readJson(response);
    if (!response.ok || !body.accessToken) throw fail(response, body);
    cache.set(key, { token: body.accessToken, exp: now() + cacheTtlMs });
    if (cache.size > 50) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
    return body.accessToken;
  }

  async function rpc(apiKey, procedure, payload) {
    const token = await resolve(apiKey);
    const response = await fetchImpl(`${endpoint}/${procedure}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
      },
      body: JSON.stringify(payload ?? {}),
      signal: AbortSignal.timeout(25000),
    });
    const body = redact(await readJson(response));
    if (!response.ok) throw fail(response, body);
    return body;
  }

  async function pages(apiKey, procedure, payload) {
    const collected = [];
    const seen = new Set();
    let body = payload;
    for (let index = 0; index < 8; index += 1) {
      const page = await rpc(apiKey, procedure, body);
      collected.push(page);
      const token = findPageToken(page);
      if (!token || seen.has(token)) break;
      seen.add(token);
      body = { ...payload, pageToken: token, cursor: token };
    }
    return collected;
  }

  async function account(apiKey) {
    const me = await rpc(apiKey, ME, {});
    return extractAccount(me);
  }

  async function list(apiKey) {
    const pagesCollected = [];
    const errors = [];
    try {
      pagesCollected.push(...(await pages(apiKey, LIST, {})));
    } catch (error) {
      if (error.status === 401 || error.code === "unauthenticated") throw error;
      errors.push(error);
    }

    let teamIds = [];
    try {
      teamIds = extractTeamIds(await rpc(apiKey, TEAMS, {})).slice(0, 10);
    } catch (error) {
      if (error.status === 401 || error.code === "unauthenticated") throw error;
    }

    for (const teamId of teamIds) {
      try {
        pagesCollected.push(...(await pages(apiKey, LIST, { teamId })));
      } catch (error) {
        errors.push(error);
      }
    }

    const automations = dedupe(pagesCollected.flatMap(extractAutomations));
    if (!automations.length && !pagesCollected.length && errors[0]) throw errors[0];
    return automations.sort(compareAutomations);
  }

  async function get(apiKey, id) {
    const page = await rpc(apiKey, GET, { automationId: id });
    const [automation] = extractAutomations(page);
    if (!automation) {
      const error = new Error("找不到這則 automation");
      error.status = 404;
      throw error;
    }
    const restricted = Boolean(page.restrictedSummary || page.restricted_summary) && automation.prompts.length === 0 && automation.triggers.length === 0;
    return { ...automation, restricted };
  }

  async function runs(apiKey, id) {
    const attempts = [
      { automationId: id, limit: 30 },
      { automationId: id },
      { automationId: id, pageSize: 30 },
    ];
    let lastError = null;
    for (const attempt of attempts) {
      try {
        const collected = await pages(apiKey, RUNS, attempt);
        return { available: true, runs: dedupeRuns(collected.flatMap(extractRuns)), error: "" };
      } catch (error) {
        lastError = error;
        if (error.status === 401 || error.code === "unauthenticated") throw error;
        if (error.code && error.code !== "invalid_argument") break;
      }
    }
    return {
      available: false,
      runs: [],
      error: lastError?.message || "目前讀不到執行紀錄",
    };
  }

  return { account, list, get, runs };
}

function dedupe(items) {
  const map = new Map();
  for (const item of items) {
    const previous = map.get(item.id);
    if (!previous || (item.prompts?.length || 0) > (previous.prompts?.length || 0)) map.set(item.id, item);
  }
  return [...map.values()];
}

function dedupeRuns(items) {
  const map = new Map();
  for (const item of items) map.set(item.id, item);
  return [...map.values()].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function compareAutomations(a, b) {
  const rank = (item) => (item.enabled === true ? 0 : item.enabled == null ? 1 : 2);
  const byState = rank(a) - rank(b);
  if (byState) return byState;
  return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
}
