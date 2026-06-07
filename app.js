const STORAGE_KEY = "wuxing-finance-app-v1";
const META_KEY = "wuxing-finance-meta-v1";

// 22岁外派起步配置（2026-06-07 更新）：
// 出海前 available 层 52%（A股宽基+黄金+纯债+RMB货基）
// 出海后 buffered 层解锁后权益约 80%，海外宽基主力标普25%+纳指5%+医疗7%
// 黄金从10%降到7%（估值过高），矿股从7%降到4%（去杠杆），标普从22%升到25%，纯债从5%升到8%，沪深300升到17%
const BUFFER_DEFAULT_ID = "cash-rmb";
const BUFFER_DEFAULT = "货币基金";
const HALF_FIRE_PLAN = [
  { id: BUFFER_DEFAULT_ID, layer: "现金层", element: "水", name: "货币基金", type: "RMB流动现金", target: 0.08, status: "available" },
  { id: "cash-usd", layer: "现金层", element: "水", name: "美元货币工具", type: "USD流动现金", target: 0.05, status: "buffered", bufferDestinationId: BUFFER_DEFAULT_ID, bufferDestination: BUFFER_DEFAULT },
  { id: "gold-etf", layer: "防御层", element: "金", name: "黄金积存/黄金ETF", type: "黄金类", target: 0.07, status: "available" },
  { id: "dividend-lowvol", layer: "防御层", element: "金", name: "红利低波指数", type: "红利类", target: 0.07, status: "available" },
  { id: "bond-midlong", layer: "防御层", element: "金", name: "中长期纯债基金", type: "债券类", target: 0.08, status: "available" },
  { id: "a500-csi300", layer: "生财层", element: "土", name: "沪深300/A500指数", type: "宽基指数", target: 0.17, status: "available" },
  { id: "csi500", layer: "生财层", element: "土", name: "中证500指数", type: "中盘成长", target: 0.07, status: "available" },
  { id: "sp500", layer: "成长层", element: "金水", name: "标普500", type: "海外宽基", target: 0.25, status: "buffered", bufferDestinationId: BUFFER_DEFAULT_ID, bufferDestination: BUFFER_DEFAULT },
  { id: "global-healthcare", layer: "成长层", element: "金水", name: "全球医疗/制药", type: "海外主题", target: 0.07, status: "buffered", bufferDestinationId: BUFFER_DEFAULT_ID, bufferDestination: BUFFER_DEFAULT },
  { id: "gold-miners", layer: "成长层", element: "金", name: "黄金矿业股", type: "黄金弹性", target: 0.04, status: "buffered", bufferDestinationId: BUFFER_DEFAULT_ID, bufferDestination: BUFFER_DEFAULT },
  { id: "nasdaq-tech", layer: "投机层", element: "火", name: "纳斯达克100/科技主题", type: "科技成长", target: 0.05, status: "buffered", bufferDestinationId: BUFFER_DEFAULT_ID, bufferDestination: BUFFER_DEFAULT },
  { id: "speculative-stock", layer: "投机层", element: "火", name: "自选个股/行业ETF", type: "自选投机", target: 0.05, status: "buffered", bufferDestinationId: BUFFER_DEFAULT_ID, bufferDestination: BUFFER_DEFAULT },
];

const defaultData = {
  assets: HALF_FIRE_PLAN.map((row) => ({
    id: row.id || crypto.randomUUID(),
    layer: row.layer,
    element: row.element,
    name: row.name,
    type: row.type,
    target: row.target,
    status: row.status,
    bufferDestinationId: row.bufferDestinationId || "",
    bufferDestination: row.bufferDestination || "",
    value: 0,
    cost: 0,
    updated: "",
    note: row.layer === "投机层" && row.name.startsWith("纳斯达克") ? "投机层合计不超过10%；单只+50%卖一半，-30%不补不卖" : "",
  })),
  monthly: makeDefaultMonths(),
  entries: [],
  settings: {
    emergencyGoal: 20000,
  },
};

function makeDefaultMonths() {
  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({
      id: crypto.randomUUID(),
      month: `${d.getFullYear()}/${d.getMonth() + 1}`,
      income: 0,
      expense: 0,
      invested: 0,
      monthEndAssets: 0,
      specRatio: 0,
      note: "",
    });
  }
  return months;
}

let data = normalizeData(loadData());
let meta = loadMeta();
let editing = null;
let syncTimer = null;
let syncInFlight = false;
let syncPending = false;

function fillMissingMonths() {
  if (!Array.isArray(data.monthly)) data.monthly = [];
  if (!data.monthly.length) {
    data.monthly = makeDefaultMonths();
    return;
  }
  const last = data.monthly[data.monthly.length - 1];
  const [y, m] = (last.month || "").split("/").map(Number);
  if (!y || !m) return;
  const lastDate = new Date(y, m - 1, 1);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + 12, 1); // 12 months ahead
  while (lastDate < target) {
    lastDate.setMonth(lastDate.getMonth() + 1);
    const existing = data.monthly.find((item) => item.month === `${lastDate.getFullYear()}/${lastDate.getMonth() + 1}`);
    if (!existing) {
      data.monthly.push({
        id: crypto.randomUUID(),
        month: `${lastDate.getFullYear()}/${lastDate.getMonth() + 1}`,
        income: 0,
        expense: 0,
        invested: 0,
        monthEndAssets: 0,
        specRatio: 0,
        note: "",
      });
    }
  }
  // Keep at most 24 months (trim oldest)
  if (data.monthly.length > 24) {
    data.monthly = data.monthly.slice(data.monthly.length - 24);
  }
}
fillMissingMonths();

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultData);
    return JSON.parse(raw);
  } catch {
    return structuredClone(defaultData);
  }
}

function normalizeData(input) {
  const fallback = structuredClone(defaultData);
  const source = input && typeof input === "object" ? input : {};
  const assets = Array.isArray(source.assets) ? source.assets : fallback.assets;
  assets.forEach((a) => {
    if (a && typeof a === "object") {
      if (!a.id) a.id = crypto.randomUUID();
      if (typeof a.status === "undefined") a.status = "available";
      if (typeof a.bufferDestinationId === "undefined") a.bufferDestinationId = "";
      if (typeof a.bufferDestination === "undefined") a.bufferDestination = "";
    }
  });
  syncBufferDestinations(assets);
  const srcSettings = source.settings && typeof source.settings === "object" ? source.settings : {};
  return {
    assets,
    monthly: Array.isArray(source.monthly) ? source.monthly : fallback.monthly,
    entries: Array.isArray(source.entries) ? source.entries : fallback.entries,
    settings: {
      emergencyGoal: numberValue(srcSettings.emergencyGoal) || fallback.settings.emergencyGoal,
    },
  };
}

function isBufferedStatus(status) {
  return String(status || "") === "buffered" || String(status || "").startsWith("buffered:");
}

function isAvailableAsset(asset) {
  return asset && !isBufferedStatus(asset.status) && String(asset.status || "available") !== "paused:manual";
}

function syncBufferDestinations(assets) {
  assets.forEach(function (asset) {
    if (!asset || !isBufferedStatus(asset.status)) return;
    var byId = asset.bufferDestinationId ? assets.find(function (a) { return a.id === asset.bufferDestinationId && a.id !== asset.id; }) : null;
    var byName = asset.bufferDestination ? assets.find(function (a) { return a.name === asset.bufferDestination && a.id !== asset.id; }) : null;
    var fallback = assets.find(function (a) { return a.id === BUFFER_DEFAULT_ID && a.id !== asset.id; }) || assets.find(function (a) { return a.name === BUFFER_DEFAULT && a.id !== asset.id; });
    var dest = byId || byName || fallback;
    if (dest) {
      asset.bufferDestinationId = dest.id;
      asset.bufferDestination = dest.name;
    }
  });
}

function resolveBufferDestination(asset, products) {
  var destId = asset.bufferDestinationId || "";
  var destName = asset.bufferDestination || BUFFER_DEFAULT;
  return products.find(function (p) {
    var matches = destId ? p.asset.id === destId : p.asset.name === destName;
    return matches && p.asset.id !== asset.id && isAvailableAsset(p.asset) && !p.skipped;
  });
}

function computeEffectiveTargets(assets) {
  var targetSum = assets.reduce(function (s, a) { return s + numberValue(a.target); }, 0);
  var totalAssets = assets.reduce(function (s, a) { return s + numberValue(a.value); }, 0);
  var speculativeValue = assets.reduce(function (s, a) {
    return a.layer === "投机层" ? s + numberValue(a.value) : s;
  }, 0);
  var speculativePaused = totalAssets > 0 ? speculativeValue / totalAssets >= 0.10 : false;
  var result = {};

  assets.forEach(function (asset) {
    result[asset.id] = targetSum > 0 ? numberValue(asset.target) / targetSum : 0;
  });

  assets.forEach(function (asset) {
    if (!isBufferedStatus(asset.status) || (speculativePaused && asset.layer === "投机层")) return;
    var normTarget = targetSum > 0 ? numberValue(asset.target) / targetSum : 0;
    var dest = null;
    if (asset.bufferDestinationId) {
      dest = assets.find(function (a) { return a.id === asset.bufferDestinationId && a.id !== asset.id; });
    }
    if (!dest && asset.bufferDestination) {
      dest = assets.find(function (a) { return a.name === asset.bufferDestination && a.id !== asset.id; });
    }
    if (!dest) {
      dest = assets.find(function (a) { return a.id === BUFFER_DEFAULT_ID && a.id !== asset.id; }) || assets.find(function (a) { return a.name === BUFFER_DEFAULT && a.id !== asset.id; });
    }
    if (dest && isAvailableAsset(dest)) {
      result[dest.id] = numberValue(result[dest.id]) + normTarget;
    }
  });

  return result;
}

function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    return {
      updatedAt: saved.updatedAt || null,
      lastSyncedAt: saved.lastSyncedAt || null,
      lastSyncError: saved.lastSyncError || "",
    };
  } catch {
    return { updatedAt: null, lastSyncedAt: null, lastSyncError: "" };
  }
}

function persistMeta() {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function persistLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  persistMeta();
}

function saveData(options = {}) {
  if (options.touch !== false) {
    meta.updatedAt = new Date().toISOString();
  }
  persistLocal();
  if (window.supabase && window.supabase.isConfigured()) {
    scheduleCloudSave();
  }
}

function scheduleCloudSave() {
  if (!window.supabase || !window.supabase.isConfigured()) return;
  clearTimeout(syncTimer);
  syncPending = true;
  syncTimer = setTimeout(() => {
    syncPending = false;
    syncToCloud();
  }, 450);
}

