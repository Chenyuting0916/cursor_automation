const KEY = "cursor-automations-api-key";
const state = {
  key: sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || "",
  remember: Boolean(localStorage.getItem(KEY)),
  draft: "",
  signedIn: false,
  account: null,
  automations: [],
  filter: "all",
  query: "",
  error: "",
  loading: false,
  detail: null,
  runs: null,
  runsNote: "",
};

const app = document.querySelector("#app");

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "checked" || key === "disabled") node[key] = Boolean(value);
    else node.setAttribute(key, value);
  }
  const append = (child) => {
    if (Array.isArray(child)) {
      child.forEach(append);
      return;
    }
    if (child == null || child === false) return;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  };
  append(children);
  return node;
}

function formatTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const minute = Math.round(diff / 60000);
  if (minute >= 0 && minute < 1) return "剛剛";
  if (minute >= 0 && minute < 60) return `${minute} 分鐘前`;
  const hour = Math.round(minute / 60);
  if (hour > 0 && hour < 24) return `${hour} 小時前`;
  const day = Math.round(hour / 24);
  if (day > 0 && day < 7) return `${day} 天前`;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function api(path) {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${state.key}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "讀取失敗");
  return body;
}

function saveKey(key, remember) {
  state.key = key.trim();
  state.remember = remember;
  sessionStorage.removeItem(KEY);
  localStorage.removeItem(KEY);
  if (!state.key) return;
  (remember ? localStorage : sessionStorage).setItem(KEY, state.key);
}

function signOut() {
  saveKey("", false);
  state.signedIn = false;
  state.draft = "";
  state.account = null;
  state.automations = [];
  state.error = "";
  location.hash = "#/";
  render();
}

function failAuth(error, draft, remember) {
  state.signedIn = false;
  saveKey("", false);
  state.draft = draft;
  state.remember = remember;
  state.error = error.message || "讀取失敗";
  state.loading = false;
  render();
}

