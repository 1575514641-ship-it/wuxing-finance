const STORAGE_KEY = "wuxing-finance-app-v1";
const META_KEY = "wuxing-finance-meta-v1";

const defaultData = {
  assets: [
    ["现金层", "水", "货币基金", "流动现金", 0.06],
    ["现金层", "水", "同业存单指数基金", "低波固收", 0.02],
    ["现金层", "水", "短债基金", "低波固收", 0.02],
    ["防御层", "金", "黄金积存/黄金ETF", "黄金类", 0.15],
    ["防御层", "金", "红利低波指数", "红利类", 0.10],
    ["防御层", "金", "中长期纯债基金", "债券类", 0.10],
    ["生财层", "土", "偏债混合基金", "稳健增值", 0.10],
    ["生财层", "土", "沪深300/A500指数", "宽基指数", 0.10],
    ["生财层", "土", "储蓄国债/大额存单", "安全底仓", 0.05],
    ["成长层", "金水", "标普500", "海外宽基", 0.10],
    ["成长层", "金水", "全球医疗/制药", "海外主题", 0.05],
    ["成长层", "金", "黄金矿业股", "黄金弹性", 0.05],
    ["投机层", "火", "纳斯达克100/科技主题", "科技成长", 0.05],
    ["投机层", "火", "自选个股/行业ETF", "自选投机", 0.05],
  ].map((row, idx) => ({
    id: crypto.randomUUID(),
    layer: row[0],
    element: row[1],
    name: row[2],
    type: row[3],
    target: row[4],
    value: 0,
    cost: 0,
    updated: "",
    note: idx === 12 ? "投机层合计不超过10%" : "",
  })),
  monthly: makeDefaultMonths(),
  entries: [],
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
  return {
    assets: Array.isArray(source.assets) ? source.assets : fallback.assets,
    monthly: Array.isArray(source.monthly) ? source.monthly : fallback.monthly,
    entries: Array.isArray(source.entries) ? source.entries : fallback.entries,
  };
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
  syncTimer = setTimeout(() => {
    syncToCloud();
  }, 450);
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
  const overLimit = t.specRatio > 0.1;
  document.querySelector("#specStatus").textContent = overLimit ? "超10%，先停科技/个股" : "正常";
  const specCard = document.querySelector("#specRatio").closest(".metric");
  specCard.classList.toggle("alert", overLimit);
  document.querySelector("#lastUpdated").textContent = t.last ? `最近更新：${t.last}` : "尚未更新";
}

function renderAssets() {
  const list = document.querySelector("#assetList");
  const t = totals();
  list.innerHTML = "";
  data.assets.forEach((item) => {
    const profit = numberValue(item.value) - numberValue(item.cost);
    const ratio = t.value > 0 ? numberValue(item.value) / t.value : 0;
    const status = ratio - numberValue(item.target);
    const statusText = status > 0.05 ? "偏高：暂停/少投" : status < -0.05 ? "偏低：优先补" : "正常";
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">
        <b>${esc(item.name)}</b>
        <span><i class="badge ${layerClass(item.element)}">${esc(item.layer)}｜${esc(item.element)}</i> ${esc(item.type)}</span>
      </div>
      <div class="num"><span class="mini-label">当前市值</span><b>${money(item.value)}</b></div>
      <div class="num"><span class="mini-label">累计投入</span><b>${money(item.cost)}</b></div>
      <div class="num"><span class="mini-label">盈亏</span><b>${money(profit)}</b></div>
      <div class="num"><span class="mini-label">占比/目标</span><b>${pct(ratio)} / ${pct(item.target)}</b></div>
    `;
    card.addEventListener("click", () => openAssetEditor(item.id));
    list.appendChild(card);
  });

  const tips = document.querySelector("#rebalanceTips");
  const issues = data.assets
    .map((item) => {
      const ratio = t.value > 0 ? numberValue(item.value) / t.value : 0;
      const gap = ratio - numberValue(item.target);
      if (gap > 0.05) return `${esc(item.name)} 偏高 ${pct(gap)}，下月少投。`;
      if (gap < -0.05) return `${esc(item.name)} 偏低 ${pct(Math.abs(gap))}，可优先补。`;
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

function renderEntries() {
  const list = document.querySelector("#entryList");
  list.innerHTML = "";
  const sorted = [...data.entries].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!sorted.length) {
    list.innerHTML = `<article class="metric"><span>暂无记录</span><strong>记第一笔</strong><small>收入、投资、大额消费都可以</small></article>`;
    return;
  }
  sorted.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">
        <b>${esc(item.date) || "未填日期"}</b>
        <span><i class="badge">${esc(item.kind)}</i> ${esc(item.note) || esc(item.target) || ""}</span>
      </div>
      <div class="num"><span class="mini-label">金额</span><b>${money(item.amount)}</b></div>
      <div class="num"><span class="mini-label">去向</span><b>${esc(item.target) || "-"}</b></div>
      <div class="num"><span class="mini-label">渠道</span><b>${esc(item.channel) || "-"}</b></div>
      <div class="num"><span class="mini-label">备注</span><b>${item.note ? "有" : "-"}</b></div>
    `;
    card.addEventListener("click", () => openEntryEditor(item.id));
    list.appendChild(card);
  });
}

