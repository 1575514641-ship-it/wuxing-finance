// 五行理财 云同步 Worker
// 部署到 Cloudflare Workers，使用 D1 数据库
// 接口：POST /sync/load  POST /sync/save  POST /sync/init

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");

    // 初始化表（首次部署调用一次即可，之后可删掉这个路由）
    if (path === "/sync/init" && request.method === "POST") {
      await env.DB.exec(`
        CREATE TABLE IF NOT EXISTS user_data (
          user_id TEXT NOT NULL,
          secret_hash TEXT NOT NULL,
          data TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id)
        )
      `);
      return json({ ok: true, msg: "table ready" });
    }

    if (path === "/sync/load" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || !body.userId || !body.secret) return err("缺少 userId 或 secret");

      const row = await env.DB.prepare(
        "SELECT data, updated_at FROM user_data WHERE user_id = ? AND secret_hash = ?"
      )
        .bind(body.userId, await sha256(body.secret))
        .first();

      if (!row) return json({ found: false });
      return json({ found: true, data: JSON.parse(row.data), updatedAt: row.updated_at });
    }

    if (path === "/sync/save" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || !body.userId || !body.secret || !body.data) return err("缺少必要字段");

      const hash = await sha256(body.secret);
      const updatedAtInput = body.updatedAt || new Date().toISOString();
      if (typeof updatedAtInput !== "string") return err("更新时间无效，请检查设备时间后重试");
      const parsedUpdatedAt = Date.parse(updatedAtInput);
      if (!Number.isFinite(parsedUpdatedAt)) return err("更新时间无效，请检查设备时间后重试");
      if (parsedUpdatedAt > Date.now() + 5 * 60 * 1000) {
        return err("设备时间超前超过 5 分钟，请校准设备时间后重试");
      }
      const updatedAt = new Date(parsedUpdatedAt).toISOString();
      try {
        validateLedgerData(body.data);
      } catch {
        return err("账本格式不正确，未保存");
      }
      const dataStr = JSON.stringify(body.data);

      const observed = await env.DB.prepare(
        "SELECT secret_hash, updated_at FROM user_data WHERE user_id = ?"
      )
        .bind(body.userId)
        .first();
      if (observed && observed.secret_hash !== hash) {
        return err("secret 不匹配，拒绝覆盖", 403);
      }
      const observedUpdatedAt = observed ? observed.updated_at : null;
      const observedTime = observed ? timeValue(observed.updated_at) : null;

      const result = await env.DB.prepare(
        `INSERT INTO user_data (user_id, secret_hash, data, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           data = excluded.data,
           updated_at = excluded.updated_at
         WHERE user_data.secret_hash = excluded.secret_hash
           AND (
             (julianday(user_data.updated_at) IS NOT NULL
               AND julianday(user_data.updated_at) <= julianday(excluded.updated_at))
             OR (julianday(user_data.updated_at) IS NULL
               AND user_data.updated_at = ?
               AND ? <= ?)
           )`
      )
        .bind(body.userId, hash, dataStr, updatedAt, observedUpdatedAt, observedTime, parsedUpdatedAt)
        .run();

      if (!result || result.success !== true || !result.meta ||
          !Number.isInteger(result.meta.changes) || result.meta.changes < 0 || result.meta.changes > 1) {
        return err("云端保存结果无法确认，请重试", 500);
      }
      if (result.meta.changes === 0) {
        const existing = await env.DB.prepare(
          "SELECT secret_hash, updated_at FROM user_data WHERE user_id = ?"
        )
          .bind(body.userId)
          .first();

        if (existing && existing.secret_hash !== hash) {
          return err("secret 不匹配，拒绝覆盖", 403);
        }
        return json({
          error: "云端数据更新，拒绝用旧快照覆盖",
          cloudUpdatedAt: existing ? existing.updated_at : null,
        }, 409);
      }

      return json({ ok: true, updatedAt });
    }

    return err("not found", 404);
  },
};

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function validateLedgerData(input) {
  const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const fail = () => { throw new Error("invalid ledger"); };
  const fields = (row, strings = [], numbers = [], booleans = []) => {
    if (!isRecord(row)) fail();
    strings.forEach((key) => {
      if (typeof row[key] !== "undefined" && typeof row[key] !== "string") fail();
    });
    numbers.forEach((key) => {
      const value = row[key];
      if (typeof value === "undefined") return;
      if ((typeof value !== "number" && typeof value !== "string") || !Number.isFinite(Number(value))) fail();
    });
    booleans.forEach((key) => {
      if (typeof row[key] !== "undefined" && typeof row[key] !== "boolean") fail();
    });
  };

  if (!isRecord(input)) fail();
  ["assets", "monthly", "entries"].forEach((key) => {
    if (!Array.isArray(input[key])) fail();
  });
  input.assets.forEach((row) => fields(row,
    ["id", "layer", "element", "name", "type", "status", "bufferDestinationId", "bufferDestination", "updated", "note"],
    ["target", "value", "cost"]));
  input.monthly.forEach((row) => {
    fields(row,
      ["id", "month", "note", "allocationMode", "effectiveAllocationMode", "allocationNote", "allocationCreatedAt"],
      ["income", "expense", "invested", "monthEndAssets", "specRatio", "plannedInvested", "reserve", "savingRate"]);
    if (typeof row.allocationPlan !== "undefined") {
      if (!Array.isArray(row.allocationPlan)) fail();
      row.allocationPlan.forEach((plan) => fields(plan,
        ["assetId", "name", "layer", "reason", "bufferTo"],
        ["target", "normalizedTarget", "amount", "bufferRedirected", "bufferUnavailable", "bufferIncoming"],
        ["skipped"]));
    }
    if (typeof row.allocationSummary !== "undefined") {
      fields(row.allocationSummary, [],
        ["cashflowAvailable", "targetSaving", "investBase", "allocatedTotal", "actualRemainingCash", "remainingCash", "bufferedAllocTotal", "unbufferedCash", "speculativeRatio"],
        ["speculativePaused"]);
    }
  });
  input.entries.forEach((row) => fields(row,
    ["id", "kind", "date", "target", "channel", "note", "linkedAssetId", "linkedMonth"],
    ["amount", "linkedAmount"]));
  if (typeof input.settings !== "undefined") {
    fields(input.settings, [], ["emergencyGoal"], ["linkInvestEntry"]);
  }
}

function timeValue(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}
