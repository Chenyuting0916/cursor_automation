# Cursor Automations 手機檢視

手機版 Cursor 看不到 Automations。這個網頁用你自己的 User API Key，把帳號裡的 automation、觸發條件、提示詞和最近執行讀出來，版面依螢幕寬度調整。

Key 只存在這台裝置的瀏覽器。網頁伺服器收到後轉給 Cursor，不會寫進檔案。

## 啟動

```bash
node server.mjs
```

瀏覽器打開 `http://127.0.0.1:3000`。

要讓同一網路的手機打開，用電腦的區網 IP：

```bash
HOST=0.0.0.0 PORT=3000 node server.mjs
```

然後在手機打開 `http://<電腦的區網 IP>:3000`。需要 Node.js 20 以上。

## 取得 API Key

1. 用電腦登入 [Cursor Integrations](https://cursor.com/dashboard?tab=integrations)。
2. 建立一把 User API Key。它會以 `key_` 或 `crsr_` 開頭。
3. 在手機頁面貼上，點「查看我的 automations」。

可以勾選「在這台裝置上記住」。登出會清掉這把 key。

## 看得到什麼

- 啟用或停用、擁有者、範圍
- 排程、程式庫、Slack、Linear、Webhook 等觸發條件
- 提示詞、工具、程式庫與分支
- 最近執行；若有 agent 連結，會開到 `cursor.com/agents/...`
- 每則 automation 也可以改開 Cursor 網頁版

這是唯讀頁面，不會修改或啟動 automation。

## 測試

```bash
npm test
```