// 立即触发尚未发出的防抖同步（页面切走/关闭前调用，避免丢失最后一次保存）
function flushPendingSync() {
  if (!syncPending) return;
  clearTimeout(syncTimer);
  syncPending = false;
  syncToCloud();
}

async function syncToCloud() {
  if (!window.supabase || !window.supabase.isConfigured() || syncInFlight) return;
  syncInFlight = true;
  window.supabase.setStatus("syncing");
  try {
    const record = await window.supabase.saveData(data, meta.updatedAt || new Date().toISOString());
    meta.lastSyncedAt = record.updatedAt || meta.updatedAt || new Date().toISOString();
    meta.lastSyncError = "";
    persistMeta();
    if (record.legacy) {
      window.supabase.setStatus("legacy", "正在使用旧同步策略；执行新版 schema.sql 后会自动切换为安全同步。");
    } else {
      window.supabase.setStatus("online", `上次同步：${formatDateTime(meta.lastSyncedAt)}`);
    }
  } catch (error) {
    meta.lastSyncError = error && error.message ? error.message : String(error);
    persistMeta();
    console.error("云同步保存失败：", error);
    window.supabase.setStatus("error", meta.lastSyncError);
  } finally {
    syncInFlight = false;
  }
}

function money(value) {
  const n = numberValue(value);
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function pct(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}

function numberValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function timeValue(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function formatDateTime(value) {
  if (!value) return "未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function hasMeaningfulData(source) {
  const target = normalizeData(source);
  const hasAssetValue = target.assets.some((item) => numberValue(item.value) !== 0 || numberValue(item.cost) !== 0 || item.updated);
  const hasMonthValue = target.monthly.some((item) =>
    numberValue(item.income) !== 0 ||
    numberValue(item.expense) !== 0 ||
    numberValue(item.invested) !== 0 ||
    numberValue(item.monthEndAssets) !== 0 ||
    String(item.note || "").trim()
  );
  return hasAssetValue || hasMonthValue || target.entries.length > 0;
}

function totals() {
  const value = data.assets.reduce((sum, item) => sum + numberValue(item.value), 0);
  const cost = data.assets.reduce((sum, item) => sum + numberValue(item.cost), 0);
  const profit = value - cost;
  const spec = data.assets
    .filter((item) => item.layer === "投机层")
    .reduce((sum, item) => sum + numberValue(item.value), 0);
  const last = data.assets
    .map((item) => item.updated)
    .filter(Boolean)
    .sort()
    .at(-1);
  return {
    value,
    cost,
    profit,
    profitRate: cost > 0 ? profit / cost : 0,
    specRatio: value > 0 ? spec / value : 0,
    last,
  };
}

function esc(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(text ?? "").replace(/[&<>"']/g, (ch) => map[ch]);
}

function layerClass(element) {
  if (element === "金水" || element.includes("金")) return "gold";
  if (element.includes("水")) return "water";
  if (element.includes("土")) return "earth";
  if (element.includes("火")) return "fire";
  return "ok";
}

function render() {
  try {
    renderDashboard();
    renderAssets();
    renderAllocate();
    renderFire();
    renderMonthly();
    renderEntries();
  } catch (err) {
    console.error("渲染失败：", err);
    document.querySelector("main").innerHTML =
      '<div style="padding:40px;text-align:center;color:#b91c1c">' +
      '<h2>页面渲染出错</h2>' +
      '<p>' + esc(err.message) + '</p>' +
      '<p style="color:#6b7280;margin-top:12px">尝试导出备份后清除浏览器数据，或导入上次的 JSON 备份。</p>' +
      '<button onclick="location.reload()" style="margin-top:16px;padding:8px 20px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer">刷新页面</button>' +
      '</div>';
  }
}

function renderDashboard() {
  const t = totals();
  document.querySelector("#totalAssets").textContent = money(t.value);
  document.querySelector("#totalCost").textContent = money(t.cost);
  document.querySelector("#totalProfit").textContent = money(t.profit);
  document.querySelector("#profitRate").textContent = pct(t.profitRate);
  document.querySelector("#specRatio").textContent = pct(t.specRatio);
  const overLimit = t.specRatio >= 0.1;
  document.querySelector("#specStatus").textContent = overLimit ? "达10%，暂停科技/个股" : "正常";
  const specCard = document.querySelector("#specRatio").closest(".metric");
  specCard.classList.toggle("alert", overLimit);
  document.querySelector("#lastUpdated").textContent = t.last ? `最近更新：${t.last}` : "尚未更新";
}

function renderAssets() {
  const list = document.querySelector("#assetList");
  const t = totals();
  const targetSum = data.assets.reduce((sum, item) => sum + numberValue(item.target), 0);
  const effectiveTargets = computeEffectiveTargets(data.assets);
  list.innerHTML = "";

  if (!data.assets.length) {
    list.innerHTML = '<div class="empty-state">' +
      '<div class="empty-icon">📊</div>' +
      '<b>还没有资产</b>' +
      '<p>点「套用22岁外派配置」一键导入推荐方案，或手动新增资产。</p>' +
      '</div>';
    return;
  }

  data.assets.forEach((item) => {
    const profit = numberValue(item.value) - numberValue(item.cost);
    const ratio = t.value > 0 ? numberValue(item.value) / t.value : 0;
    const normTarget = targetSum > 0 ? numberValue(item.target) / targetSum : 0;
    const effectiveTarget = numberValue(effectiveTargets[item.id]);
    const hasEffectiveIncoming = effectiveTarget > normTarget + 0.0001;
    const status = ratio - normTarget;
    const statusText = status > 0.05 ? "偏高：暂停/少投" : status < -0.05 ? "偏低：优先补" : "正常";
    const isBuffered = isBufferedStatus(item.status);
    const bufferDest = data.assets.find((a) => a.id === item.bufferDestinationId) || data.assets.find((a) => a.name === item.bufferDestination);
    const bufferBadge = isBuffered
      ? '<i class="badge fire">暂存→' + esc((bufferDest && bufferDest.name) || item.bufferDestination || BUFFER_DEFAULT) + "</i> "
      : "";
    const targetLine = hasEffectiveIncoming ? `<small class="effective-target">含暂存后 ${pct(effectiveTarget)}</small>` : "";
    const card = document.createElement("article");
    card.className = "card" + (isBuffered ? " buffered" : "");
    card.innerHTML = `
      <div class="card-title">
        <b>${esc(item.name)}</b>
        <span>${bufferBadge}<i class="badge ${layerClass(item.element)}">${esc(item.layer)}｜${esc(item.element)}</i> ${esc(item.type)}</span>
      </div>
      <div class="num"><span class="mini-label">当前市值</span><b>${money(item.value)}</b></div>
      <div class="num"><span class="mini-label">累计投入</span><b>${money(item.cost)}</b></div>
      <div class="num"><span class="mini-label">盈亏</span><b>${money(profit)}</b></div>
      <div class="num"><span class="mini-label">占比/目标</span><b>${pct(ratio)} / ${pct(normTarget)}</b>${targetLine}</div>
    `;
    card.addEventListener("click", () => openAssetEditor(item.id));
    list.appendChild(card);
  });

  const tips = document.querySelector("#rebalanceTips");
  const issues = data.assets
    .map((item) => {
      const ratio = t.value > 0 ? numberValue(item.value) / t.value : 0;
      const normTarget = targetSum > 0 ? numberValue(item.target) / targetSum : 0;
      const gapTarget = numberValue(effectiveTargets[item.id]) || normTarget;
      const gap = ratio - gapTarget;
      if (gap > 0.05) return `${esc(item.name)} 偏高 ${pct(gap)}，下月少投。`;
      if (gap < -0.05) {
        // 建议补仓金额：把该资产补到目标占比所需买入额
        var suggestAmt = t.value > 0 ? Math.round((gapTarget - ratio) * t.value) : 0;
        return `${esc(item.name)} 偏低 ${pct(Math.abs(gap))}，建议补 ${suggestAmt > 0 ? money(suggestAmt) : "—"}。`;
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, 4);
  tips.innerHTML = issues.length ? issues.map((text) => `<div class="tip">${text}</div>`).join("") : "";
}

function renderMonthly() {
  const list = document.querySelector("#monthlyList");
  list.innerHTML = "";
  const nowDate = new Date();
  const currentMonthKey = nowDate.getFullYear() + "/" + (nowDate.getMonth() + 1);

  // ---- 应急金进度条 ----
  renderEmergencyBar();

  // ---- 储蓄率趋势图 ----
  renderSavingChart();

  data.monthly.forEach((item) => {
    const income = numberValue(item.income);
    const expense = numberValue(item.expense);
    const invested = numberValue(item.invested);
    const surplus = income - expense;
    const savingRate = income > 0 ? invested / income : 0;
    var hasPlan = item.allocationPlan && Array.isArray(item.allocationPlan) && item.allocationPlan.length > 0;
    var plannedInvested = numberValue(item.plannedInvested);
    var planMode = item.effectiveAllocationMode || item.allocationMode || "";
    var planBadge = hasPlan
      ? '<i class="badge ok">计划 ' + money(plannedInvested) + (planMode ? "｜" + esc(planMode) : "") + '</i>'
      : "";
    var bufferedAllocTotal = numberValue(item.allocationSummary && item.allocationSummary.bufferedAllocTotal);
    var noteText = esc(item.note) || (hasPlan ? "" : "月度复盘");
    const status = savingRate >= 0.35 ? "达标" : "未达标";
    const isCurrent = item.month === currentMonthKey;
    const card = document.createElement("article");
    card.className = "card monthly-card" + (isCurrent ? " current-month" : "");
    card.innerHTML = `
      <div class="card-title">
        <b>${esc(item.month)}</b>
        <span class="card-meta"><i class="badge ${status === "达标" ? "ok" : "fire"}">${status}</i>${planBadge}${noteText ? `<em>${noteText}</em>` : ""}</span>
      </div>
      <div class="num"><span class="mini-label">收入</span><b>${money(income)}</b></div>
      <div class="num"><span class="mini-label">支出</span><b>${money(expense)}</b></div>
      <div class="num"><span class="mini-label">结余</span><b>${money(surplus)}</b></div>
      ${hasPlan ? `<div class="num"><span class="mini-label">计划投资</span><b>${money(plannedInvested)}</b></div>` : ""}
      ${hasPlan && bufferedAllocTotal > 0 ? `<div class="num"><span class="mini-label">含暂存</span><b>${money(bufferedAllocTotal)}</b></div>` : ""}
      <div class="num"><span class="mini-label">实际投入</span><b>${money(invested)}</b></div>
      <div class="num"><span class="mini-label">月末资产</span><b>${money(item.monthEndAssets)}</b></div>
      <div class="num"><span class="mini-label">储蓄率</span><b>${pct(savingRate)}</b></div>
    `;
    card.addEventListener("click", () => openMonthEditor(item.id));
    list.appendChild(card);
  });
  const currentCard = list.querySelector(".current-month");
  if (currentCard) {
    requestAnimationFrame(() => currentCard.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }
}

function renderEmergencyBar() {
  var el = document.querySelector("#emergencyBar");
  if (!el) return;
  var goal = numberValue(data.settings && data.settings.emergencyGoal) || 20000;
  // 应急金 = 现金层资产市值之和（货币基金）
  var cashValue = data.assets
    .filter(function (a) { return a.layer === "现金层" && isAvailableAsset(a); })
    .reduce(function (s, a) { return s + numberValue(a.value); }, 0);
  var progress = goal > 0 ? Math.min(cashValue / goal, 1) : 0;
  var reached = cashValue >= goal;
  var barEl = el.querySelector(".emergency-bar-fill");
  var textEl = el.querySelector(".emergency-bar-text");
  var subEl = el.querySelector(".emergency-bar-sub");
  if (barEl) barEl.style.width = (progress * 100).toFixed(1) + "%";
  if (barEl) barEl.className = "emergency-bar-fill" + (reached ? " reached" : "");
  if (textEl) textEl.textContent = reached
    ? "应急金已达标 ✓"
    : "应急金 " + money(cashValue) + " / " + money(goal);
  if (subEl) subEl.textContent = reached
    ? "可以开始按完整配置投资"
    : "未达标前优先补应急金，投资按 50% 力度执行";
  // 目标可点击编辑
  var editEl = el.querySelector(".emergency-edit");
  if (editEl) {
    editEl.textContent = "目标 " + money(goal);
    editEl.onclick = function () {
      var input = prompt("设置应急金目标金额（元）", goal);
      var val = parseFloat(input);
      if (!isNaN(val) && val > 0) {
        if (!data.settings) data.settings = {};
        data.settings.emergencyGoal = Math.round(val);
        saveData();
        renderEmergencyBar();
      }
    };
  }
}

function renderSavingChart() {
  var el = document.querySelector("#savingChart");
  if (!el) return;
  var nowIdx = monthIndex(currentMonth());
  var raw = data.monthly
    .filter(function (m) {
      var i = monthIndex(m.month);
      return Number.isFinite(i) && i <= nowIdx && numberValue(m.income) > 0;
    })
    .sort(function (a, b) { return monthIndex(a.month) - monthIndex(b.month); })
    .map(function (m) {
      var income = numberValue(m.income);
      var invested = numberValue(m.invested) || numberValue(m.plannedInvested);
      var rate = income > 0 ? invested / income : 0;
      var mo = String(m.month).replace(/^\d+\//, "") + "月";
      return { value: rate, label: mo };
    })
    .slice(-12);

  // 只在首尾和每隔 3 个显示标签，防止拥挤
  var series = raw.map(function(s, i) {
    var showLabel = i === 0 || i === raw.length - 1 || (raw.length <= 6) || i % 3 === 0;
    return { value: s.value, label: showLabel ? s.label : null };
  });

  var maxRate = Math.max(Math.max.apply(null, series.map(function(s){return s.value;})), 0.5);

  drawLineChart(el, series, {
    H: 100, padL: 30, padR: 8, padT: 8, padB: 20,
    maxVal: maxRate,
    targetVal: 0.35,
    targetLabel: "35%",
    emptyText: "填入 2 个月以上的收入和实际投入后显示储蓄率趋势。",
    yLabels: [
      { value: maxRate, label: Math.round(maxRate * 100) + "%" },
      { value: 0, label: "0%" },
    ],
  });
}

function renderEntries() {
  const list = document.querySelector("#entryList");
  list.innerHTML = "";
  const sorted = [...data.entries].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  if (!sorted.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><b>暂无记录</b><p>点「记一笔」记录收入、投资或大额消费。</p></div>';
    return;
  }

  // 按年月分组
  const groups = {};
  sorted.forEach((item) => {
    const key = String(item.date || "").slice(0, 7).replace("-", "/") || "未知";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  Object.keys(groups).sort((a, b) => b.localeCompare(a)).forEach((monthKey) => {
    const items = groups[monthKey];
    const totalIncome = items.filter(i => i.kind === "收入").reduce((s, i) => s + numberValue(i.amount), 0);
    const totalInvest = items.filter(i => i.kind === "投资").reduce((s, i) => s + numberValue(i.amount), 0);
    const isOpen = !document.querySelector(`[data-entry-group="${monthKey}"]`)?.classList.contains("closed");

    const groupEl = document.createElement("div");
    groupEl.className = "entry-group";
    groupEl.dataset.entryGroup = monthKey;

    const summary = [];
    if (totalIncome > 0) summary.push("收入 " + money(totalIncome));
    if (totalInvest > 0) summary.push("投资 " + money(totalInvest));

    groupEl.innerHTML =
      '<div class="entry-group-head">' +
        '<b>' + esc(monthKey) + '</b>' +
        '<span class="entry-group-meta">' + summary.join(" · ") + '<i class="entry-arrow">▾</i></span>' +
      '</div>' +
      '<div class="entry-group-body">' +
        items.map((item) =>
          '<article class="card entry-card" data-id="' + esc(item.id) + '">' +
            '<div class="card-title">' +
              '<b>' + (esc(item.date) || "未填日期") + '</b>' +
              '<span><i class="badge">' + esc(item.kind) + '</i> ' + (esc(item.note) || esc(item.target) || "") + '</span>' +
            '</div>' +
            '<div class="num"><span class="mini-label">金额</span><b>' + money(item.amount) + '</b></div>' +
            '<div class="num"><span class="mini-label">去向</span><b>' + (esc(item.target) || "-") + '</b></div>' +
            '<div class="num"><span class="mini-label">渠道</span><b>' + (esc(item.channel) || "-") + '</b></div>' +
            '<div class="num"><span class="mini-label">备注</span><b>' + (item.note ? "有" : "-") + '</b></div>' +
          '</article>'
        ).join("") +
      '</div>';

    groupEl.querySelector(".entry-group-head").addEventListener("click", () => {
      groupEl.classList.toggle("closed");
    });
    groupEl.querySelectorAll(".entry-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        openEntryEditor(card.dataset.id);
      });
    });

    list.appendChild(groupEl);
  });
}

function fireMoney(value) {
  return Math.round(numberValue(value) / 10000).toLocaleString("zh-CN") + " 万";
}

function calcFire(inputs) {
  var annualExpense = max0(numberValue(inputs.annualExpense));
  var supplementIncome = max0(numberValue(inputs.supplementIncome));
  var currentAge = max0(numberValue(inputs.currentAge));
  var targetAge = max0(numberValue(inputs.targetAge));
  var inflationRate = clamp(numberValue(inputs.inflationRatePct) / 100, 0, 1);
  var primaryRate = clamp(numberValue(inputs.realReturnPct) / 100, 0.01, 1);
  var years = Math.max(targetAge - currentAge, 0);
  var netAnnualExpense = Math.max(annualExpense - supplementIncome, 0);
  var nominalFactor = Math.pow(1 + inflationRate, years);
  var rates = [primaryRate, 0.035, 0.03];
  var lines = rates.map(function (rate) {
    var today = rate > 0 ? netAnnualExpense / rate : 0;
    return {
      rate: rate,
      today: today,
      nominal: today * nominalFactor,
    };
  });
  var total = totals().value;
  var progress = lines[0].today > 0 ? total / lines[0].today : 0;

  // ---- 达成日预测：用名义收益率把"当前净值 + 每月定投"滚到目标名义金额 ----
  // 目标用 3.5% 稳健线的名义金额（兼顾安全与现实），可由调用方覆盖
  var targetNominal = lines[1].nominal;
  var monthlyContribution = max0(numberValue(inputs.monthlyContribution));
  var expectedAnnual = clamp(numberValue(inputs.expectedReturnPct) / 100, 0, 1);
  var monthlyRate = Math.pow(1 + expectedAnnual, 1 / 12) - 1;
  var projection = projectMonthsToTarget(total, monthlyContribution, monthlyRate, targetNominal, inflationRate);

  // ---- 灵敏度：每月多投 1000 / 收益率 +1% 各能提前多少个月 ----
  var sensitivity = null;
  if (projection.reachable) {
    var basMonths = projection.months;
    var plusContribRate = Math.pow(1 + expectedAnnual, 1 / 12) - 1;
    var pc = projectMonthsToTarget(total, monthlyContribution + 1000, plusContribRate, targetNominal, inflationRate);
    var pr = projectMonthsToTarget(total, monthlyContribution, Math.pow(1 + clamp(expectedAnnual + 0.01, 0, 1), 1 / 12) - 1, targetNominal, inflationRate);
    sensitivity = {
      contributionMonths: pc.reachable ? Math.max(basMonths - pc.months, 0) : null,
      returnMonths: pr.reachable ? Math.max(basMonths - pr.months, 0) : null,
    };
  }

  return {
    annualExpense: annualExpense,
    supplementIncome: supplementIncome,
    currentAge: currentAge,
    targetAge: targetAge,
    years: years,
    inflationRate: inflationRate,
    primaryRate: primaryRate,
    netAnnualExpense: netAnnualExpense,
    nominalFactor: nominalFactor,
    lines: lines,
    totalAssets: total,
    progress: progress,
    monthlyContribution: monthlyContribution,
    expectedAnnual: expectedAnnual,
    targetNominal: targetNominal,
    projection: projection,
    sensitivity: sensitivity,
  };
}

// 月度滚动：value_{n+1} = value_n * (1+r) + contribution，直到达到（随通胀增长的）目标，返回月数
function projectMonthsToTarget(startValue, monthlyContribution, monthlyRate, targetNominalAtHorizon, annualInflation) {
  var monthlyInflation = Math.pow(1 + max0(annualInflation), 1 / 12) - 1;
  var value = max0(startValue);
  var target = max0(targetNominalAtHorizon);
  var contribution = max0(monthlyContribution);
  if (value >= target) return { reachable: true, months: 0, finalValue: value };
  // 不增长且不投入 → 永远到不了
  if (contribution <= 0 && monthlyRate <= 0) return { reachable: false, months: Infinity, finalValue: value };
  var MAX_MONTHS = 80 * 12; // 80 年上限，超出视为不可达
  var movingTarget = target;
  for (var m = 1; m <= MAX_MONTHS; m++) {
    value = value * (1 + monthlyRate) + contribution;
    // 目标本身随通胀缓慢上移，避免"名义目标固定但通胀吃掉购买力"的乐观偏差
    movingTarget = movingTarget * (1 + monthlyInflation);
    if (value >= movingTarget) return { reachable: true, months: m, finalValue: value };
  }
  return { reachable: false, months: Infinity, finalValue: value };
}

// 历史净值序列：从月度记录里取已填月末资产的月份，按时间排序，供折线图使用
function fireHistorySeries() {
  var nowIdx = monthIndex(currentMonth());
  return data.monthly
    .filter(function (m) {
      var i = monthIndex(m.month);
      return Number.isFinite(i) && i <= nowIdx && numberValue(m.monthEndAssets) > 0;
    })
    .map(function (m) { return { month: m.month, idx: monthIndex(m.month), value: numberValue(m.monthEndAssets) }; })
    .sort(function (a, b) { return a.idx - b.idx; });
}

// 把月数换算成"YYYY年M月"标签
function monthsToDateLabel(months) {
  if (!Number.isFinite(months)) return "—";
  var d = new Date();
  d.setMonth(d.getMonth() + Math.round(months));
  return d.getFullYear() + "年" + (d.getMonth() + 1) + "月";
}

function monthsToHuman(months) {
  if (!Number.isFinite(months)) return "超 80 年";
  var y = Math.floor(months / 12);
  var mo = Math.round(months % 12);
  if (y <= 0) return mo + " 个月";
  if (mo === 0) return y + " 年";
  return y + " 年 " + mo + " 个月";
}

function getFireInputs() {
  var annualExpenseEl = document.querySelector("#fireAnnualExpense");
  if (!annualExpenseEl) return null;
  var contribEl = document.querySelector("#fireMonthlyContribution");
  var contribRaw = contribEl ? contribEl.value : "";
  return {
    annualExpense: numberValue(annualExpenseEl.value || 180000),
    currentAge: numberValue(document.querySelector("#fireCurrentAge").value || 22),
    targetAge: numberValue(document.querySelector("#fireTargetAge").value || 35),
    inflationRatePct: numberValue(document.querySelector("#fireInflationRate").value || 3),
    realReturnPct: numberValue(document.querySelector("#fireRealReturn").value || 4),
    supplementIncome: numberValue(document.querySelector("#fireSupplementIncome").value || 60000),
    expectedReturnPct: numberValue((document.querySelector("#fireExpectedReturn") || {}).value || 7),
    monthlyContribution: numberValue(contribRaw !== "" ? contribRaw : estimateMonthlyContribution()),
  };
}

// 从月度记录估算每月可定投额：取过去（含当月）非零「实际投入/计划投资」的平均值，无历史则给保守默认
function estimateMonthlyContribution() {
  var nowIdx = monthIndex(currentMonth());
  var vals = data.monthly
    .filter(function (m) {
      var i = monthIndex(m.month);
      return Number.isFinite(i) && i <= nowIdx;
    })
    .map(function (m) { return numberValue(m.invested) || numberValue(m.plannedInvested); })
    .filter(function (v) { return v > 0; });
  if (!vals.length) return 6000;
  var sum = vals.reduce(function (s, v) { return s + v; }, 0);
  return Math.round(sum / vals.length);
}

function renderFire() {
  var inputs = getFireInputs();
  if (!inputs) return;
  var result = calcFire(inputs);
  var primaryLabel = (result.primaryRate * 100).toFixed(1).replace(/\.0$/, "") + "% 最低线（今天）";
  var primaryCard = document.querySelector("#fireToday4")?.closest(".fire-card");
  if (primaryCard) primaryCard.querySelector("span").textContent = primaryLabel;
  document.querySelector("#fireToday4").textContent = fireMoney(result.lines[0].today);
  document.querySelector("#fireNominal4").textContent = "目标年龄名义 " + fireMoney(result.lines[0].nominal);
  document.querySelector("#fireToday35").textContent = fireMoney(result.lines[1].today);
  document.querySelector("#fireNominal35").textContent = "目标年龄名义 " + fireMoney(result.lines[1].nominal);
  document.querySelector("#fireToday3").textContent = fireMoney(result.lines[2].today);
  document.querySelector("#fireNominal3").textContent = "目标年龄名义 " + fireMoney(result.lines[2].nominal);
  document.querySelector("#fireNetExpense").textContent = money(result.netAnnualExpense);
  document.querySelector("#fireNominalFactor").textContent = result.nominalFactor.toFixed(3);
  document.querySelector("#fireProgressText").textContent = pct(result.progress);
  document.querySelector("#fireProgressBar").style.width = Math.min(result.progress, 1) * 100 + "%";

  renderFireDashboard(result);
}

// FIRE 仪表盘：达成日 + 灵敏度 + 净值历史曲线（含预测线）
function renderFireDashboard(result) {
  var etaEl = document.querySelector("#fireEtaText");
  var etaSubEl = document.querySelector("#fireEtaSub");
  var sensEl = document.querySelector("#fireSensitivity");
  var chartEl = document.querySelector("#fireChart");
  if (!etaEl || !chartEl) return;

  var proj = result.projection;
  if (proj && proj.reachable) {
    if (proj.months === 0) {
      etaEl.textContent = "已达成 🎉";
      etaSubEl.textContent = "当前净值已覆盖 3.5% 稳健线目标";
    } else {
      etaEl.textContent = monthsToDateLabel(proj.months);
      etaSubEl.textContent = "约 " + monthsToHuman(proj.months) + "后 · 目标 " + fireMoney(result.targetNominal)
        + " · 月投 " + money(result.monthlyContribution) + " @ " + (result.expectedAnnual * 100).toFixed(0) + "%";
    }
  } else {
    etaEl.textContent = "超 80 年 / 不可达";
    etaSubEl.textContent = "提高月投入或预期收益率后再看（当前月投 " + money(result.monthlyContribution) + "）";
  }

  if (sensEl) {
    if (result.sensitivity) {
      var parts = [];
      if (result.sensitivity.contributionMonths != null) {
        parts.push("每月多投 ¥1000 → 提前 " + monthsToHuman(result.sensitivity.contributionMonths));
      }
      if (result.sensitivity.returnMonths != null) {
        parts.push("收益率 +1% → 提前 " + monthsToHuman(result.sensitivity.returnMonths));
      }
      sensEl.innerHTML = parts.length
        ? parts.map(function (p) { return '<span class="fire-sens-item">' + esc(p) + "</span>"; }).join("")
        : "";
      sensEl.style.display = parts.length ? "flex" : "none";
    } else {
      sensEl.style.display = "none";
    }
  }

  drawFireChart(chartEl, result);
}

// 通用折线图：series=[{label,value}]，opts={W,H,padL,padR,padT,padB,maxVal,targetVal,targetLabel,emptyText,dotClass,lineClass,forecastSeries,forecastClass,dotForecastClass}
function drawLineChart(el, series, opts) {
  if (!el) return;
  var o = opts || {};
  var W = o.W || 320, H = o.H || 120;
  var padL = o.padL !== undefined ? o.padL : 28;
  var padR = o.padR !== undefined ? o.padR : 8;
  var padT = o.padT !== undefined ? o.padT : 10;
  var padB = o.padB !== undefined ? o.padB : 22;
  var plotW = W - padL - padR, plotH = H - padT - padB;

  if (!series || series.length < 2) {
    el.innerHTML = '<div class="fire-chart-empty">' + esc(o.emptyText || "暂无数据") + '</div>';
    return;
  }

  var maxVal = o.maxVal || Math.max.apply(null, series.map(function(s){return s.value;})) * 1.1;
  if (maxVal <= 0) maxVal = 1;

  var x = function(i) { return padL + (i / (series.length - 1 + (o.forecastSeries ? o.forecastSeries.length : 0))) * plotW; };
  var xF = function(i) { return padL + ((series.length - 1 + i) / (series.length - 1 + (o.forecastSeries ? o.forecastSeries.length - 1 : 0))) * plotW; };
  var y = function(v) { return padT + plotH - (Math.max(v, 0) / maxVal) * plotH; };

  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="fire-svg" preserveAspectRatio="none">';

  // 目标水平线
  if (o.targetVal) {
    var ty = y(o.targetVal);
    svg += '<line x1="' + padL + '" y1="' + ty.toFixed(1) + '" x2="' + (W-padR) + '" y2="' + ty.toFixed(1) + '" class="fire-target-line"/>';
    if (o.targetLabel) {
      svg += '<text x="' + (padL-2) + '" y="' + (ty+3).toFixed(1) + '" class="fire-axis-label" text-anchor="end">' + esc(o.targetLabel) + '</text>';
    }
  }

  // 预测线
  if (o.forecastSeries && o.forecastSeries.length > 1) {
    var fcPts = o.forecastSeries.map(function(s,i){return xF(i).toFixed(1)+','+y(s.value).toFixed(1);}).join(' ');
    svg += '<polyline points="' + fcPts + '" class="' + (o.forecastClass||'fire-forecast-line') + '" fill="none"/>';
  }

  // 主折线
  var pts = series.map(function(s,i){return x(i).toFixed(1)+','+y(s.value).toFixed(1);}).join(' ');
  svg += '<polyline points="' + pts + '" class="' + (o.lineClass||'fire-history-line') + '" fill="none"/>';

  // 端点 + x 轴标签
  series.forEach(function(s, i) {
    var cx = x(i).toFixed(1), cy = y(s.value).toFixed(1);
    var reached = o.targetVal && s.value >= o.targetVal;
    svg += '<circle cx="' + cx + '" cy="' + cy + '" r="3" class="' + (reached ? 'fire-dot-target' : (o.dotClass||'fire-dot-now')) + '"/>';
    if (s.label) {
      svg += '<text x="' + cx + '" y="' + (H-5) + '" class="fire-axis-label" text-anchor="middle">' + esc(s.label) + '</text>';
    }
  });

  // y轴刻度
  if (o.yLabels) {
    o.yLabels.forEach(function(l) {
      var ly = y(l.value);
      svg += '<text x="' + (padL-2) + '" y="' + (ly+3).toFixed(1) + '" class="fire-axis-label" text-anchor="end">' + esc(l.label) + '</text>';
    });
  }

  // 特殊端点（FIRE 达成点）
  if (o.specialDot) {
    svg += '<circle cx="' + o.specialDot.cx.toFixed(1) + '" cy="' + o.specialDot.cy.toFixed(1) + '" r="4" class="fire-dot-target"/>';
    if (o.specialDot.label) {
      svg += '<text x="' + Math.min(o.specialDot.cx, W-padR).toFixed(1) + '" y="' + (H-5) + '" class="fire-axis-label" text-anchor="end">' + esc(o.specialDot.label) + '</text>';
    }
  }

  svg += '</svg>';
  el.innerHTML = svg;
}

// FIRE 净值曲线：调用通用 drawLineChart
function drawFireChart(el, result) {
  var history = fireHistorySeries();
  var proj = result.projection;

  if (!history.length && result.totalAssets <= 0) {
    el.innerHTML = '<div class="fire-chart-empty">在「月度」里填月末总资产后，这里会画出净值增长曲线和达成预测线。</div>';
    return;
  }

  var monthlyRate = Math.pow(1 + result.expectedAnnual, 1 / 12) - 1;
  var horizon = proj && proj.reachable && Number.isFinite(proj.months) ? proj.months : 30 * 12;
  horizon = Math.max(Math.min(horizon, 80 * 12), 12);
  var step = Math.max(Math.round(horizon / 48), 1);
  var fv = result.totalAssets;
  var forecast = [{ value: fv }];
  for (var m = 1; m <= horizon; m++) {
    fv = fv * (1 + monthlyRate) + result.monthlyContribution;
    if (m % step === 0 || m === horizon) forecast.push({ value: fv });
  }

  var histSeries = history.map(function(h, i) {
    return { value: h.value, label: i === 0 ? h.month.replace(/^\d+\//, "") + "月" : (i === history.length - 1 ? "今天" : null) };
  });
  if (!histSeries.length) histSeries = [{ value: result.totalAssets, label: "今天" }];

  var maxVal = Math.max(result.targetNominal, fv, result.totalAssets) * 1.08;

  // 达成点坐标（在预测线末段）
  var specialDot = null;
  if (proj && proj.reachable && proj.months > 0) {
    var W = 320, padL = 28, padR = 8;
    var totalPts = histSeries.length - 1 + forecast.length - 1;
    var fcIdx = forecast.length - 1;
    var cx = totalPts > 0 ? padL + ((histSeries.length - 1 + fcIdx) / totalPts) * (W - padL - padR) : W - padR;
    var ty = 10 + (120 - 10 - 22) - (Math.max(result.targetNominal, 0) / maxVal) * (120 - 10 - 22);
    specialDot = { cx: cx, cy: ty, label: monthsToDateLabel(proj.months) };
  }

  drawLineChart(el, histSeries, {
    H: 140, padL: 28,
    maxVal: maxVal,
    targetVal: result.targetNominal,
    targetLabel: "目标",
    forecastSeries: forecast,
    emptyText: "在「月度」里填月末总资产后显示曲线。",
    specialDot: specialDot,
    yLabels: [
      { value: result.targetNominal, label: fireMoney(result.targetNominal) },
    ],
  });
}
function monthIndex(month) {
  var parts = String(month || "").split("/").map(Number);
  if (!parts[0] || !parts[1]) return -Infinity;
  return parts[0] * 12 + parts[1] - 1;
}

function findPastValue(field, defaultValue) {
  var now = new Date();
  var currentKey = now.getFullYear() + "/" + (now.getMonth() + 1);
  var currentIndex = monthIndex(currentKey);
  // 优先当月
  var current = data.monthly.find(function (m) { return m.month === currentKey; });
  if (current && numberValue(current[field]) !== 0) return numberValue(current[field]);
  // 倒序找过去月份的非零值
  var past = data.monthly
    .filter(function (m) {
      var idx = monthIndex(m.month);
      return Number.isFinite(idx) && idx <= currentIndex;
    })
    .sort(function (a, b) { return monthIndex(b.month) - monthIndex(a.month); });
  for (var i = 0; i < past.length; i++) {
    var val = numberValue(past[i][field]);
    if (val !== 0) return val;
  }
  return defaultValue;
}

var allocState = {
  mode: "修正",
  expanded: {},
  dirty: false,
};

function getAllocInputs() {
  var savingRateRaw = parseFloat(document.querySelector("#allocSavingRate").value);
  return {
    income: max0(parseFloat(document.querySelector("#allocIncome").value)),
    expense: max0(parseFloat(document.querySelector("#allocExpense").value)),
    reserve: max0(parseFloat(document.querySelector("#allocReserve").value)),
    savingRatePct: clamp(Number.isFinite(savingRateRaw) ? savingRateRaw : 35, 0, 100),
  };
}

function calcAllocation(inputs) {
  var savingRate = inputs.savingRatePct / 100;
  var cashflowAvailable = Math.max(inputs.income - inputs.expense - inputs.reserve, 0);
  var targetSaving = inputs.income * savingRate;
  var rawInvestBase = Math.min(cashflowAvailable, targetSaving);
  var investBase = Math.round(rawInvestBase);
  var remainingCash = cashflowAvailable - investBase;

  var totalAssets = data.assets.reduce(function (s, a) { return s + numberValue(a.value); }, 0);
  var targetSum = data.assets.reduce(function (s, a) { return s + numberValue(a.target); }, 0);
  var speculativeValue = data.assets.reduce(function (s, a) {
    return a.layer === "投机层" ? s + numberValue(a.value) : s;
  }, 0);
  var speculativeRatio = totalAssets > 0 ? speculativeValue / totalAssets : 0;
  var speculativePaused = speculativeRatio >= 0.10;
  var useCorrection = allocState.mode === "修正" && totalAssets > 0 && targetSum > 0;

  var effectiveTargets = computeEffectiveTargets(data.assets);

  // 归一化权重
  var norms = data.assets.map(function (a) {
    var normTarget = targetSum > 0 ? numberValue(a.target) / targetSum : 0;
    return { asset: a, normTarget: normTarget, effectiveTarget: numberValue(effectiveTargets[a.id]) };
  });

  // 第一遍：按 status 分流
  var pool = [];
  var skipped = [];
  var bufferedList = []; // status === "buffered" 的产品，单独算重定向
  norms.forEach(function (n) {
    var currentRatio = totalAssets > 0 ? numberValue(n.asset.value) / totalAssets : 0;
    var gap = currentRatio - n.effectiveTarget;
    if (speculativePaused && n.asset.layer === "投机层") {
      skipped.push({ asset: n.asset, normTarget: n.normTarget, gap: gap, reason: "投机层超限暂停" });
    } else if (isBufferedStatus(n.asset.status)) {
      bufferedList.push({ asset: n.asset, normTarget: n.normTarget, gap: gap });
    } else if (useCorrection && gap > 0.05) {
      skipped.push({ asset: n.asset, normTarget: n.normTarget, gap: gap, reason: "偏高暂停" });
    } else {
      pool.push({ asset: n.asset, normTarget: n.normTarget, gap: gap, reason: "" });
    }
  });

  // 计算 buffered 应得总额（按它们的归一化权重，从 investBase 中预扣）
  var bufferedNormSum = bufferedList.reduce(function (s, b) { return s + b.normTarget; }, 0);
  var bufferedAllocTotal = Math.min(Math.round(investBase * bufferedNormSum), investBase);
  var poolInvestBase = investBase - bufferedAllocTotal;

  // 可投池权重（pool 内部按 poolWeightSum 分 poolInvestBase）
  var poolWeightSum = pool.reduce(function (s, p) { return s + p.normTarget; }, 0);
  var allocatedTotal = 0;
  var unbufferedCash = 0;
  var products = [];

  if (pool.length === 0 || poolWeightSum === 0) {
    pool.forEach(function (p) {
      products.push({ asset: p.asset, normTarget: p.normTarget, amount: 0, skipped: false, reason: "", bufferIncoming: 0 });
    });
  } else {
    var allocatedSum = 0;
    for (var i = 0; i < pool.length; i++) {
      var isLast = i === pool.length - 1;
      var raw = isLast ? poolInvestBase - allocatedSum : Math.round(poolInvestBase * pool[i].normTarget / poolWeightSum);
      var remaining = Math.max(poolInvestBase - allocatedSum, 0);
      var amt = isLast ? remaining : Math.min(Math.max(raw, 0), remaining);
      allocatedSum += amt;
      products.push({ asset: pool[i].asset, normTarget: pool[i].normTarget, amount: amt, skipped: false, reason: "", bufferIncoming: 0 });
    }
    allocatedTotal = allocatedSum;
  }

  // 处理 buffered：每只算自己应得的金额，redirect 到 destination
  var bufferedAllocSum = 0;
  bufferedList.forEach(function (b, idx) {
    var isLast = idx === bufferedList.length - 1;
    var raw = isLast
      ? bufferedAllocTotal - bufferedAllocSum
      : (bufferedNormSum > 0 ? Math.round(bufferedAllocTotal * b.normTarget / bufferedNormSum) : 0);
    var remaining = Math.max(bufferedAllocTotal - bufferedAllocSum, 0);
    var amt = isLast ? remaining : Math.min(Math.max(raw, 0), remaining);
    bufferedAllocSum += amt;

    // 解析 destination：优先 assetId，旧数据回退 name；destination 必须可买（防循环 / 防去向消失）
    var destProduct = resolveBufferDestination(b.asset, products);
    var destName = b.asset.bufferDestination || BUFFER_DEFAULT;

    if (destProduct && amt > 0) {
      destProduct.amount += amt;
      destProduct.bufferIncoming += amt;
      products.push({
        asset: b.asset,
        normTarget: b.normTarget,
        amount: 0,
        skipped: true,
        reason: "暂存中",
        bufferTo: destProduct.asset.name,
        bufferRedirected: amt,
        bufferIncoming: 0,
      });
      allocatedTotal += amt;
    } else {
      // 去向不存在或不可用：本月这部分钱保留为现金
      unbufferedCash += amt;
      products.push({
        asset: b.asset,
        normTarget: b.normTarget,
        amount: 0,
        skipped: true,
        reason: "暂存（去向不可用）",
        bufferTo: destName,
        bufferRedirected: 0,
        bufferUnavailable: amt,
        bufferIncoming: 0,
      });
    }
  });

  // 最后把 useCorrection / 投机层超限的 skipped 加进 products
  skipped.forEach(function (s) {
    products.push({ asset: s.asset, normTarget: s.normTarget, amount: 0, skipped: true, reason: s.reason, bufferIncoming: 0 });
  });

  // 按层级汇总（使用归一化权重）
  var layers = {};
  products.forEach(function (p) {
    var layer = p.asset.layer;
    if (!layers[layer]) layers[layer] = { name: layer, total: 0, normTargetSum: 0, products: [], allSkipped: true, hasSkipped: false };
    layers[layer].total += p.amount;
    layers[layer].normTargetSum += p.normTarget;
    layers[layer].products.push(p);
    if (!p.skipped) layers[layer].allSkipped = false;
    if (p.skipped) layers[layer].hasSkipped = true;
  });
  var layerOrder = ["现金层", "防御层", "生财层", "成长层", "投机层"];
  var extraLayers = Object.keys(layers).filter(function (l) { return layerOrder.indexOf(l) === -1; });
  var layerList = layerOrder.concat(extraLayers).filter(function (l) { return layers[l]; }).map(function (l) { return layers[l]; });

  return {
    inputs: inputs,
    cashflowAvailable: cashflowAvailable,
    targetSaving: targetSaving,
    investBase: investBase,
    allocatedTotal: allocatedTotal,
    remainingCash: remainingCash,
    actualRemainingCash: cashflowAvailable - allocatedTotal,
    savingRate: savingRate,
    savingRatePct: inputs.savingRatePct,
    useCorrection: useCorrection,
    totalAssets: totalAssets,
    targetSum: targetSum,
    targetMissing: targetSum <= 0,
    speculativeRatio: speculativeRatio,
    speculativePaused: speculativePaused,
    bufferedCount: bufferedList.length,
    bufferedAllocTotal: bufferedAllocTotal,
    unbufferedCash: unbufferedCash,
    products: products,
    layers: layerList,
  };
}

function statusLabel(layer) {
  if (layer.allSkipped && layer.products.some(function (p) { return p.reason === "投机层超限暂停"; })) return "超限暂停";
  if (layer.allSkipped && layer.products.every(function (p) { return p.reason === "暂存中" || p.reason === "暂存（去向不可用）"; })) return "全部暂存";
  if (layer.allSkipped) return "偏高暂停";
  if (layer.hasSkipped) return "部分暂停";
  if (layer.total === 0) return "暂停";
  return "正常";
}

function layerColor(element) {
  if (!element) return "";
  if (element === "金水" || element.includes("金")) return "gold";
  if (element.includes("水")) return "water";
  if (element.includes("土")) return "earth";
  if (element.includes("火")) return "fire";
  return "";
}

function renderAllocate() {
  var now = new Date();
  var currentKey = now.getFullYear() + "/" + (now.getMonth() + 1);
  var currentMonth = data.monthly.find(function (m) { return m.month === currentKey; });

  // 默认值
  var defIncome = currentMonth && numberValue(currentMonth.income) !== 0 ? numberValue(currentMonth.income) : findPastValue("income", 0);
  var defExpense = currentMonth && numberValue(currentMonth.expense) !== 0 ? numberValue(currentMonth.expense) : findPastValue("expense", 0);
  var defReserve = currentMonth && numberValue(currentMonth.reserve) !== 0 ? numberValue(currentMonth.reserve) : findPastValue("reserve", 0);
  var defSavingRate = currentMonth && numberValue(currentMonth.savingRate) !== 0 ? Math.round(numberValue(currentMonth.savingRate) * 100) : findPastValue("savingRate", 0) !== 0 ? Math.round(findPastValue("savingRate", 0) * 100) : 35;

  var incomeEl = document.querySelector("#allocIncome");
  var expenseEl = document.querySelector("#allocExpense");
  var reserveEl = document.querySelector("#allocReserve");
  var savingRateEl = document.querySelector("#allocSavingRate");

  if (allocState.dirty && document.querySelector("#allocate.active")) {
    refreshAllocation();
    return;
  }

  if (incomeEl) incomeEl.value = defIncome || "";
  if (expenseEl) expenseEl.value = defExpense || "";
  if (reserveEl) reserveEl.value = defReserve || "";
  if (savingRateEl) savingRateEl.value = defSavingRate;

  refreshAllocation();
}

function refreshAllocation() {
  var inputs = getAllocInputs();
  var result = calcAllocation(inputs);

  // Summary
  document.querySelector("#allocCashflow").textContent = money(result.cashflowAvailable);
  document.querySelector("#allocSavingPct").textContent = inputs.savingRatePct;
  document.querySelector("#allocTargetSaving").textContent = money(result.targetSaving);
  document.querySelector("#allocFinalInvest").textContent = money(result.allocatedTotal);
  document.querySelector("#allocRemaining").textContent = money(result.actualRemainingCash);
  renderAllocationChecklist(result);

  // Hint
  var hint = document.querySelector("#allocHint");
  hint.style.display = "none";
  if (result.targetMissing) {
    hint.style.display = "block";
    hint.textContent = "目标占比未设置，请先在资产页设置目标占比。";
  } else if (result.cashflowAvailable <= 0) {
    hint.style.display = "block";
    hint.textContent = "本月现金流不足，建议先不投资，保留现金。";
  } else if (result.targetSaving > result.cashflowAvailable) {
    hint.style.display = "block";
    hint.textContent = "本月现金流限制，实际建议投资低于目标储蓄。";
  } else if (result.useCorrection && result.allocatedTotal === 0 && result.investBase > 0) {
    hint.style.display = "block";
    hint.textContent = "当前配置无优先补仓项，本月建议保留现金。原始建议投资额度：" + money(result.investBase);
  } else if (result.speculativePaused) {
    hint.style.display = "block";
    hint.textContent = "投机层已达到或超过 10%，本月自动暂停给投机层分配新资金。";
  } else if (result.allocatedTotal < result.investBase) {
    hint.style.display = "block";
    hint.textContent = "部分产品偏高已暂停。原始建议投资额度：" + money(result.investBase);
  }

  // Layers
  var layersEl = document.querySelector("#allocLayers");
  layersEl.innerHTML = "";
  result.layers.forEach(function (layer) {
    var layerDiv = document.createElement("div");
    layerDiv.className = "alloc-layer" + (allocState.expanded[layer.name] ? " open" : "");
    var colorClass = layerColor(layer.products[0] && layer.products[0].asset.element);
    var statusText = statusLabel(layer);
    var statusBadge = statusText === "正常" ? '<i class="badge ok">正常</i>' : '<i class="badge fire">' + statusText + "</i>";

    layerDiv.innerHTML =
      '<div class="alloc-layer-head" data-layer="' + esc(layer.name) + '">' +
        '<div class="layer-label">' +
          '<i class="badge ' + colorClass + '">' + esc(layer.name) + "</i> " +
          statusBadge +
        "</div>" +
        '<div class="layer-amount">' +
          money(layer.total) +
          '<small>' + pct(layer.normTargetSum) + "</small>" +
        "</div>" +
        '<span class="layer-arrow">▾</span>' +
      "</div>" +
      '<div class="alloc-layer-body">' +
        layer.products.map(function (p) {
          var skippedClass = p.skipped ? " skipped" : "";
          var nameHtml = esc(p.asset.name);
          if (p.bufferTo && p.bufferRedirected > 0) {
            nameHtml += '<small class="prod-buffer">→ ' + esc(p.bufferTo) + " · " + money(p.bufferRedirected) + "</small>";
          } else if (p.reason === "暂存（去向不可用）") {
            nameHtml += '<small class="prod-buffer">→ ' + esc(p.bufferTo || "") + "（去向不可用）</small>";
          }
          var amountHtml = money(p.amount);
          var subText = pct(p.normTarget);
          if (p.skipped) subText += " · " + esc(p.reason);
          else if (p.bufferIncoming > 0) subText += " · 含 " + money(p.bufferIncoming) + " 暂存";
          return '<div class="alloc-product' + skippedClass + '">' +
            '<span class="prod-name">' + nameHtml + "</span>" +
            '<span class="prod-amount">' +
              amountHtml +
              "<small>" + subText + "</small>" +
            "</span>" +
          "</div>";
        }).join("") +
      "</div>";
    layersEl.appendChild(layerDiv);
  });

  // Head click handlers
  layersEl.querySelectorAll(".alloc-layer-head").forEach(function (head) {
    head.addEventListener("click", function () {
      var layerName = head.getAttribute("data-layer");
      allocState.expanded[layerName] = !allocState.expanded[layerName];
      refreshAllocation();
    });
  });
}

function renderAllocationChecklist(result) {
  var wrap = document.querySelector("#allocChecklist");
  if (!wrap) return;
  var inputs = result.inputs;
  var remainingDetail = result.unbufferedCash > 0 ? "含去向不可用暂存 " + money(result.unbufferedCash) : "可继续保留现金";
  var investDetail = result.bufferedAllocTotal > 0 ? "含暂存 " + money(result.bufferedAllocTotal) : "按目标直接买入";
  wrap.innerHTML =
    '<div class="checklist-title">工资到账后操作清单</div>' +
    '<div class="checklist-grid">' +
      '<div class="checklist-item"><span>固定支出账户</span><strong>' + money(inputs.expense) + '</strong><small>房租、订阅、保险等</small></div>' +
      '<div class="checklist-item"><span>机动预留</span><strong>' + money(inputs.reserve) + '</strong><small>聚餐、人情、交通等</small></div>' +
      '<div class="checklist-item primary"><span>本月计划投资</span><strong>' + money(result.allocatedTotal) + '</strong><small>' + investDetail + '</small></div>' +
      '<div class="checklist-item"><span>暂存/剩余现金</span><strong>' + money(result.actualRemainingCash) + '</strong><small>' + remainingDetail + '</small></div>' +
    '</div>';
}

function saveAllocation() {
  var inputs = getAllocInputs();
  if (inputs.income <= 0) {
    alert("请先填写月收入");
    return;
  }
  var result = calcAllocation(inputs);
  var now = new Date();
  var currentKey = now.getFullYear() + "/" + (now.getMonth() + 1);
  var currentMonth = data.monthly.find(function (m) { return m.month === currentKey; });

  var effectiveMode = allocState.mode;
  if (allocState.mode === "修正" && result.totalAssets === 0) {
    effectiveMode = "标准";
  }
  var modeForDisplay = effectiveMode;

  var allocationPlan = result.products.map(function (p) {
    return {
      assetId: p.asset.id,
      name: p.asset.name,
      layer: p.asset.layer,
      target: p.asset.target,
      normalizedTarget: p.normTarget,
      amount: p.amount,
      skipped: p.skipped,
      reason: p.reason || "",
      bufferTo: p.bufferTo || "",
      bufferRedirected: p.bufferRedirected || 0,
      bufferUnavailable: p.bufferUnavailable || 0,
      bufferIncoming: p.bufferIncoming || 0,
    };
  });

  var record = Object.assign({}, currentMonth || {}, {
    id: currentMonth ? currentMonth.id : crypto.randomUUID(),
    month: currentKey,
    income: inputs.income,
    expense: inputs.expense,
    plannedInvested: result.allocatedTotal,
    allocationPlan: allocationPlan,
    allocationSummary: {
      cashflowAvailable: result.cashflowAvailable,
      targetSaving: result.targetSaving,
      investBase: result.investBase,
      allocatedTotal: result.allocatedTotal,
      actualRemainingCash: result.actualRemainingCash,
      remainingCash: result.cashflowAvailable - result.investBase,
      bufferedAllocTotal: result.bufferedAllocTotal,
      unbufferedCash: result.unbufferedCash,
      speculativeRatio: result.speculativeRatio,
      speculativePaused: result.speculativePaused,
    },
    allocationMode: allocState.mode,
    effectiveAllocationMode: effectiveMode,
    reserve: inputs.reserve,
    savingRate: inputs.savingRatePct / 100,
    allocationNote: "本月计划投资 " + money(result.allocatedTotal) + "，储蓄率 " + inputs.savingRatePct + "%，模式：" + modeForDisplay,
    allocationCreatedAt: now.toISOString(),
    invested: currentMonth ? currentMonth.invested || 0 : 0,
    monthEndAssets: currentMonth ? currentMonth.monthEndAssets || 0 : 0,
    specRatio: currentMonth ? currentMonth.specRatio || 0 : 0,
    note: currentMonth ? currentMonth.note || "" : "",
  });

  if (currentMonth) {
    var idx = data.monthly.indexOf(currentMonth);
    data.monthly[idx] = record;
  } else {
    data.monthly.push(record);
  }

  saveData();
  allocState.dirty = false;
  var amount = result.allocatedTotal;
  var msgEl = document.querySelector("#allocSaveMsg");
  msgEl.style.display = "block";
  msgEl.innerHTML =
    '<span class="alloc-save-ok">' +
    (amount > 0
      ? "✓ 已保存：计划投资 <b>" + money(amount) + "</b>"
      : "✓ 已保存：本月建议保留现金") +
    '</span>' +
    '<button class="alloc-goto-monthly" type="button">去月度复盘 →</button>';
  document.querySelector(".alloc-goto-monthly").addEventListener("click", function () {
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    var tab = document.querySelector('[data-view="monthly"]');
    if (tab) tab.classList.add("active");
    var view = document.querySelector("#monthly");
    if (view) view.classList.add("active");
    render();
  });
}

var allocRebuildTimer = null;
function scheduleAllocRebuild() {
  allocState.dirty = true;
  clearTimeout(allocRebuildTimer);
  allocRebuildTimer = setTimeout(refreshAllocation, 200);
}

function max0(v) { return Math.max(isNaN(v) ? 0 : v, 0); }
function clamp(v, min, max) { return Math.min(Math.max(isNaN(v) ? min : v, min), max); }

document.addEventListener("DOMContentLoaded", function () {
  var incomeEl = document.querySelector("#allocIncome");
  var expenseEl = document.querySelector("#allocExpense");
  var reserveEl = document.querySelector("#allocReserve");
  var savingRateEl = document.querySelector("#allocSavingRate");

  if (incomeEl) {
    incomeEl.addEventListener("input", scheduleAllocRebuild);
    expenseEl.addEventListener("input", scheduleAllocRebuild);
    reserveEl.addEventListener("input", scheduleAllocRebuild);
    savingRateEl.addEventListener("input", scheduleAllocRebuild);
  }

  var correctBtn = document.querySelector("#allocModeCorrect");
  var standardBtn = document.querySelector("#allocModeStandard");
  if (correctBtn && standardBtn) {
    correctBtn.addEventListener("click", function () {
      allocState.mode = "修正";
      correctBtn.classList.add("active");
      standardBtn.classList.remove("active");
      refreshAllocation();
    });
    standardBtn.addEventListener("click", function () {
      allocState.mode = "标准";
      standardBtn.classList.add("active");
      correctBtn.classList.remove("active");
      refreshAllocation();
    });
  }

  var saveBtn = document.querySelector("#allocSaveBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveAllocation);

  ["#fireAnnualExpense", "#fireCurrentAge", "#fireTargetAge", "#fireInflationRate", "#fireRealReturn", "#fireSupplementIncome", "#fireExpectedReturn", "#fireMonthlyContribution"].forEach(function (selector) {
    var input = document.querySelector(selector);
    if (input) input.addEventListener("input", renderFire);
  });
});

function fieldsToHtml(fields, values) {
  return fields.map((field) => {
    const value = values[field.key] ?? "";
    const safeKey = esc(field.key);
    const safeLabel = esc(field.label);
    const safeValue = esc(value);
    if (field.type === "select") {
      return `<div class="field"><label>${safeLabel}</label><select name="${safeKey}">
        ${field.options.map((o) => {
          const optionValue = typeof o === "object" ? o.value : o;
          const optionLabel = typeof o === "object" ? o.label : o;
          return `<option value="${esc(optionValue)}" ${String(optionValue) === String(value) ? "selected" : ""}>${esc(optionLabel)}</option>`;
        }).join("")}
      </select></div>`;
    }
    if (field.type === "textarea") {
      return `<div class="field wide"><label>${safeLabel}</label><textarea name="${safeKey}" rows="3">${safeValue}</textarea></div>`;
    }
    const readonlyAttr = field.readonly ? ' readonly style="background:#f9fafb;color:#9ca3af"' : "";
    return `<div class="field"><label>${safeLabel}</label><input name="${safeKey}" type="${esc(field.type || "text")}" step="0.01" value="${safeValue}"${readonlyAttr}></div>`;
  }).join("");
}

function openEditor(config) {
  editing = config;
  document.querySelector("#dialogTitle").textContent = config.title;
  document.querySelector("#dialogFields").innerHTML = fieldsToHtml(config.fields, config.item);
  document.querySelector("#deleteBtn").style.visibility = config.isNew ? "hidden" : "visible";
  document.querySelector("#editorDialog").showModal();
}

function openAssetEditor(id) {
  const isNew = !id;
  const raw = isNew ? { id: crypto.randomUUID(), layer: "现金层", element: "水", name: "", type: "", target: 0.05, value: 0, cost: 0, updated: today(), note: "", status: "available", bufferDestinationId: "", bufferDestination: "" } : data.assets.find((x) => x.id === id);
  const item = { ...raw, target: Math.round(numberValue(raw.target) * 100), status: raw.status || "available", bufferDestinationId: raw.bufferDestinationId || "", bufferDestination: raw.bufferDestination || "" };
  // 暂存去向候选：所有 available 资产（排除自己），加一个空选项
  const destOptions = [{ value: "", label: "不指定" }].concat(
    data.assets
      .filter((a) => a.id !== item.id && isAvailableAsset(a))
      .map((a) => ({ value: a.id, label: a.name }))
  );
  openEditor({
    title: isNew ? "新增资产" : "编辑资产",
    isNew,
    item,
    collection: "assets",
    fields: [
      { key: "name", label: "产品名称" },
      { key: "layer", label: "层级", type: "select", options: ["现金层", "防御层", "生财层", "成长层", "投机层"] },
      { key: "element", label: "五行", type: "select", options: ["金", "水", "土", "火", "金水"] },
      { key: "type", label: "产品类型" },
      { key: "target", label: "目标占比（%）", type: "number", pctInput: true },
      { key: "status", label: "状态", type: "select", options: ["available", "buffered"], hint: "buffered=暂存到下方指定产品（如 QDII 限购阶段）" },
      { key: "bufferDestinationId", label: "暂存去向（仅 buffered 时生效）", type: "select", options: destOptions },
      { key: "value", label: "当前市值", type: "number" },
      { key: "cost", label: "累计投入", type: "number" },
      { key: "updated", label: "更新日期", type: "date" },
      { key: "note", label: "备注", type: "textarea" },
    ],
  });
}

function openMonthEditor(id) {
  const isNew = !id;
  const raw = isNew ? { id: crypto.randomUUID(), month: currentMonth(), income: 0, expense: 0, invested: 0, monthEndAssets: 0, specRatio: 0, note: "" } : data.monthly.find((x) => x.id === id);
  // 储蓄率：编辑时显示计算值（%），保存时不写回（由 income/invested 推算），只读展示
  const savingRateDisplay = numberValue(raw.income) > 0
    ? ((numberValue(raw.invested) / numberValue(raw.income)) * 100).toFixed(1)
    : "0.0";
  const item = { ...raw, _savingRateDisplay: savingRateDisplay };
  openEditor({
    title: isNew ? "新增月份" : "编辑月度复盘",
    isNew,
    item,
    collection: "monthly",
    fields: [
      { key: "month", label: "月份（如 2026/6）" },
      { key: "income", label: "月收入", type: "number" },
      { key: "expense", label: "月固定支出", type: "number" },
      { key: "invested", label: "实际投入（填完自动算储蓄率）", type: "number" },
      { key: "_savingRateDisplay", label: "储蓄率（%，自动计算，不用填）", type: "text", readonly: true },
      { key: "monthEndAssets", label: "月末总资产", type: "number" },
      { key: "specRatio", label: "投机层占比（0.10=10%）", type: "number" },
      { key: "note", label: "备注", type: "textarea" },
    ],
  });
}

function openEntryEditor(id) {
  const isNew = !id;
  const item = isNew ? { id: crypto.randomUUID(), date: today(), kind: "投资", amount: 0, target: "", channel: "", note: "" } : data.entries.find((x) => x.id === id);
  openEditor({
    title: isNew ? "记一笔" : "编辑记录",
    isNew,
    item,
    collection: "entries",
    fields: [
      { key: "date", label: "日期", type: "date" },
      { key: "kind", label: "类型", type: "select", options: ["收入", "投资", "消费", "转账", "其他"] },
      { key: "amount", label: "金额", type: "number" },
      { key: "target", label: "去向/产品" },
      { key: "channel", label: "渠道" },
      { key: "note", label: "备注", type: "textarea" },
    ],
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}/${d.getMonth() + 1}`;
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
    btn.classList.add("active");
    document.querySelector(`#${btn.dataset.view}`).classList.add("active");
  });
});

document.querySelector("#addAssetBtn").addEventListener("click", () => openAssetEditor());
document.querySelector("#addMonthBtn").addEventListener("click", () => openMonthEditor());
document.querySelector("#addEntryBtn").addEventListener("click", () => openEntryEditor());

document.querySelector("#applyHalfFireBtn")?.addEventListener("click", () => {
  if (!confirm("套用22岁外派配置：按新方案更新资产的目标占比、层级和暂存状态。\n\n• 不会改动当前市值/累计投入/更新日期/备注\n• 名称匹配的产品就地更新；新增的会创建；不在新方案里的会保留但目标设为0（你可以手动删除或调整）\n• QDII 类（标普500/全球医疗/纳指/矿股/自选）会被标记为 buffered → 货币基金，国内阶段自动暂存\n\n确定继续吗？")) return;
  var byName = {};
  data.assets.forEach(function (a) { byName[a.name] = a; });
  var nextAssets = [];
  HALF_FIRE_PLAN.forEach(function (row) {
    var existing = byName[row.name];
    if (existing) {
      nextAssets.push(Object.assign({}, existing, {
        layer: row.layer,
        element: row.element,
        type: row.type,
        target: row.target,
        status: row.status,
        bufferDestinationId: row.bufferDestinationId || "",
        bufferDestination: row.bufferDestination || "",
      }));
      delete byName[row.name];
    } else {
      nextAssets.push({
        id: row.id || crypto.randomUUID(),
        layer: row.layer,
        element: row.element,
        name: row.name,
        type: row.type,
        target: row.target,
        status: row.status,
        bufferDestinationId: row.bufferDestinationId || "",
        bufferDestination: row.bufferDestination || "",
        value: 0,
        cost: 0,
        updated: "",
        note: "",
      });
    }
  });
  // 旧方案有但新方案没有的产品：保留但目标占比设为0，且改回 available 避免被无意 buffered
  Object.keys(byName).forEach(function (name) {
    var orphan = byName[name];
    nextAssets.push(Object.assign({}, orphan, { target: 0, status: "available", bufferDestinationId: "", bufferDestination: "", note: (orphan.note ? orphan.note + "｜" : "") + "已不在新方案，建议清仓后删除" }));
  });
  data.assets = nextAssets;
  syncBufferDestinations(data.assets);
  saveData();
  render();
  alert("新配置已套用。建议去「资产」Tab 检查每项的层级、目标占比和状态，确认无误后开始按新比例补仓。");
});

document.querySelector("#unlockBufferedBtn")?.addEventListener("click", () => {
  if (!confirm("把所有「暂存中」的资产改为「可买」状态。出海开通海外渠道后用。会清空它们的暂存去向。当前市值/累计投入不变。确定吗？")) return;
  var count = 0;
  data.assets.forEach(function (asset) {
    if (!isBufferedStatus(asset.status)) return;
    asset.status = "available";
    asset.bufferDestinationId = "";
    asset.bufferDestination = "";
    count += 1;
  });
  saveData();
  render();
  alert("已解锁 " + count + " 个暂存资产。后续分配会按可买资产正常计算。");
});

function refreshSyncDialog() {
  const codeEl = document.querySelector("#syncCodeText");
  const helpEl = document.querySelector("#syncHelp");
  if (!codeEl || !window.supabase) return;
  codeEl.value = window.supabase.getSyncCode();
  if (helpEl) {
    helpEl.textContent = meta.lastSyncError
      ? `最近同步错误：${meta.lastSyncError}`
      : `最近同步：${formatDateTime(meta.lastSyncedAt)}`;
  }
}

document.querySelector("#syncBtn")?.addEventListener("click", () => {
  refreshSyncDialog();
  document.querySelector("#syncDialog").showModal();
});

document.querySelector("#copySyncCodeBtn")?.addEventListener("click", async () => {
  const code = document.querySelector("#syncCodeText").value;
  try {
    await navigator.clipboard.writeText(code);
    document.querySelector("#syncHelp").textContent = "同步码已复制。到另一台设备打开 App，粘贴后点“导入并同步”。";
  } catch {
    document.querySelector("#syncCodeText").select();
    document.querySelector("#syncHelp").textContent = "浏览器禁止自动复制，已帮你选中同步码，请手动复制。";
  }
});

document.querySelector("#applySyncCodeBtn")?.addEventListener("click", async () => {
  const input = document.querySelector("#importSyncCodeText");
  const code = input.value.trim();
  if (!code) {
    document.querySelector("#syncHelp").textContent = "请先粘贴同步码。";
    return;
  }
  if (!confirm("导入同步码后，本设备会连接到同一份云端数据。继续吗？")) return;
  try {
    window.supabase.applySyncCode(code);
    input.value = "";
    refreshSyncDialog();
    await initCloudSync({ preferCloud: true });
    document.querySelector("#syncHelp").textContent = "同步码已导入，本设备已切换到同一份云端数据。";
  } catch (error) {
    document.querySelector("#syncHelp").textContent = `导入失败：${error.message}`;
  }
});

document.querySelector("#resetSyncCodeBtn")?.addEventListener("click", async () => {
  if (!confirm("确定要生成新的同步身份吗？旧设备不会自动跟随，新旧数据也不会自动合并。")) return;
  window.supabase.resetIdentity();
  meta.lastSyncedAt = null;
  meta.lastSyncError = "";
  saveData({ touch: true, sync: true });
  refreshSyncDialog();
  document.querySelector("#syncHelp").textContent = "已生成新的同步码，并开始把本机数据写入新的云端记录。";
});

document.querySelector("#editorForm").addEventListener("submit", (event) => {
  if (event.submitter?.value !== "save") return;
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const updated = { ...editing.item };
  editing.fields.forEach((field) => {
    if (field.key.startsWith("_") || field.readonly) return; // 内部展示字段不写入
    const raw = form.get(field.key);
    if (field.pctInput) {
      updated[field.key] = numberValue(raw) / 100;
    } else {
      updated[field.key] = field.type === "number" ? numberValue(raw) : raw;
    }
  });
  const collection = data[editing.collection];
  const index = collection.findIndex((item) => item.id === updated.id);
  if (index >= 0) collection[index] = updated;
  else collection.push(updated);
  if (editing.collection === "assets") syncBufferDestinations(data.assets);
  saveData();
  document.querySelector("#editorDialog").close();
  render();
});

document.querySelector("#deleteBtn").addEventListener("click", () => {
  if (!editing || editing.isNew) return;
  if (!confirm("确定要删除这条记录吗？此操作不可撤销。")) return;
  data[editing.collection] = data[editing.collection].filter((item) => item.id !== editing.item.id);
  saveData();
  document.querySelector("#editorDialog").close();
  render();
});

document.querySelector("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `五行理财备份-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#importInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed.assets || !parsed.monthly || !parsed.entries) throw new Error("格式不正确");
    data = normalizeData(parsed);
    saveData();
    render();
  } catch (error) {
    alert(`导入失败：${error.message}`);
  } finally {
    event.target.value = "";
  }
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js");
}

async function initCloudSync(options = {}) {
  if (!window.supabase) return;
  if (!window.supabase.isConfigured()) {
    window.supabase.setStatus("offline");
    return;
  }

  window.supabase.setStatus("syncing");
  try {
    const record = await window.supabase.loadRecord();
    const localTime = timeValue(meta.updatedAt);
    const cloudTime = timeValue(record && record.updatedAt);
    const localHasData = hasMeaningfulData(data);

    if (record && record.data) {
      if (options.preferCloud || !localHasData || cloudTime >= localTime) {
        data = normalizeData(record.data);
        fillMissingMonths();
        meta.updatedAt = record.updatedAt || meta.updatedAt || new Date().toISOString();
        meta.lastSyncedAt = record.updatedAt || meta.updatedAt;
        meta.lastSyncError = "";
        persistLocal();
        render();
        if (record.legacy) {
          window.supabase.setStatus("legacy", "正在使用旧同步策略；执行新版 schema.sql 后会自动切换为安全同步。");
        } else {
          window.supabase.setStatus("online", `上次同步：${formatDateTime(meta.lastSyncedAt)}`);
        }
        if (record.protected === false && !record.legacy) {
          await syncToCloud();
        }
      } else {
        await syncToCloud();
      }
    } else {
      if (localHasData) {
        await syncToCloud();
      } else {
        window.supabase.setStatus("online", "云端已连接，编辑后会自动同步");
      }
    }
  } catch (error) {
    meta.lastSyncError = error && error.message ? error.message : String(error);
    persistMeta();
    console.error("云同步初始化失败：", error);
    window.supabase.setStatus("error", meta.lastSyncError);
  } finally {
    refreshSyncDialog();
  }
}

// 静默从云端拉取：仅当云端确实更新（updatedAt 更新）且本地无挂起改动时才覆盖，
// 用于切回页面/网络恢复后把其它设备的改动同步过来，不打扰当前编辑。
async function pullFromCloudIfNewer() {
  if (!window.supabase || !window.supabase.isConfigured()) return;
  if (syncInFlight || syncPending) return; // 本地有待发改动，优先保本地，等下次再拉
  if (document.querySelector("dialog[open]")) return; // 用户正在编辑/看同步码，别换掉底层数据
  try {
    const record = await window.supabase.loadRecord();
    if (!record || !record.data) return;
    const cloudTime = timeValue(record.updatedAt);
    const localTime = timeValue(meta.updatedAt);
    if (cloudTime <= localTime) return; // 云端不比本地新，无需覆盖
    data = normalizeData(record.data);
    fillMissingMonths();
    meta.updatedAt = record.updatedAt;
    meta.lastSyncedAt = record.updatedAt;
    meta.lastSyncError = "";
    persistLocal();
    render();
    window.supabase.setStatus("online", `已拉取最新：${formatDateTime(meta.lastSyncedAt)}`);
  } catch (error) {
    // 静默失败：不打断用户，仅记录，等下次可见/网络事件再试
    console.warn("后台拉取云端失败：", error);
  }
}

// 页面重新可见：拉云端最新；切走/隐藏：flush 未发出的同步，避免关页面丢数据
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") {
    pullFromCloudIfNewer();
  } else {
    flushPendingSync();
  }
});

// pagehide（关闭/刷新/后退）也兜底 flush 一次
window.addEventListener("pagehide", flushPendingSync);

// 网络恢复：补发挂起的同步，并拉一次云端
window.addEventListener("online", function () {
  if (syncPending) {
    flushPendingSync();
  } else {
    pullFromCloudIfNewer();
  }
});

render();
initCloudSync();