function route() {
  const match = location.hash.match(/^#\/a\/([0-9a-fA-F-]{36})$/);
  return match ? { name: "detail", id: match[1] } : { name: "list" };
}

function visibleAutomations() {
  const query = state.query.trim().toLowerCase();
  return state.automations.filter((item) => {
    if (state.filter === "on" && item.enabled !== true) return false;
    if (state.filter === "off" && item.enabled !== false) return false;
    if (!query) return true;
    const haystack = [
      item.name,
      item.description,
      item.ownerName,
      item.promptPreview,
      ...item.prompts,
      ...item.repos,
      ...item.triggers.map((trigger) => `${trigger.label} ${trigger.detail}`),
    ]
      .join("\n")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function badge(item) {
  if (item.enabled === true) return h("span", { class: "badge on" }, "啟用中");
  if (item.enabled === false) return h("span", { class: "badge off" }, "已停用");
  return h("span", { class: "badge" }, "狀態未知");
}

function runBadge(run) {
  const kind = /完成|成功/.test(run.statusLabel) ? "ok" : /失敗|取消|過期/.test(run.statusLabel) ? "bad" : "live";
  return h("span", { class: `badge run ${kind}` }, run.statusLabel);
}

function tags(items) {
  if (!items?.length) return null;
  return h(
    "div",
    { class: "tags" },
    items.map((item) => h("span", { class: "tag" }, item.detail ? `${item.label} · ${item.detail}` : item.label)),
  );
}

function renderConnect() {
  const input = h("input", {
    id: "api-key",
    type: "password",
    autocomplete: "off",
    spellcheck: "false",
    placeholder: "key_ 或 crsr_ 開頭",
    value: state.draft,
  });
  const remember = h("input", { id: "remember", type: "checkbox", checked: state.remember });
  const form = h("form", {
    class: "connect",
    onsubmit: async (event) => {
      event.preventDefault();
      state.error = "";
      state.loading = true;
      const draft = input.value;
      const keep = remember.checked;
      saveKey(draft, keep);
      state.signedIn = true;
      render();
      try {
        await loadList();
        location.hash = "#/";
      } catch (error) {
        failAuth(error, draft, keep);
      }
    },
  }, [
    h("p", { class: "kicker" }, "Cursor"),
    h("h1", {}, "在手機上看 Automations"),
    h("p", {}, "手機版 Cursor 沒有這個列表。貼上你自己的 User API Key，這個頁面會讀取帳號裡的 automation、觸發條件和最近的執行。"),
    h("label", { for: "api-key" }, "API Key"),
    h("div", { class: "field" }, [
      input,
      h("button", {
        type: "button",
        class: "text-button",
        onclick: () => {
          input.type = input.type === "password" ? "text" : "password";
        },
      }, "顯示"),
    ]),
    h("label", { class: "check" }, [remember, "在這台裝置上記住"]),
    h("button", { class: "primary full", type: "submit" }, state.loading ? "連線中…" : "查看我的 automations"),
    state.error ? h("p", { class: "banner" }, state.error) : null,
    h("p", { class: "hint" }, [
      "Key 只留在這台裝置，並由這個網頁轉送給 Cursor。到 ",
      h("a", { href: "https://cursor.com/dashboard?tab=integrations", target: "_blank", rel: "noreferrer" }, "Cursor Integrations"),
      " 建立一把 User API Key。",
    ]),
  ]);
  app.replaceChildren(h("main", { class: "app" }, form));
}

function header(title, extra) {
  const account = [state.account?.name, state.account?.email].filter(Boolean).join(" · ");
  return h("header", { class: "top" }, [
    h("div", {}, [
      h("p", { class: "kicker" }, "Cursor"),
      h("h1", {}, title),
      account ? h("p", { class: "account" }, account) : null,
    ]),
    h("div", { class: "actions" }, extra),
  ]);
}

function renderList() {
  const enabled = state.automations.filter((item) => item.enabled === true).length;
  const disabled = state.automations.filter((item) => item.enabled === false).length;
  const items = visibleAutomations();
  const search = h("input", {
    type: "search",
    placeholder: "搜尋名稱、提示詞、repo",
    value: state.query,
    "aria-label": "搜尋 automations",
    oninput: (event) => {
      state.query = event.target.value;
      const next = renderList();
      const field = next.querySelector('input[type="search"]');
      if (field) {
        const pos = event.target.selectionStart;
        field.focus();
        if (pos != null) field.setSelectionRange(pos, pos);
      }
    },
  });
  const chips = h("div", { class: "chips" }, [
    ["all", `全部 ${state.automations.length}`],
    ["on", `啟用 ${enabled}`],
    ["off", `停用 ${disabled}`],
  ].map(([id, label]) => h("button", {
    type: "button",
    class: "chip",
    "aria-pressed": state.filter === id ? "true" : "false",
    onclick: () => {
      state.filter = id;
      renderList();
    },
  }, label)));

  const grid = state.loading
    ? h("div", { class: "grid" }, [h("div", { class: "skeleton" }), h("div", { class: "skeleton" })])
    : h("div", { class: "grid" }, items.length ? items.map(card) : [
        h("div", { class: "panel empty" }, [
          h("h2", {}, state.automations.length ? "沒有符合的 automation" : "這個帳號還沒有 automation"),
          h("p", { class: "meta" }, "可以換個篩選，或到 Cursor 網頁版建立一則。"),
          h("a", { class: "primary", href: "https://cursor.com/automations", target: "_blank", rel: "noreferrer" }, "開啟 Cursor Automations"),
        ]),
      ]);

  const view = h("main", { class: "app" }, [
    header("Automations", [
      h("button", { type: "button", class: "icon-button", onclick: () => loadList().catch(showError) }, "重新整理"),
      h("button", { type: "button", class: "text-button", onclick: signOut }, "登出"),
    ]),
    state.error ? h("div", { class: "banner" }, state.error) : null,
    h("div", { class: "toolbar" }, [search, chips]),
    h("p", { class: "meta" }, `${items.length} 則顯示中`),
    grid,
  ]);
  app.replaceChildren(view);
  return view;
}

function card(item) {
  return h("button", {
    type: "button",
    class: "card",
    onclick: () => {
      location.hash = `#/a/${item.id}`;
    },
  }, [
    h("div", { class: "row" }, [
      badge(item),
      h("span", { class: "meta" }, formatTime(item.updatedAt || item.createdAt)),
    ]),
    h("h2", { class: "name" }, item.name),
    item.promptPreview ? h("p", { class: "preview" }, item.promptPreview) : null,
    tags(item.triggers),
    h("p", { class: "meta" }, [item.repos.join("、"), item.branch, item.scopeLabel, item.ownerName].filter(Boolean).join(" · ")),
  ]);
}

function renderDetail() {
  const item = state.detail;
  const body = !item
    ? h("div", { class: "skeleton" })
    : h("article", { class: "panel", style: "padding:18px" }, [
        h("div", { class: "row" }, [badge(item), h("span", { class: "meta" }, formatTime(item.updatedAt || item.createdAt))]),
        h("h2", { class: "name" }, item.name),
        item.description ? h("p", {}, item.description) : null,
        item.restricted ? h("p", { class: "banner" }, "你只能看到摘要，沒有權限閱讀內容。") : null,
        h("p", { class: "meta" }, [item.scopeLabel, item.ownerName, item.model && `模型 ${item.model}`, item.memoryEnabled ? "有記憶" : ""].filter(Boolean).join(" · ")),
        h("div", { class: "actions", style: "margin-top:14px" }, [
          h("a", { class: "primary", href: `https://cursor.com/automations/${item.id}`, target: "_blank", rel: "noreferrer" }, "在 Cursor 開啟"),
        ]),
        section("做什麼", item.prompts.length ? item.prompts.map((prompt) => h("p", { class: "prompt" }, prompt)) : h("p", { class: "meta" }, "沒有提示詞")),
        section("什麼時候跑", tags(item.triggers) || h("p", { class: "meta" }, "沒有觸發條件")),
        section("可以用的工具", tags(item.actions) || h("p", { class: "meta" }, "沒有額外工具")),
        section("程式庫", item.repos.length ? h("p", {}, `${item.repos.join("、")}${item.branch ? ` · ${item.branch}` : ""}`) : h("p", { class: "meta" }, "沒有指定程式庫")),
        section("最近執行", renderRuns()),
      ]);

  app.replaceChildren(h("main", { class: "app" }, [
    h("button", { type: "button", class: "text-button back", onclick: () => { location.hash = "#/"; } }, "返回列表"),
    header("內容", [
      h("button", { type: "button", class: "icon-button", onclick: () => loadDetail(route().id) }, "重新整理"),
    ]),
    state.error ? h("div", { class: "banner" }, state.error) : null,
    body,
  ]));
}

function section(title, child) {
  return h("section", { class: "section" }, [h("h2", {}, title), child]);
}

function renderRuns() {
  if (!state.runs) return h("p", { class: "meta" }, "讀取執行紀錄…");
  if (state.runsNote && !state.runs.length) return h("p", { class: "meta" }, state.runsNote);
  if (!state.runs.length) return h("p", { class: "meta" }, "還沒有執行紀錄");
  return h("div", {}, state.runs.map((run) => {
    const content = [
      h("div", {}, [
        h("strong", {}, run.title || "執行"),
        h("div", { class: "meta" }, formatTime(run.createdAt)),
      ]),
      runBadge(run),
    ];
    return run.url
      ? h("a", { class: "run", href: run.url, target: "_blank", rel: "noreferrer" }, content)
      : h("div", { class: "run" }, content);
  }));
}

function showError(error) {
  state.error = error.message || "讀取失敗";
  state.loading = false;
  render();
}

async function loadList() {
  state.loading = true;
  state.error = "";
  render();
  const body = await api("/api/automations");
  state.account = body.account;
  state.automations = body.automations || [];
  state.signedIn = true;
  state.draft = "";
  state.loading = false;
  if (route().name === "list") renderList();
}

async function loadDetail(id) {
  state.loading = true;
  state.error = "";
  state.detail = state.automations.find((item) => item.id === id) || null;
  state.runs = null;
  state.runsNote = "";
  renderDetail();
  try {
    const [detail, runs] = await Promise.all([api(`/api/automations/${id}`), api(`/api/automations/${id}/runs`)]);
    state.detail = detail.automation;
    state.runs = runs.runs || [];
    state.runsNote = runs.available ? "" : (runs.error || "目前讀不到執行紀錄");
    state.loading = false;
    renderDetail();
  } catch (error) {
    showError(error);
  }
}

function render() {
  if (!state.signedIn) {
    renderConnect();
    return;
  }
  const current = route();
  if (current.name === "detail") renderDetail();
  else renderList();
}

window.addEventListener("hashchange", () => {
  const current = route();
  if (!state.signedIn) {
    renderConnect();
    return;
  }
  if (current.name === "detail") loadDetail(current.id);
  else renderList();
});

if (state.key) {
  const saved = state.key;
  const remember = state.remember;
  state.signedIn = true;
  const current = route();
  const pending = current.name === "detail" ? loadDetail(current.id) : loadList();
  pending.catch((error) => failAuth(error, saved, remember));
} else {
  renderConnect();
}