// ---- 月薪分配 ----
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
  var useCorrection = allocState.mode === "修正" && totalAssets > 0 && targetSum > 0;

  // 归一化权重
  var norms = data.assets.map(function (a) {
    return { asset: a, normTarget: targetSum > 0 ? numberValue(a.target) / targetSum : 0 };
  });

  // 修正模式：标记偏高产品
  var pool = [];
  var skipped = [];
  norms.forEach(function (n) {
    var currentRatio = totalAssets > 0 ? numberValue(n.asset.value) / totalAssets : 0;
    var gap = currentRatio - n.normTarget;
    if (useCorrection && gap > 0.05) {
      skipped.push({ asset: n.asset, normTarget: n.normTarget, gap: gap, reason: "偏高暂停" });
    } else {
      pool.push({ asset: n.asset, normTarget: n.normTarget, gap: gap, reason: "" });
    }
  });

  // 可投池权重
  var poolWeightSum = pool.reduce(function (s, p) { return s + p.normTarget; }, 0);
  var allocatedTotal = 0;
  var products = [];

  if (pool.length === 0 || poolWeightSum === 0) {
    // 全部偏高或无目标
    allocatedTotal = 0;
    pool.forEach(function (p) {
      products.push({ asset: p.asset, normTarget: p.normTarget, amount: 0, skipped: false, reason: "" });
    });
    skipped.forEach(function (s) {
      products.push({ asset: s.asset, normTarget: s.normTarget, amount: 0, skipped: true, reason: s.reason });
    });
  } else {
    // 分配金额（最后一个兜底尾差）
    var allocatedSum = 0;
    for (var i = 0; i < pool.length; i++) {
      var isLast = i === pool.length - 1;
      var raw = isLast ? investBase - allocatedSum : Math.round(investBase * pool[i].normTarget / poolWeightSum);
      var remaining = Math.max(investBase - allocatedSum, 0);
      var amt = isLast ? remaining : Math.min(Math.max(raw, 0), remaining);
      allocatedSum += amt;
      products.push({ asset: pool[i].asset, normTarget: pool[i].normTarget, amount: amt, skipped: false, reason: "" });
    }
    skipped.forEach(function (s) {
      products.push({ asset: s.asset, normTarget: s.normTarget, amount: 0, skipped: true, reason: s.reason });
    });
    allocatedTotal = allocatedSum;
  }

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
    products: products,
    layers: layerList,
  };
}

function statusLabel(layer) {
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
          return '<div class="alloc-product' + skippedClass + '">' +
            '<span class="prod-name">' + esc(p.asset.name) + "</span>" +
            '<span class="prod-amount">' +
              money(p.amount) +
              "<small>" + pct(p.normTarget) + (p.skipped ? " · " + esc(p.reason) : "") + "</small>" +
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
  var msg = result.allocatedTotal > 0
    ? "已保存本月计划：计划投资 " + money(result.allocatedTotal) + "。实际执行后可在随手记记录。"
    : "已保存本月计划：本月建议保留现金。实际执行后可在随手记记录。";
  var msgEl = document.querySelector("#allocSaveMsg");
  msgEl.style.display = "block";
  msgEl.textContent = msg;

  // 跳转到月度 Tab
  setTimeout(function () {
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    var monthlyTab = document.querySelector('[data-view="monthly"]');
    if (monthlyTab) monthlyTab.classList.add("active");
    var monthlyView = document.querySelector("#monthly");
    if (monthlyView) monthlyView.classList.add("active");
    render();
  }, 800);
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
});

function fieldsToHtml(fields, values) {
  return fields.map((field) => {
    const value = values[field.key] ?? "";
    const safeKey = esc(field.key);
    const safeLabel = esc(field.label);
    const safeValue = esc(value);
    if (field.type === "select") {
      return `<div class="field"><label>${safeLabel}</label><select name="${safeKey}">
        ${field.options.map((o) => `<option value="${esc(o)}" ${String(o) === String(value) ? "selected" : ""}>${esc(o)}</option>`).join("")}
      </select></div>`;
    }
    if (field.type === "textarea") {
      return `<div class="field wide"><label>${safeLabel}</label><textarea name="${safeKey}" rows="3">${safeValue}</textarea></div>`;
    }
    return `<div class="field"><label>${safeLabel}</label><input name="${safeKey}" type="${esc(field.type || "text")}" step="0.01" value="${safeValue}"></div>`;
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
  const raw = isNew ? { id: crypto.randomUUID(), layer: "现金层", element: "水", name: "", type: "", target: 0.05, value: 0, cost: 0, updated: today(), note: "" } : data.assets.find((x) => x.id === id);
  const item = { ...raw, target: Math.round(numberValue(raw.target) * 100) };
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
      { key: "value", label: "当前市值", type: "number" },
      { key: "cost", label: "累计投入", type: "number" },
      { key: "updated", label: "更新日期", type: "date" },
      { key: "note", label: "备注", type: "textarea" },
    ],
  });
}

function openMonthEditor(id) {
  const isNew = !id;
  const item = isNew ? { id: crypto.randomUUID(), month: currentMonth(), income: 0, expense: 0, invested: 0, monthEndAssets: 0, specRatio: 0, note: "" } : data.monthly.find((x) => x.id === id);
  openEditor({
    title: isNew ? "新增月份" : "编辑月度复盘",
    isNew,
    item,
    collection: "monthly",
    fields: [
      { key: "month", label: "月份（如 2026/5）" },
      { key: "income", label: "月收入", type: "number" },
      { key: "expense", label: "月固定支出", type: "number" },
      { key: "invested", label: "实际投入", type: "number" },
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

render();
initCloudSync();
