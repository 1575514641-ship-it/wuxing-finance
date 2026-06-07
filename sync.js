// Cloudflare Workers 云同步数据层
// 替换原 supabase.js，对外接口与 app.js 调用完全兼容
// 加载顺序：index.html -> sync.js -> app.js
(function () {
  "use strict";

  const WORKER_URL_KEY = "wuxing-cf-worker-url";
  const IDENTITY_KEY = "wuxing-sync-identity-v2";
  const LEGACY_USER_ID_KEY = "wuxing-user-id";

  // ---- 工具函数 ----

  function bytesToBase64Url(bytes) {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(text) {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  }

  function randomToken(byteLength) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  }

  function normalizeIdentity(input) {
    if (!input || typeof input !== "object") return null;
    const userId = String(input.userId || input.user_id || "").trim();
    const secret = String(input.secret || input.syncSecret || input.sync_secret || "").trim();
    if (!userId || !secret || secret.length < 24) return null;
    return { version: 2, userId, secret, createdAt: input.createdAt || new Date().toISOString() };
  }

  function getIdentity() {
    try {
      const saved = normalizeIdentity(JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null"));
      if (saved) return saved;
    } catch { /* fall through */ }

    const legacyId = localStorage.getItem(LEGACY_USER_ID_KEY);
    const identity = {
      version: 2,
      userId: legacyId || crypto.randomUUID(),
      secret: randomToken(32),
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    localStorage.setItem(LEGACY_USER_ID_KEY, identity.userId);
    return identity;
  }

  function saveIdentity(identity) {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    localStorage.setItem(LEGACY_USER_ID_KEY, identity.userId);
  }

  function encodeSyncCode(identity) {
    const payload = JSON.stringify({ v: 2, userId: identity.userId, secret: identity.secret });
    return "WUXING2." + bytesToBase64Url(new TextEncoder().encode(payload));
  }

  function parseSyncCode(code) {
    const clean = String(code || "").trim();
    if (!clean) throw new Error("同步码不能为空");
    let payload = clean;
    if (clean.startsWith("WUXING2.")) {
      const bytes = base64UrlToBytes(clean.slice("WUXING2.".length));
      payload = new TextDecoder().decode(bytes);
    }
    const identity = normalizeIdentity(JSON.parse(payload));
    if (!identity) throw new Error("同步码格式不正确");
    return identity;
  }

  // ---- Worker API ----

  // 始终走 Netlify 反代 /api/sync；workers.dev 直连在国内被墙，
  // 旧设备 localStorage 可能残留直连 URL，这里自愈纠正回反代路径。
  const PROXY_BASE = "/api/sync";

  function getWorkerUrl() {
    const saved = localStorage.getItem(WORKER_URL_KEY) || "";
    if (!saved || /workers\.dev/i.test(saved)) {
      if (saved) localStorage.setItem(WORKER_URL_KEY, PROXY_BASE);
      return PROXY_BASE;
    }
    return saved;
  }

  async function workerFetch(endpoint, body) {
    const base = getWorkerUrl().replace(/\/+$/, "");
    if (!base) throw new Error("Worker URL 未配置");
    const res = await fetch(base + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error("Worker " + res.status + ": " + text);
    }
    return res.json();
  }

  async function loadRecord() {
    const identity = getIdentity();
    const result = await workerFetch("/load", {
      userId: identity.userId,
      secret: identity.secret,
    });
    if (!result.found) return null;
    return { data: result.data, updatedAt: result.updatedAt, protected: true };
  }

  async function saveRecord(data, updatedAt) {
    const identity = getIdentity();
    const result = await workerFetch("/save", {
      userId: identity.userId,
      secret: identity.secret,
      data,
      updatedAt: updatedAt || new Date().toISOString(),
    });
    return { data, updatedAt: result.updatedAt, protected: true };
  }

  // ---- 对外接口（与原 supabase.js window.supabase 完全兼容）----

  window.supabase = {
    // 原来传 supabase url + anonKey，现在传 worker url（第一个参数），第二个忽略
    setConfig(workerUrl) {
      const clean = String(workerUrl || "").replace(/\/$/, "");
      localStorage.setItem(WORKER_URL_KEY, clean);
      getIdentity();
    },

    clearConfig() {
      localStorage.removeItem(WORKER_URL_KEY);
    },

    isConfigured() {
      return !!getWorkerUrl();
    },

    getSyncCode() {
      return encodeSyncCode(getIdentity());
    },

    applySyncCode(code) {
      const identity = parseSyncCode(code);
      saveIdentity(identity);
      return identity;
    },

    resetIdentity() {
      const identity = {
        version: 2,
        userId: crypto.randomUUID(),
        secret: randomToken(32),
        createdAt: new Date().toISOString(),
      };
      saveIdentity(identity);
      return identity;
    },

    loadRecord,

    async loadData() {
      const record = await loadRecord();
      return record ? record.data : null;
    },

    async saveData(data, updatedAt) {
      return saveRecord(data, updatedAt);
    },

    setStatus(status, detail) {
      const el = document.querySelector("#syncStatus");
      if (!el) return;
      el.className = "sync-badge " + status;
      const labels = { online: "云同步", syncing: "同步中", offline: "本地", error: "同步失败", legacy: "旧同步" };
      el.textContent = labels[status] || status;
      el.title = detail || "";
    },
  };
})();
