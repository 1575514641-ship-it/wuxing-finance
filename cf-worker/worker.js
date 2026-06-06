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
      const updatedAt = body.updatedAt || new Date().toISOString();
      const dataStr = JSON.stringify(body.data);

      // upsert：存在就更新（校验 secret），不存在就插入
      const existing = await env.DB.prepare(
        "SELECT secret_hash FROM user_data WHERE user_id = ?"
      )
        .bind(body.userId)
        .first();

      if (existing && existing.secret_hash !== hash) {
        return err("secret 不匹配，拒绝覆盖", 403);
      }

      await env.DB.prepare(
        `INSERT INTO user_data (user_id, secret_hash, data, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           data = excluded.data,
           updated_at = excluded.updated_at`
      )
        .bind(body.userId, hash, dataStr, updatedAt)
        .run();

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
