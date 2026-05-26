// Supabase 云同步数据层
// 加载顺序：index.html -> supabase.js -> app.js
(function () {
  "use strict";

  const CONFIG_KEY = "wuxing-supabase-config";
  const IDENTITY_KEY = "wuxing-sync-identity-v2";
  const LEGACY_USER_ID_KEY = "wuxing-user-id";

  function getConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveIdentity(identity) {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    localStorage.setItem(LEGACY_USER_ID_KEY, identity.userId);
  }

  function bytesToBase64Url(bytes) {
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
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
    return {
      version: 2,
      userId,
      secret,
      createdAt: input.createdAt || new Date().toISOString(),
    };
  }

  function getIdentity() {
    try {
      const saved = normalizeIdentity(JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null"));
      if (saved) return saved;
    } catch {
      // fall through and create a new identity
    }

    const legacyId = localStorage.getItem(LEGACY_USER_ID_KEY);
    const identity = {
      version: 2,
      userId: legacyId || crypto.randomUUID(),
      secret: randomToken(32),
      createdAt: new Date().toISOString(),
    };
    saveIdentity(identity);
    return identity;
  }

  function encodeSyncCode(identity) {
    const payload = JSON.stringify({
      v: 2,
      userId: identity.userId,
      secret: identity.secret,
    });
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

  async function apiFetch(path, options) {
    const config = getConfig();
    if (!config) throw new Error("未配置 Supabase");

    const headers = {
      apikey: config.anonKey,
      Authorization: "Bearer " + config.anonKey,
      "Content-Type": "application/json",
    };
    if (options && options.headers) {
      Object.assign(headers, options.headers);
    }

    const res = await fetch(config.url + "/rest/v1/" + path, {
      ...options,
      headers,
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error("Supabase " + res.status + ": " + body);
    }
    return res;
  }

  async function rpc(name, body) {
    const res = await apiFetch("rpc/" + name, {
      method: "POST",
      body: JSON.stringify(body || {}),
    });
    return res.json();
  }

  function isMissingRpcError(error) {
    const message = error && error.message ? error.message : String(error);
    return /PGRST202|Could not find|finance_load_data|finance_save_data/i.test(message);
  }

  async function legacyLoadRecord() {
    const identity = getIdentity();
    const res = await apiFetch("user_data?select=data,updated_at&user_id=eq." + encodeURIComponent(identity.userId) + "&limit=1");
    const rows = await res.json();
    const row = rows.length > 0 ? rows[0] : null;
    return row
      ? {
          data: row.data,
          updatedAt: row.updated_at,
          protected: false,
          legacy: true,
        }
      : null;
  }

  async function legacySaveRecord(data, updatedAt) {
    const identity = getIdentity();
    const body = {
      user_id: identity.userId,
      data,
      updated_at: updatedAt || new Date().toISOString(),
    };
    const res = await apiFetch("user_data?on_conflict=user_id", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    });
    const rows = await res.json().catch(() => []);
    const row = Array.isArray(rows) && rows.length ? rows[0] : {};
    return {
      data: row.data || data,
      updatedAt: row.updated_at || body.updated_at,
      protected: false,
      legacy: true,
    };
  }

  async function loadRecord() {
    const identity = getIdentity();
    let rows;
    try {
      rows = await rpc("finance_load_data", {
        p_user_id: identity.userId,
        p_secret: identity.secret,
      });
    } catch (error) {
      if (isMissingRpcError(error)) return legacyLoadRecord();
      throw error;
    }
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    return row
      ? {
          data: row.data,
          updatedAt: row.updated_at,
          protected: row.protected !== false,
        }
      : null;
  }

  async function saveRecord(data, updatedAt) {
    const identity = getIdentity();
    let rows;
    try {
      rows = await rpc("finance_save_data", {
        p_user_id: identity.userId,
        p_secret: identity.secret,
        p_data: data,
        p_updated_at: updatedAt || new Date().toISOString(),
      });
    } catch (error) {
      if (isMissingRpcError(error)) return legacySaveRecord(data, updatedAt);
      throw error;
    }
    const row = Array.isArray(rows) && rows.length ? rows[0] : {};
    return {
      data: row.data || data,
      updatedAt: row.updated_at || updatedAt,
      protected: true,
      legacy: false,
    };
  }

  window.supabase = {
    /** 保存配置到 localStorage */
    setConfig(url, anonKey) {
      const clean = String(url || "").replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: clean, anonKey }));
      getIdentity();
    },

    /** 清除配置，退回本地模式 */
    clearConfig() {
      localStorage.removeItem(CONFIG_KEY);
    },

    /** 是否已配置 */
    isConfigured() {
      return !!getConfig();
    },

    /** 当前设备的同步码：复制到手机/电脑即可共享同一份云端数据 */
    getSyncCode() {
      return encodeSyncCode(getIdentity());
    },

    /** 导入同步码 */
    applySyncCode(code) {
      const identity = parseSyncCode(code);
      saveIdentity(identity);
      return identity;
    },

    /** 新建一套同步身份。旧云端数据不会删除，只是不再自动连接。 */
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

    /** 从云端加载数据记录 */
    loadRecord,

    /** 兼容旧调用：只返回 data */
    async loadData() {
      const record = await loadRecord();
      return record ? record.data : null;
    },

    /** 推送到云端 */
    async saveData(data, updatedAt) {
      return saveRecord(data, updatedAt);
    },

    /** 更新顶栏同步状态标签 */
    setStatus(status, detail) {
      const el = document.querySelector("#syncStatus");
      if (!el) return;
      el.className = "sync-badge " + status;
      const labels = {
        online: "云同步",
        syncing: "同步中",
        offline: "本地",
        error: "同步失败",
        legacy: "旧同步",
      };
      el.textContent = labels[status] || status;
      el.title = detail || "";
    },
  };
})();
