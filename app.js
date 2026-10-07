const STORAGE_KEY = "wuxing-finance-app-v1";
const META_KEY = "wuxing-finance-meta-v1";
const LAST_KIND_KEY = "wuxing-last-entry-kind";

// ===== v8.1 唯一配置源（v8.0 定版 2026-10-06，v8.1 只改上限来源与溢价档位）=====
// 全站只有这一份「五行 ↔ 层级 ↔ 目标比例 ↔ 产品」对应关系：
// 资产页、分配页、规则页五行对照表、FIRE 测算都从这里取数，不要在别处写死比例。
// 比例合计 100%；股票类（生财+成长+投机）约 60%，对应最大回撤约 30%。
const V8_VERSION = "8.1";
const V8_LAYERS = [
  { name: "现金层", label: "现金 / 弹药", element: "水", target: 0.05, cap: null, note: "货币基金；也是弹药罐，只给大跌补仓用" },
  { name: "防御层", label: "防御", element: "金", target: 0.35, cap: null, note: "黄金 10% + 长债 12.5% + 短债 12.5%" },
  { name: "生财层", label: "生财", element: "土", target: 0.25, cap: null, note: "A500 12% + 红利低波 8% + 中证500 5%" },
  { name: "成长层", label: "成长", element: "水", target: 0.30, cap: null, note: "标普500 QDII（看溢价决定场内/场外）" },
  { name: "投机层", label: "投机", element: "火", target: 0.05, cap: 0.10, note: "纳指100；上限 10%，亏光不补" },
  { name: "规避层", label: "规避", element: "木", target: 0, cap: 0, note: "杠杆、虚拟币、期权、初创股权（不可配置）" },
];
// 产品表：id 沿用 v7 既有 id，保证随手记的历史联动不丢
const V8_PRODUCTS = [
  { id: "cash-rmb", layer: "现金层", element: "水", name: "货币基金", type: "RMB流动现金", target: 0.05, code: "000198/003474", feePct: 0.20, channel: "场外", buyStatus: "正常", status: "available", note: "余额宝 / 南方天天利B；同时是弹药罐，只给大跌补仓用" },
  { id: "gold-etf", layer: "防御层", element: "金", name: "黄金ETF", type: "黄金类", target: 0.10, code: "518850", feePct: 0.20, channel: "场内", buyStatus: "正常", status: "available", cap: 0.10, note: "华夏黄金ETF 518850（默认）；产品表保留可切换博时黄金ETF 159937。黄金不超过总资产 10%" },
  { id: "bond-midlong", layer: "防御层", element: "金", name: "7-10年国开债", type: "债券类", target: 0.125, code: "003376", feePct: 0.20, channel: "场外", buyStatus: "正常", status: "available", note: "广发中债7-10年国开债指数A；场外买" },
  { id: "bond-short", layer: "防御层", element: "金", name: "1-3年政金债", type: "债券类", target: 0.125, code: "007364", feePct: 0.20, channel: "场外", buyStatus: "正常", status: "available", note: "易方达中债1-3年政金债A；场外买" },
  { id: "a500-csi300", layer: "生财层", element: "土", name: "中证A500ETF", type: "宽基指数", target: 0.12, code: "159338", feePct: 0.20, channel: "场内", buyStatus: "正常", status: "available", note: "国泰中证A500ETF；沪深300 已从产品表移除" },
  { id: "dividend-lowvol", layer: "生财层", element: "土", name: "红利低波ETF", type: "红利类", target: 0.08, code: "512890", feePct: 0.60, channel: "场内", buyStatus: "正常", status: "available", note: "华泰柏瑞红利低波ETF 512890（2026-10-06 核实不换 563020）；产品表保留可切换，代码不要写死" },
  { id: "csi500", layer: "生财层", element: "土", name: "中证500ETF", type: "中盘成长", target: 0.05, code: "510500", feePct: 0.20, channel: "场内", buyStatus: "正常", status: "available", note: "南方中证500ETF" },
  { id: "sp500", layer: "成长层", element: "水", name: "标普500 QDII", type: "海外宽基", target: 0.30, code: "513500/003718", feePct: 0.80, channel: "看溢价", buyStatus: "正常", status: "available", note: "场内 博时标普500ETF 513500；场外联接基金；美元现汇份额 易方达标普500 003718" },
  { id: "nasdaq-tech", layer: "投机层", element: "火", name: "纳斯达克100ETF", type: "科技成长", target: 0.05, code: "159632", feePct: 0.80, channel: "看溢价", buyStatus: "正常", status: "available", note: "华安纳斯达克100ETF；投机层上限 10%，亏光不补" },
];
const V8_PRODUCT_BY_ID = V8_PRODUCTS.reduce(function (map, row) { map[row.id] = row; return map; }, {});
// 罐子：只有「投资组合」参与比例与偏离度计算
const V8_JARS = [
  { key: "emergency", name: "🛟 应急罐", desc: "生病、失业、突发情况用，不算投资" },
  { key: "study", name: "🎓 读书基金（默认关闭）", desc: "出国读研用，只放短债、货币基金、美元存款或美元货币基金" },
  { key: "waiting", name: "⏳ 等候罐", desc: "QDII 溢价太高、暂时买不进去的钱" },
  { key: "investment", name: "📈 投资组合", desc: "长期，为 FIRE" },
];
const V8_JAR_KEYS = ["emergency", "study", "waiting", "investment"];
const V8_NON_INVEST_JARS = ["emergency", "study", "waiting"];
// 罐子资产（不参与组合比例）的固定 id
const JAR_ASSET_IDS = { emergency: "jar-emergency", study: "jar-study", waiting: "jar-waiting" };
// 溢价分级（v8.1 四档，与规则页/使用说明同步）：<2% 正常买；2~3% 半额；3~5% 暂停场内改场外定投；>5% 绝不买场内
const PREMIUM_TIERS = [
  { max: 2, key: "full", label: "正常按月买，场内" },
  { max: 3, key: "half", label: "半额，另一半进等候罐" },
  { max: 5, key: "offsite", label: "暂停场内，改为场外每日定投或进等候罐" },
  { max: Infinity, key: "never", label: "绝对不买场内，全部改为场外每日定投（场外限购就进等候罐）" },
];
const V8_DEFAULTS = {
  emergencyGoal: 15000,
  studyFundEnabled: false,
  studyFundGoal: 0,
  studyFundRatio: 25,
  fxRate: 6.78,
  minCommission5: true,
  expatMode: false,
  savingGrowthPct: 3,
};
// FIRE 参数（v8.1 起落盘到 settings.fire，与页面 13 个输入一一对应）
const V8_FIRE_DEFAULTS = {
  annualExpense: 90000,
  currentAge: 22,
  targetAge: 35,
  inflationRatePct: 3,
  supplementIncome: 0,
  expectedReturnPct: 5.5,
  domesticMonthly: 5000,
  domesticMonths: 12,
  overseasMonthly: 11000,
  firstYearSetupCost: 12000,
  savingGrowthPct: 3,
  returnHome: false,
  returnYears: 2,
};
// 上限统一从数据读，不在逻辑里写死百分比（v8.1 P0-3）
function layerCap(name) {
  var layer = V8_LAYERS.find(function (l) { return l.name === name; });
  return numberValue(layer && layer.cap);
}
function speculativeCap() { return layerCap("投机层"); }
function productCap(asset) {
  var own = numberValue(asset && asset.cap);
  if (own > 0) return own;
  var row = V8_PRODUCT_BY_ID[asset && asset.id];
  return numberValue(row && row.cap);
}
// v7 已移除产品：迁移时的处理表（必须在模块初始化前就绪，不能放在文件后面）
const V7_REMOVED_PRODUCTS = {
  "cash-usd": { mergeInto: "cash-rmb", note: "v8.0 已并入现金/弹药（货币基金）" },
  "global-healthcare": { note: "v8.0 已移除（标普医疗 161126 长期暂停申购）" },
  "gold-miners": { note: "v8.0 已移除（黄金矿股）" },
  "speculative-stock": { note: "v8.0 已移除（自选个股 5% 占位）" },
};
const V8_SCHEMA_VERSION = 8;
const DRAWDOWN_RULES = [
  { assetId: "sp500", name: "标普500", triggers: [{ pct: 8, units: 1 }, { pct: 15, units: 1 }, { pct: 25, units: 1 }] },
  { assetId: "a500-csi300", name: "A500", triggers: [{ pct: 10, units: 1 }, { pct: 20, units: 1 }, { pct: 30, units: 1 }] },
  { assetId: "csi500", name: "中证500", triggers: [{ pct: 15, units: 1 }, { pct: 25, units: 1 }, { pct: 35, units: 1 }] },
  { assetId: "nasdaq-tech", name: "纳指100", triggers: [{ pct: 15, units: 0.5 }, { pct: 25, units: 0.5 }, { pct: 35, units: 0.5 }] },
];

function makeProductAsset(row) {
  return {
    id: row.id,
    layer: row.layer,
    element: row.element,
    name: row.name,
    type: row.type,
    target: row.target,
    status: "available",
    jar: "investment",
    code: row.code || "",
    feePct: numberValue(row.feePct),
    channel: row.channel || "场外",
    buyStatus: row.buyStatus || "正常",
    buyStatusChecked: "",
    cap: numberValue(row.cap),
    valueUsd: 0,
    waitingSince: "",
    bufferDestinationId: "",
    bufferDestination: "",
    value: 0,
    cost: 0,
    updated: "",
    note: row.note || "",
  };
}

function makeJarAsset(jar) {
  var meta = V8_JARS.find(function (j) { return j.key === jar; }) || { name: jar, desc: "" };
  return {
    id: JAR_ASSET_IDS[jar],
    layer: "罐子",
    element: "",
    name: meta.name.replace(/^[^\u4e00-\u9fa5A-Za-z]+/, ""),
    type: "罐子",
    target: 0,
    status: "available",
    jar: jar,
    code: "",
    feePct: 0,
    channel: "",
    buyStatus: "正常",
    buyStatusChecked: "",
    value: 0,
    valueUsd: 0,
    waitingSince: "",
    bufferDestinationId: "",
    bufferDestination: "",
    cost: 0,
    updated: "",
    note: meta.desc,
  };
}

function makeDefaultSettings() {
  return Object.assign({}, V8_DEFAULTS, {
    fire: Object.assign({}, V8_FIRE_DEFAULTS),
    linkInvestEntry: true,
    schemaVersion: V8_SCHEMA_VERSION,
    premiumInputs: {},
    drawdownInputs: {},
    drawdownDone: {},
    tripChecklist: {},
    studyFundUsd: 0,
  });
}

const defaultData = {
  assets: V8_PRODUCTS.map(makeProductAsset).concat(["emergency", "study", "waiting"].map(makeJarAsset)),
  monthly: makeDefaultMonths(),
  entries: [],
  settings: makeDefaultSettings(),
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

let storageBlocked = false;
let storageErrorMessage = "";
let hasInitialStoredData = false;
let hasExportableLedger = false;
let appInitialized = false;
let syncTimer = null;
let syncInFlight = false;
let syncPending = false;
let syncQueuedPayload = null;
let dataRevision = 0;
let syncSwitchInFlight = false;
let editing = null;

let data = normalizeData(loadData());
let meta = loadMeta();
let committedData = structuredClone(data);
let committedMeta = structuredClone(meta);
let hasCommittedSnapshot = hasInitialStoredData;

// v7 → v8 迁移只执行一次：把升级后的账本立刻落盘，并提示另一台设备也要升级
(function persistV8Migration() {
  if (!hasInitialStoredData || storageBlocked) return;
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    var parsed = raw ? JSON.parse(raw) : null;
    var version = numberValue(parsed && parsed.settings && parsed.settings.schemaVersion);
    var hasFireSettings = isPlainRecord(parsed && parsed.settings && parsed.settings.fire);
    if (version >= V8_SCHEMA_VERSION && hasFireSettings) return;
    if (saveData({ sync: false })) {
      window.__v8MigratedNotice = true;
    }
  } catch (error) {
    console.warn("v8 迁移落盘失败，本次仍按 v8 结构运行：", error);
  }
})();

function fillMissingMonths(source = data) {
  if (!Array.isArray(source.monthly)) source.monthly = [];
  if (!source.monthly.length) {
    source.monthly = makeDefaultMonths();
    return;
  }
  const last = source.monthly[source.monthly.length - 1];
  const [y, m] = (last.month || "").split("/").map(Number);
  if (!y || !m) return;
  const lastDate = new Date(y, m - 1, 1);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + 12, 1); // 12 months ahead
  while (lastDate < target) {
    lastDate.setMonth(lastDate.getMonth() + 1);
    const existing = source.monthly.find((item) => item.month === `${lastDate.getFullYear()}/${lastDate.getMonth() + 1}`);
    if (!existing) {
      source.monthly.push({
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
  // v8.0：不再裁掉最老的月份。旧版会 slice(-24)，会让「月度复盘一条都不能丢」不成立。
}
fillMissingMonths();
appInitialized = true;

function loadData() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    blockStorage("本机账本无法读取，当前页面已锁定保存、同步和导出。请检查浏览器存储权限后刷新。", error);
    return structuredClone(defaultData);
  }
  if (raw === null) return structuredClone(defaultData);
  try {
    const parsed = JSON.parse(raw);
    validateLedgerData(parsed);
    hasInitialStoredData = true;
    hasExportableLedger = true;
    return parsed;
  } catch (error) {
    blockStorage("本机账本格式无法读取，当前页面已锁定保存、同步和导出。请保留页面并检查浏览器存储。", error);
    return structuredClone(defaultData);
  }
}

function validateLedgerData(input) {
  const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const fail = (path) => { throw new Error(`备份格式不正确：${path}`); };
  const fields = (row, path, strings = [], numbers = [], booleans = []) => {
    if (!isRecord(row)) fail(path);
    strings.forEach((key) => {
      if (typeof row[key] !== "undefined" && typeof row[key] !== "string") fail(`${path}.${key}`);
    });
    numbers.forEach((key) => {
      const value = row[key];
      if (typeof value === "undefined") return;
      if ((typeof value !== "number" && typeof value !== "string") || !Number.isFinite(Number(value))) fail(`${path}.${key}`);
    });
    booleans.forEach((key) => {
      if (typeof row[key] !== "undefined" && typeof row[key] !== "boolean") fail(`${path}.${key}`);
    });
  };
  if (!isRecord(input)) fail("账本");
  ["assets", "monthly", "entries"].forEach((key) => {
    if (!Array.isArray(input[key])) fail(key);
  });
  input.assets.forEach((row, index) => fields(row, `assets[${index}]`,
    ["id", "layer", "element", "name", "type", "status", "bufferDestinationId", "bufferDestination", "updated", "note",
      "jar", "code", "channel", "buyStatus", "buyStatusChecked", "waitingSince"],
    ["target", "value", "cost", "feePct", "valueUsd"]));
  input.monthly.forEach((row, index) => {
    const path = `monthly[${index}]`;
    fields(row, path, ["id", "month", "note", "allocationMode", "effectiveAllocationMode", "allocationNote", "allocationCreatedAt"],
      ["income", "expense", "invested", "monthEndAssets", "specRatio", "plannedInvested", "reserve", "savingRate"]);
    if (typeof row.allocationPlan !== "undefined") {
      if (!Array.isArray(row.allocationPlan)) fail(`${path}.allocationPlan`);
      row.allocationPlan.forEach((plan, planIndex) => fields(plan, `${path}.allocationPlan[${planIndex}]`,
        ["assetId", "name", "layer", "reason", "bufferTo"],
        ["target", "normalizedTarget", "amount", "bufferRedirected", "bufferUnavailable", "bufferIncoming"], ["skipped"]));
    }
    if (typeof row.allocationSummary !== "undefined") fields(row.allocationSummary, `${path}.allocationSummary`, [],
      ["cashflowAvailable", "targetSaving", "investBase", "allocatedTotal", "actualRemainingCash", "remainingCash", "bufferedAllocTotal", "unbufferedCash", "speculativeRatio"], ["speculativePaused"]);
  });
  input.entries.forEach((row, index) => fields(row, `entries[${index}]`,
    ["id", "kind", "date", "target", "channel", "note", "linkedAssetId", "linkedMonth"], ["amount", "linkedAmount"]));
  if (typeof input.settings !== "undefined") {
    fields(input.settings, "settings", [],
      ["emergencyGoal", "studyFundGoal", "studyFundRatio", "studyFundUsd", "fxRate", "savingGrowthPct", "usdSubsidy",
        "daysAbroad", "fireAnnualExpense", "fireExpectedReturnPct", "fireMinRealReturnPct", "fireDomesticMonthly",
        "fireOverseasMonthly", "fireSavingGrowthPct", "fireStudyRatioPct", "schemaVersion"],
      ["linkInvestEntry", "studyFundEnabled", "minCommission5", "expatMode"]);
    ["premiumInputs", "drawdownInputs", "drawdownDone", "tripChecklist", "fire"].forEach((key) => {
      const value = input.settings[key];
      if (typeof value === "undefined") return;
      if (!isRecord(value)) fail(`settings.${key}`);
    });
  }
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// FIRE 参数解析（v8.1）：只认 settings.fire 里的 13 个已知键，缺的补默认值
function pickFireSettings(raw) {
  const src = isPlainRecord(raw) ? raw : {};
  const num = (key, fallback) => (Number.isFinite(Number(src[key])) ? Number(src[key]) : fallback);
  return {
    annualExpense: Math.max(num("annualExpense", V8_FIRE_DEFAULTS.annualExpense), 0),
    currentAge: Math.max(num("currentAge", V8_FIRE_DEFAULTS.currentAge), 0),
    targetAge: Math.max(num("targetAge", V8_FIRE_DEFAULTS.targetAge), 0),
    inflationRatePct: clamp(num("inflationRatePct", V8_FIRE_DEFAULTS.inflationRatePct), 0, 100),
    supplementIncome: Math.max(num("supplementIncome", V8_FIRE_DEFAULTS.supplementIncome), 0),
    expectedReturnPct: clamp(num("expectedReturnPct", V8_FIRE_DEFAULTS.expectedReturnPct), 0, 100),
    domesticMonthly: Math.max(num("domesticMonthly", V8_FIRE_DEFAULTS.domesticMonthly), 0),
    domesticMonths: Math.max(num("domesticMonths", V8_FIRE_DEFAULTS.domesticMonths), 0),
    overseasMonthly: Math.max(num("overseasMonthly", V8_FIRE_DEFAULTS.overseasMonthly), 0),
    firstYearSetupCost: Math.max(num("firstYearSetupCost", V8_FIRE_DEFAULTS.firstYearSetupCost), 0),
    savingGrowthPct: num("savingGrowthPct", V8_FIRE_DEFAULTS.savingGrowthPct),
    returnHome: src.returnHome === true,
    returnYears: Math.max(num("returnYears", V8_FIRE_DEFAULTS.returnYears), 0),
  };
}

// v8.0 起唯一设置解析入口：只认已知字段，缺的补默认值，旧值能保留就保留。
function pickSettings(raw) {
  const src = isPlainRecord(raw) ? raw : {};
  const num = (key, fallback) => (Number.isFinite(Number(src[key])) ? Number(src[key]) : fallback);
  const out = makeDefaultSettings();
  out.emergencyGoal = numberValue(src.emergencyGoal) > 0 ? numberValue(src.emergencyGoal) : V8_DEFAULTS.emergencyGoal;
  out.linkInvestEntry = typeof src.linkInvestEntry === "boolean" ? src.linkInvestEntry : true;
  out.studyFundEnabled = src.studyFundEnabled === true;
  out.studyFundGoal = Math.max(num("studyFundGoal", 0), 0);
  out.studyFundRatio = clamp(num("studyFundRatio", V8_DEFAULTS.studyFundRatio), 0, 50);
  out.studyFundUsd = Math.max(num("studyFundUsd", 0), 0);
  const fx = num("fxRate", V8_DEFAULTS.fxRate);
  out.fxRate = fx > 0 ? fx : V8_DEFAULTS.fxRate;
  out.minCommission5 = src.minCommission5 !== false;
  out.expatMode = src.expatMode === true;
  out.savingGrowthPct = num("savingGrowthPct", V8_DEFAULTS.savingGrowthPct);
  // v8.1：FIRE 参数统一放 settings.fire（随同步走）；旧账本的 fire* / usdSubsidy / daysAbroad 键读到即丢弃
  out.fire = pickFireSettings(src.fire);
  out.premiumInputs = isPlainRecord(src.premiumInputs) ? Object.assign({}, src.premiumInputs) : {};
  out.drawdownInputs = isPlainRecord(src.drawdownInputs) ? Object.assign({}, src.drawdownInputs) : {};
  out.drawdownDone = isPlainRecord(src.drawdownDone) ? Object.assign({}, src.drawdownDone) : {};
  out.tripChecklist = isPlainRecord(src.tripChecklist) ? Object.assign({}, src.tripChecklist) : {};
  out.schemaVersion = V8_SCHEMA_VERSION;
  return out;
}

// v7.x → v8.0 迁移：只跑一次（settings.schemaVersion 标记）。
// 铁律：金额、流水、月度复盘、FIRE 参数、同步码一条都不丢；产品按 id 就地升级，随手记的历史联动不断。
// v8.1：旧 buffered 的资产统一并入「能不能买=暂停申购」；用户已经明确填过非「正常」的状态就保留
function bufferedBuyStatus(asset) {
  var current = String((asset && asset.buyStatus) || "");
  return current && current !== "正常" ? current : "暂停申购";
}

function migrateToV8(input) {
  const source = isPlainRecord(input) ? input : {};
  // 幂等：已经是 v8 结构就直接返回，避免重复插入罐子资产
  if (numberValue(source.settings && source.settings.schemaVersion) >= V8_SCHEMA_VERSION) return source;
  const oldAssets = Array.isArray(source.assets) ? source.assets : [];
  const oldSettings = isPlainRecord(source.settings) ? source.settings : {};
  const oldGoal = numberValue(oldSettings.emergencyGoal);
  // 旧默认 3 万 → 新默认 1.5 万；用户手动改过的其他正数值原样保留
  const newGoal = oldGoal > 0 && oldGoal !== 30000 ? oldGoal : V8_DEFAULTS.emergencyGoal;
  const usedIds = {};
  const migrated = [];

  V8_PRODUCTS.forEach(function (row) {
    const old = oldAssets.find(function (a) { return a && a.id === row.id; }) ||
      oldAssets.find(function (a) { return a && !usedIds[a.id] && String(a.name || "") === row.name; });
    if (old) usedIds[old.id] = true;
    const base = makeProductAsset(row);
    migrated.push(old ? Object.assign({}, old, {
      layer: row.layer,
      element: row.element,
      name: row.name,
      type: row.type,
      target: row.target,
      status: "available",
      jar: "investment",
      code: base.code,
      feePct: base.feePct,
      cap: base.cap,
      channel: base.channel,
      buyStatus: isBufferedStatus(old.status) ? bufferedBuyStatus(old) : base.buyStatus,
      buyStatusChecked: base.buyStatusChecked,
      valueUsd: 0,
      bufferDestinationId: "",
      bufferDestination: "",
      note: row.note || old.note || "",
    }) : base);
  });

  oldAssets.forEach(function (a) {
    if (!a || usedIds[a.id]) return;
    const removed = V7_REMOVED_PRODUCTS[a.id];
    if (removed && removed.mergeInto) {
      const target = migrated.find(function (m) { return m.id === removed.mergeInto; });
      if (target) {
        target.value = numberValue(target.value) + numberValue(a.value);
        target.cost = numberValue(target.cost) + numberValue(a.cost);
        target.note = (target.note ? target.note + "｜" : "") + removed.note;
      }
      return;
    }
    if (removed) {
      if (numberValue(a.value) === 0 && numberValue(a.cost) === 0) return; // 无持仓：直接删除
      migrated.push(Object.assign({}, a, {
        target: 0,
        status: "available",
        buyStatus: isBufferedStatus(a.status) ? bufferedBuyStatus(a) : (a.buyStatus || "正常"),
        jar: "investment",
        bufferDestinationId: "",
        bufferDestination: "",
        note: (a.note ? a.note + "｜" : "") + removed.note + "，请清仓后删除",
      }));
      return;
    }
    // 用户自建资产：原样保留（目标占比不换算；合计不等于 100% 时页面顶部会提示）
    migrated.push(Object.assign({}, a, {
      jar: "investment",
      status: isBufferedStatus(a.status) ? "available" : (a.status || "available"),
      buyStatus: isBufferedStatus(a.status) ? bufferedBuyStatus(a) : (a.buyStatus || "正常"),
      note: (a.note ? a.note + "｜" : "") + "v8.1 迁移保留，请确认目标比例",
    }));
  });

  // 旧「现金层」既是应急金又是弹药 → 拆开：应急罐最多拿新目标，其余留在现金/弹药
  const cash = migrated.find(function (a) { return a.id === "cash-rmb"; });
  const emergency = makeJarAsset("emergency");
  if (cash) {
    const cashValue = numberValue(cash.value);
    const cashCost = numberValue(cash.cost);
    emergency.value = Math.min(cashValue, newGoal);
    emergency.cost = Math.min(cashCost, emergency.value);
    emergency.updated = cash.updated || "";
    cash.value = Math.max(cashValue - emergency.value, 0);
    cash.cost = Math.max(cashCost - emergency.cost, 0);
  }
  const study = makeJarAsset("study");
  study.value = Math.max(numberValue(oldSettings.studyFundValue), 0);
  study.valueUsd = Math.max(numberValue(oldSettings.studyFundUsd), 0);
  const waiting = makeJarAsset("waiting");
  waiting.value = Math.max(numberValue(oldSettings.waitingValue), 0);
  waiting.valueUsd = Math.max(numberValue(oldSettings.waitingUsd), 0);
  waiting.waitingSince = String(oldSettings.waitingSince || "");

  return {
    assets: migrated.concat([emergency, study, waiting]),
    monthly: Array.isArray(source.monthly) ? source.monthly : [],
    entries: Array.isArray(source.entries) ? source.entries : [],
    settings: pickSettings(Object.assign({}, oldSettings, { emergencyGoal: newGoal })),
  };
}

function normalizeData(input) {
  const fallback = structuredClone(defaultData);
  const source = isPlainRecord(input) ? input : {};
  const version = numberValue(source.settings && source.settings.schemaVersion);
  const working = version >= V8_SCHEMA_VERSION ? source : migrateToV8(source);
  const assets = Array.isArray(working.assets) ? working.assets : fallback.assets;
  assets.forEach((a) => {
    if (a && typeof a === "object") {
      if (!a.id) a.id = crypto.randomUUID();
      if (typeof a.element === "undefined") a.element = "";
      if (typeof a.status === "undefined") a.status = "available";
      if (typeof a.jar === "undefined" || V8_JAR_KEYS.indexOf(String(a.jar)) === -1) a.jar = "investment";
      const preset = V8_PRODUCT_BY_ID[a.id] || {};
      if (typeof a.code === "undefined") a.code = preset.code || "";
      if (typeof a.feePct === "undefined") a.feePct = numberValue(preset.feePct);
      if (typeof a.channel === "undefined") a.channel = preset.channel || "";
      if (typeof a.buyStatus === "undefined") a.buyStatus = "正常";
      if (typeof a.buyStatusChecked === "undefined") a.buyStatusChecked = "";
      if (typeof a.cap === "undefined") a.cap = numberValue(preset.cap);
      if (typeof a.valueUsd === "undefined") a.valueUsd = 0;
      if (typeof a.waitingSince === "undefined") a.waitingSince = "";
      if (isBufferedStatus(a.status)) {
        // v8.1：旧 buffered（暂存重定向）统一并入 buyStatus=暂停申购，钱按等候罐口径处理
        a.status = "available";
        if (!a.buyStatus || a.buyStatus === "正常") a.buyStatus = "暂停申购";
      }
      if (typeof a.bufferDestinationId === "undefined") a.bufferDestinationId = "";
      if (typeof a.bufferDestination === "undefined") a.bufferDestination = "";
    }
  });
  ["emergency", "study", "waiting"].forEach(function (jar) {
    if (!assets.some(function (a) { return a && a.jar === jar; })) assets.push(makeJarAsset(jar));
  });
  return {
    assets,
    monthly: Array.isArray(working.monthly) ? working.monthly : fallback.monthly,
    entries: Array.isArray(working.entries) ? working.entries : fallback.entries,
    settings: pickSettings(isPlainRecord(working.settings) ? working.settings : {}),
  };
}

function isBufferedStatus(status) {
  return String(status || "") === "buffered" || String(status || "").startsWith("buffered:");
}

function isAvailableAsset(asset) {
  return Boolean(asset) && String(asset.status || "available") !== "paused:manual";
}

// ---- v8.0 罐子：只有「投资组合」参与比例、偏离度与分配计算 ----
function assetJar(asset) {
  var jar = String((asset && asset.jar) || "investment");
  return V8_JAR_KEYS.indexOf(jar) === -1 ? "investment" : jar;
}

function isInvestmentAsset(asset) {
  return assetJar(asset) === "investment";
}

function investmentAssets(list) {
  var source = Array.isArray(list) ? list : data.assets;
  return source.filter(isInvestmentAsset);
}

function jarAssets(jar, list) {
  var source = Array.isArray(list) ? list : data.assets;
  return source.filter(function (a) { return assetJar(a) === jar; });
}

function fxRate() {
  var rate = numberValue(data.settings && data.settings.fxRate);
  return rate > 0 ? rate : V8_DEFAULTS.fxRate;
}

function jarValueRmb(jar, list) {
  return jarAssets(jar, list).reduce(function (s, a) { return s + numberValue(a.value); }, 0);
}

function jarValueUsd(jar, list) {
  return jarAssets(jar, list).reduce(function (s, a) { return s + numberValue(a.valueUsd); }, 0);
}

function jarValue(jar, list) {
  return jarValueRmb(jar, list) + jarValueUsd(jar, list) * fxRate();
}

function emergencyGoal() {
  var goal = numberValue(data.settings && data.settings.emergencyGoal);
  return goal > 0 ? goal : V8_DEFAULTS.emergencyGoal;
}

function emergencyValue() {
  return jarValue("emergency");
}

function studyFundEnabled() {
  return Boolean(data.settings && data.settings.studyFundEnabled);
}

function studyFundGoal() {
  return Math.max(numberValue(data.settings && data.settings.studyFundGoal), 0);
}

function studyFundRatioPct() {
  var ratio = numberValue(data.settings && data.settings.studyFundRatio);
  return Number.isFinite(ratio) ? clamp(ratio, 0, 50) : V8_DEFAULTS.studyFundRatio;
}

function waitingMonths() {
  var jar = jarAssets("waiting")[0];
  var since = String((jar && jar.waitingSince) || "");
  var parts = since.split("/").map(Number);
  if (!parts[0] || !parts[1]) return 0;
  var now = new Date();
  return Math.max((now.getFullYear() - parts[0]) * 12 + (now.getMonth() + 1 - parts[1]), 0);
}

function portfolioValue() {
  return investmentAssets().reduce(function (s, a) { return s + numberValue(a.value); }, 0);
}

function targetSumOf(list) {
  var source = Array.isArray(list) ? list : investmentAssets();
  return source.reduce(function (s, a) { return s + numberValue(a.target); }, 0);
}

// 比例自动检查（任务 1）：合计 ≠100% 只提醒不阻断，计算继续按归一化
function validateTargetSum(list) {
  var source = Array.isArray(list) ? list : investmentAssets();
  var sum = targetSumOf(source);
  var issues = [];
  if (Math.abs(sum - 1) > 0.0005) {
    issues.push("配置比例合计为 " + pct(sum) + "，系统已按合计归一化；建议调整为 100%");
  }
  V8_LAYERS.forEach(function (layer) {
    var rows = source.filter(function (a) { return a.layer === layer.name; });
    if (!rows.length) return;
    var layerSum = rows.reduce(function (s, a) { return s + numberValue(a.target); }, 0);
    if (Math.abs(layerSum - layer.target) > 0.0005) {
      issues.push(layer.label + "层子目标合计 " + pct(layerSum) + "，与层目标 " + pct(layer.target) + " 不一致");
    }
  });
  return { sum: sum, issues: issues, ok: issues.length === 0 };
}

// v8.1：有效目标 = 归一化目标。旧的「暂存重定向」已并入 buyStatus=暂停申购，不再有汇入逻辑。
function computeEffectiveTargets(assets) {
  var list = (Array.isArray(assets) ? assets : data.assets).filter(isInvestmentAsset);
  var targetSum = list.reduce(function (s, a) { return s + numberValue(a.target); }, 0);
  var result = {};
  list.forEach(function (asset) {
    result[asset.id] = targetSum > 0 ? numberValue(asset.target) / targetSum : 0;
  });
  return result;
}

function loadMeta() {
  let raw;
  try {
    raw = localStorage.getItem(META_KEY);
  } catch (error) {
    blockStorage("本机账本状态无法读取，编辑和同步已暂停。请检查浏览器存储权限后刷新。", error);
    return { updatedAt: null, lastSyncedAt: null, lastSyncError: "" };
  }
  if (raw === null) return { updatedAt: null, lastSyncedAt: null, lastSyncError: "" };
  try {
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error("本机账本状态格式无效");
    ["updatedAt", "lastSyncedAt"].forEach((key) => {
      if (typeof saved[key] !== "undefined" && saved[key] !== null && typeof saved[key] !== "string") throw new Error("本机账本状态格式无效");
    });
    if (typeof saved.lastSyncError !== "undefined" && typeof saved.lastSyncError !== "string") throw new Error("本机账本状态格式无效");
    return {
      updatedAt: saved.updatedAt || null,
      lastSyncedAt: saved.lastSyncedAt || null,
      lastSyncError: saved.lastSyncError || "",
    };
  } catch (error) {
    blockStorage("本机账本状态格式无法读取，编辑和同步已暂停。请保留页面并检查浏览器存储。", error);
    return { updatedAt: null, lastSyncedAt: null, lastSyncError: "" };
  }
}

function showStorageNotice(message, blocked = false) {
  const status = document.querySelector("#syncStatus");
  if (status) {
    status.className = "sync-badge error";
    status.textContent = blocked ? "本机存储已锁定" : "本机保存失败";
    status.title = message;
  }
  const exportBtn = document.querySelector("#exportBtn");
  if (exportBtn) exportBtn.disabled = storageBlocked && !hasExportableLedger;
  const importInput = document.querySelector("#importInput");
  if (importInput && blocked) importInput.disabled = true;
}

function cancelQueuedSync() {
  clearTimeout(syncTimer);
  syncTimer = null;
  syncPending = false;
  syncQueuedPayload = null;
}

function blockStorage(message, error) {
  storageBlocked = true;
  storageErrorMessage = message;
  cancelQueuedSync();
  showStorageNotice(message, true);
  if (appInitialized) render();
  if (error) console.error("本机存储不可用：", error);
}

function showStorageWriteFailure(error) {
  const rollbackFailed = Boolean(error && error.rollbackFailed);
  const readFailed = Boolean(error && error.storageReadFailed);
  const message = rollbackFailed
    ? "本机存储状态不确定，账本已锁定。请勿继续编辑，并先检查浏览器存储。"
    : readFailed
      ? "无法确认本机账本状态，账本已锁定。请检查浏览器存储权限后刷新。"
      : "本机保存失败，本次改动已撤销。请检查浏览器存储空间后重试。";
  if (rollbackFailed || readFailed) blockStorage(message, error);
  else {
    storageErrorMessage = message;
    showStorageNotice(message, false);
    toast(message);
  }
  return message;
}

function persistMeta(nextMeta = meta) {
  if (storageBlocked) return false;
  const snapshot = structuredClone(nextMeta);
  try {
    localStorage.setItem(META_KEY, JSON.stringify(snapshot));
    meta = snapshot;
    committedMeta = structuredClone(snapshot);
    return true;
  } catch (error) {
    meta = structuredClone(committedMeta);
    showStorageWriteFailure(error);
    return false;
  }
}

function persistLocal(nextData, nextMeta) {
  if (storageBlocked) throw new Error(storageErrorMessage || "本机存储已锁定");
  const dataValue = JSON.stringify(nextData);
  const metaValue = JSON.stringify(nextMeta);
  let previousData;
  let previousMeta;
  try {
    previousData = localStorage.getItem(STORAGE_KEY);
    previousMeta = localStorage.getItem(META_KEY);
  } catch (error) {
    const failure = new Error("本机账本状态读取失败。");
    failure.cause = error;
    failure.storageReadFailed = true;
    throw failure;
  }

  const written = [];
  try {
    localStorage.setItem(STORAGE_KEY, dataValue);
    written.push([STORAGE_KEY, previousData]);
    localStorage.setItem(META_KEY, metaValue);
    written.push([META_KEY, previousMeta]);
    return true;
  } catch (error) {
    // Compensate runtime write failures; this cannot guarantee crash or power-loss atomicity.
    let rollbackError = null;
    for (let index = written.length - 1; index >= 0; index -= 1) {
      const [key, previous] = written[index];
      try {
        if (previous === null) localStorage.removeItem(key);
        else localStorage.setItem(key, previous);
      } catch (restoreError) {
        rollbackError = restoreError;
        break;
      }
    }
    const failure = new Error(rollbackError
      ? "本机保存失败且回退未完成。"
      : "本机保存失败，原账本和状态已保留。");
    failure.cause = error;
    failure.rollbackFailed = Boolean(rollbackError);
    if (rollbackError) failure.rollbackCause = rollbackError;
    throw failure;
  }
}

function restoreCommittedState() {
  data = structuredClone(committedData);
  meta = structuredClone(committedMeta);
}

function isCloudConfiguredSafely() {
  if (storageBlocked || !window.supabase) return false;
  try {
    return Boolean(window.supabase.isConfigured());
  } catch (error) {
    blockStorage("本机同步状态无法读取，自动同步已停止。请检查浏览器存储权限后刷新。", error);
    return false;
  }
}

function getSyncCodeSafely() {
  if (storageBlocked || !window.supabase) return null;
  try {
    return window.supabase.getSyncCode();
  } catch (error) {
    blockStorage("本机同步身份无法读取，自动同步已停止。请检查浏览器存储权限后刷新。", error);
    return null;
  }
}

function makeSyncPayload() {
  if (!hasCommittedSnapshot) return null;
  return { data: structuredClone(committedData), updatedAt: committedMeta.updatedAt || new Date().toISOString() };
}

function cloneSyncPayload(payload) {
  return payload && payload.data
    ? { data: structuredClone(payload.data), updatedAt: payload.updatedAt }
    : null;
}

function scheduleCloudSave(payload) {
  if (!payload || storageBlocked || !isCloudConfiguredSafely()) return;
  clearTimeout(syncTimer);
  syncQueuedPayload = cloneSyncPayload(payload);
  syncPending = true;
  syncTimer = setTimeout(flushPendingSync, 450);
}

function flushPendingSync() {
  if (storageBlocked || !syncPending || !syncQueuedPayload) return false;
  clearTimeout(syncTimer);
  syncTimer = null;
  const payload = syncQueuedPayload;
  syncQueuedPayload = null;
  syncPending = false;
  if (syncInFlight) {
    syncQueuedPayload = payload;
    syncPending = true;
    return false;
  }
  void syncToCloud(payload);
  return true;
}

function saveData(options = {}) {
  if (storageBlocked) {
    restoreCommittedState();
    showStorageNotice(storageErrorMessage || "本机存储已锁定，当前操作未保存。", true);
    return false;
  }
  const nextData = structuredClone(typeof options.data === "undefined" ? data : options.data);
  const nextMeta = structuredClone(typeof options.meta === "undefined" ? meta : options.meta);
  if (options.touch !== false) nextMeta.updatedAt = new Date().toISOString();
  try {
    persistLocal(nextData, nextMeta);
  } catch (error) {
    restoreCommittedState();
    showStorageWriteFailure(error);
    render();
    return false;
  }
  data = nextData;
  meta = nextMeta;
  committedData = structuredClone(nextData);
  committedMeta = structuredClone(nextMeta);
  hasCommittedSnapshot = true;
  hasExportableLedger = true;
  dataRevision += 1;
  storageErrorMessage = "";
  const status = document.querySelector("#syncStatus");
  if (status && status.textContent === "本机保存失败") {
    status.className = "sync-badge";
    status.textContent = "本地已保存";
    status.title = "当前账本已成功保存到本机。";
  }
  const payload = makeSyncPayload();
  if (options.sync === true) {
    cancelQueuedSync();
    void syncToCloud(payload);
  } else if (options.sync !== false) {
    scheduleCloudSave(payload);
  }
  return true;
}

async function syncToCloud(payload = null) {
  if (storageBlocked || !isCloudConfiguredSafely()) return false;
  const snapshot = payload || syncQueuedPayload || makeSyncPayload();
  if (!snapshot) return false;
  if (syncInFlight) {
    syncQueuedPayload = cloneSyncPayload(snapshot);
    syncPending = true;
    return false;
  }
  syncInFlight = true;
  let syncCodeAtStart = null;
  try {
    syncCodeAtStart = getSyncCodeSafely();
    if (!syncCodeAtStart) return false;
    window.supabase.setStatus("syncing");
    const record = await window.supabase.saveData(structuredClone(snapshot.data), snapshot.updatedAt);
    if (storageBlocked || getSyncCodeSafely() !== syncCodeAtStart) return false;
    validateCloudRecord(record);
    const nextMeta = structuredClone(meta);
    nextMeta.lastSyncedAt = record.updatedAt || snapshot.updatedAt || new Date().toISOString();
    nextMeta.lastSyncError = "";
    if (!persistMeta(nextMeta)) {
      if (!storageBlocked) window.supabase.setStatus("error", "云端已保存，但本机同步状态未保存。");
      return false;
    }
    setPeerVersionNotice("");
    if (record.legacy) {
      window.supabase.setStatus("legacy", "检测到旧版同步记录；建议导出备份后重新生成同步码迁移到当前云同步。");
    } else {
      window.supabase.setStatus("online", `上次同步：${formatDateTime(meta.lastSyncedAt)}`);
    }
    return true;
  } catch (error) {
    if (syncCodeAtStart && !storageBlocked && getSyncCodeSafely() !== syncCodeAtStart) return false;
    const nextMeta = structuredClone(meta);
    nextMeta.lastSyncError = error && error.message ? error.message : String(error);
    persistMeta(nextMeta);
    console.error("云同步保存失败：", error);
    window.supabase.setStatus("error", nextMeta.lastSyncError);
    return false;
  } finally {
    syncInFlight = false;
    if (syncPending && !storageBlocked) flushPendingSync();
  }
}

function commitRemoteData(nextData, nextMeta) {
  return saveData({ data: nextData, meta: nextMeta, touch: false, sync: false });
}

function commitSyncCodeData(nextData, nextMeta) {
  data = structuredClone(nextData);
  meta = structuredClone(nextMeta);
  committedData = structuredClone(nextData);
  committedMeta = structuredClone(nextMeta);
  hasCommittedSnapshot = true;
  hasExportableLedger = true;
  dataRevision += 1;
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

function validateCloudRecord(record) {
  if (!record || typeof record.updatedAt !== "string" || !Number.isFinite(Date.parse(record.updatedAt))) {
    throw new Error("云端记录缺少有效的更新时间，本机账本已保留。");
  }
  validateLedgerData(record.data);
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
  // 投资组合口径：比例、偏离度、投机层上限都只用这一份
  const list = investmentAssets();
  const value = list.reduce((sum, item) => sum + numberValue(item.value), 0);
  const cost = list.reduce((sum, item) => sum + numberValue(item.cost), 0);
  const profit = value - cost;
  const spec = list
    .filter((item) => item.layer === "投机层")
    .reduce((sum, item) => sum + numberValue(item.value), 0);
  const last = list
    .map((item) => item.updated)
    .filter(Boolean)
    .sort()
    .at(-1);
  const jarTotal = jarValue("emergency") + jarValue("study") + jarValue("waiting");
  return {
    value,
    cost,
    profit,
    profitRate: cost > 0 ? profit / cost : 0,
    specRatio: value > 0 ? spec / value : 0,
    last,
    jarTotal,
    grandTotal: value + jarTotal,
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
  if (storageBlocked) {
    const main = document.querySelector("main");
    if (main) {
      main.innerHTML = '<div style="padding:40px;text-align:center;color:#b91c1c">' +
        '<h2>本机存储需要检查</h2>' +
        '<p>' + esc(storageErrorMessage || "本机存储已锁定，编辑和同步已停止。") + '</p>' +
        '<p style="color:#6b7280;margin-top:12px">' +
        (hasExportableLedger
          ? "可以点右上角「导出」，保存已成功读取或保存的账本快照。"
          : "账本尚未成功读取，无法导出有效备份。可从另一台有完整账本的设备导出备份。") +
        '请检查浏览器存储权限后刷新。不要清理网站数据，以免丢失本机账本。</p>' +
        '</div>';
    }
    return;
  }
  try {
    renderDashboard();
    renderTodayActions();
    renderAssets();
    renderTargetWarning();
    renderTripChecklist();
    renderElementTable();
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
      '<p style="color:#6b7280;margin-top:12px">不要反复刷新。先尝试导出当前 JSON 备份，再清理浏览器缓存或导入上次备份。</p>' +
      '<button onclick="location.reload()" style="margin-top:16px;padding:8px 20px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer">刷新页面</button>' +
      '</div>';
  }
}

function renderDashboard() {
  const t = totals();
  document.querySelector("#totalAssets").textContent = money(t.grandTotal);
  document.querySelector("#totalCost").textContent = money(t.cost);
  document.querySelector("#totalProfit").textContent = money(t.profit);
  document.querySelector("#profitRate").textContent = pct(t.profitRate);
  document.querySelector("#specRatio").textContent = pct(t.specRatio);
  const specCapPct = speculativeCap();
  const overLimit = specCapPct > 0 && t.specRatio >= specCapPct;
  document.querySelector("#specStatus").textContent = overLimit ? "达" + pct(specCapPct) + "，卖回" + pct(specCapPct) : "正常";
  const specCard = document.querySelector("#specRatio").closest(".metric");
  specCard.classList.toggle("alert", overLimit);
  document.querySelector("#lastUpdated").textContent =
    `投资组合 ${money(t.value)}｜罐子 ${money(t.jarTotal)}` + (t.last ? `｜最近更新：${t.last}` : "｜尚未更新");
}

// 对端版本提示（说明书第 2 节第 4 条）：云端账本比本机旧时常驻提醒
var peerVersionNotice = "";
function setPeerVersionNotice(text) {
  var next = String(text || "");
  if (peerVersionNotice === next) return;
  peerVersionNotice = next;
  if (appInitialized) render();
}
function checkPeerVersion(record) {
  var settings = (record && record.data && record.data.settings) || {};
  var version = numberValue(settings.schemaVersion);
  // v8.1：除 schemaVersion<8 的老账本，还要认出「v8.0 设备写回来的账本」——它没有 settings.fire，
  // 那种账本覆盖过来会把 FIRE 参数打回默认值。
  var outdated = version < V8_SCHEMA_VERSION || !isPlainRecord(settings.fire);
  setPeerVersionNotice(outdated
    ? "云端账本还是旧版：请把另一台设备也升级到 v8.1 再同步，否则罐子和 FIRE 参数会被旧版覆盖；本机改一次并同步即可把云端刷新到 v8.1。"
    : "");
}

// 比例自动检查（任务 1）：合计或子目标不等于目标时，页面顶部黄条提醒；计算仍按归一化继续
function renderTargetWarning() {
  var el = document.querySelector("#targetWarning");
  if (!el) return;
  var check = validateTargetSum();
  var peerHtml = peerVersionNotice ? "<b>同步提醒</b><span>" + esc(peerVersionNotice) + "</span>" : "";
  if (check.ok && !peerHtml) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = (check.ok ? "" : "<b>配置比例需要确认</b>" +
    check.issues.map(function (text) { return "<span>" + esc(text) + "</span>"; }).join("")) + peerHtml;
}

// 五行对照表（任务 10）：全站唯一一套「五行 ↔ 层级 ↔ 目标比例 ↔ 产品」
function renderElementTable() {
  var wrap = document.querySelector("#elementTable");
  if (!wrap) return;
  var rows = V8_LAYERS.map(function (layer) {
    var products = V8_PRODUCTS.filter(function (p) { return p.layer === layer.name; });
    var names = products.length
      ? products.map(function (p) {
        return p.name + " " + pct(p.target) + (p.code ? "（" + p.code + "）" : "");
      }).join("、")
      : "杠杆、虚拟币、期权、初创股权（不可配置）";
    return "<tr><td>" + esc(layer.element) + "</td><td>" + esc(layer.label) + "</td><td>" +
      pct(layer.target) + (layer.cap ? "（上限 " + pct(layer.cap) + "）" : "") + "</td><td>" + esc(names) + "</td></tr>";
  }).join("");
  wrap.innerHTML = '<table class="element-table"><thead><tr><th>五行</th><th>层级</th><th>目标比例</th><th>产品</th></tr></thead><tbody>' +
    rows + "</tbody></table>";
}

// 四个罐子卡片（任务 2）：应急罐 / 读书基金（默认关闭）/ 等候罐 / 投资组合
function jarCardHtml(name, value, goal, desc, extra) {
  var progress = goal > 0 ? Math.min(value / goal, 1) : 0;
  var bar = goal > 0
    ? '<div class="jar-progress"><i class="jar-fill" style="width:' + (progress * 100).toFixed(1) + '%"></i></div>'
    : "";
  var goalText = goal > 0 ? money(value) + " / " + money(goal) : money(value);
  return '<article class="jar-card">' +
    '<div class="jar-card-head"><b>' + esc(name) + '</b>' + (goal > 0 ? '<span>' + pct(progress) + '</span>' : "") + '</div>' +
    '<div class="jar-card-usd">' + goalText + '</div>' +
    bar +
    '<div class="jar-card-note">' + esc(desc) + (extra ? "｜" + esc(extra) : "") + '</div>' +
  '</article>';
}

function renderJars() {
  var wrap = document.querySelector("#jarCards");
  if (!wrap) return;
  var goal = emergencyGoal();
  var cards = [];
  cards.push(jarCardHtml("🛟 应急罐", jarValue("emergency"), goal, "生病、失业、突发情况用，不算投资", ""));
  if (studyFundEnabled()) {
    var usd = jarValueUsd("study");
    var extra = usd > 0 ? "其中 " + money(usd * fxRate()) + " 来自美元" : "";
    cards.push(jarCardHtml("🎓 读书基金", jarValue("study"), studyFundGoal(), "出国读研用，只放短债、货币基金、美元存款或美元货币基金", extra));
  }
  var waitUsd = jarValueUsd("waiting");
  var waitExtra = [];
  if (jarValue("waiting") > 0) waitExtra.push("已等待 " + waitingMonths() + " 个月");
  if (waitUsd > 0) waitExtra.push("其中 " + money(waitUsd * fxRate()) + " 来自美元");
  cards.push(jarCardHtml("⏳ 等候罐", jarValue("waiting"), 0, "QDII 溢价太高、暂时买不进去的钱", waitExtra.join("｜")));
  cards.push(jarCardHtml("📈 投资组合", portfolioValue(), 0, "长期，为 FIRE；按 v8.2 比例分配", ""));
  wrap.innerHTML = cards.join("");
}

function renderAssets() {
  const list = document.querySelector("#assetList");
  renderJars();
  renderTargetWarning();
  const t = totals();
  const items = investmentAssets();
  const targetSum = targetSumOf(items);
  const effectiveTargets = computeEffectiveTargets(items);
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = '<div class="empty-state">' +
      '<div class="empty-icon">📊</div>' +
      '<b>还没有资产</b>' +
      '<p>点「套用 v8.2 配置」一键导入推荐方案，或手动新增资产。</p>' +
      '</div>';
    return;
  }

  items.forEach((item) => {
    const profit = numberValue(item.value) - numberValue(item.cost);
    const ratio = t.value > 0 ? numberValue(item.value) / t.value : 0;
    const normTarget = targetSum > 0 ? numberValue(item.target) / targetSum : 0;
    const effectiveTarget = numberValue(effectiveTargets[item.id]);
    const status = ratio - normTarget;
    const statusText = status > 0.03 ? "偏高：暂停/少投" : status < -0.03 ? "偏低：优先补" : "正常";
    const buyStatus = String(item.buyStatus || "正常");
    const suspended = buyStatus === "暂停申购";
    const buyBadge = buyStatus === "正常" ? "" : '<i class="badge fire">' + esc(buyStatus) + "</i> ";
    const productLine = [item.code ? "代码 " + item.code : "", item.feePct ? "年费率 " + item.feePct + "%" : "",
      item.channel ? "在哪买 " + item.channel : "", item.buyStatusChecked ? "上次检查 " + item.buyStatusChecked : ""]
      .filter(Boolean).join(" · ");
    const card = document.createElement("article");
    card.className = "card" + (suspended ? " suspended" : "");
    card.innerHTML = `
      <div class="card-title">
        <b>${esc(item.name)}</b>
        <span>${buyBadge}<i class="badge ${layerClass(item.element)}">${esc(item.layer)}｜${esc(item.element)}</i> ${esc(item.type)}</span>
      </div>
      <div class="num"><span class="mini-label">当前市值</span><b>${money(item.value)}</b></div>
      <div class="num"><span class="mini-label">累计投入</span><b>${money(item.cost)}</b></div>
      <div class="num"><span class="mini-label">盈亏</span><b>${money(profit)}</b></div>
      <div class="num"><span class="mini-label">占比/目标</span><b>${pct(ratio)} / ${pct(normTarget)}</b><small>${esc(statusText)}</small></div>
      ${productLine ? `<small class="prod-meta">${esc(productLine)}</small>` : ""}
    `;
    card.addEventListener("click", () => openAssetEditor(item.id));
    list.appendChild(card);
  });

  const tips = document.querySelector("#rebalanceTips");
  const issues = items
    .map((item) => {
      const ratio = t.value > 0 ? numberValue(item.value) / t.value : 0;
      const normTarget = targetSum > 0 ? numberValue(item.target) / targetSum : 0;
      const gapTarget = numberValue(effectiveTargets[item.id]) || normTarget;
      const gap = ratio - gapTarget;
      if (gap > 0.03) return `${esc(item.name)} 偏高 ${pct(gap)}，暂停新增。`;
      if (gap < -0.03) {
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
  renderMonthlyChecklist();

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

function renderMonthlyChecklist() {
  var wrap = document.querySelector("#monthlyChecklist");
  if (!wrap) return;
  var month = currentMonthRecord();
  var hasPlan = hasAllocationPlan(month);
  var investedDone = numberValue(month && month.invested) > 0;
  var monthEndDone = numberValue(month && month.monthEndAssets) > 0;
  var goal = emergencyGoal();
  var emergencyDone = emergencyValue() >= goal;
  var items = [
    { label: "本月计划是否保存", done: hasPlan, note: hasPlan ? "已保存" : "未保存" },
    { label: "实际投入是否记录", done: investedDone, note: investedDone ? "已记录" : "买入后再记" },
    { label: "月末总资产是否填写", done: monthEndDone, note: monthEndDone ? "已填写" : "月底填写" },
    { label: "应急金目标是否需要调整", done: emergencyDone, note: emergencyDone ? "已达标" : "继续补现金层" },
  ];
  wrap.innerHTML =
    '<div class="checklist-title">月度清单</div>' +
    '<div class="monthly-check-grid">' +
      items.map(function (item) {
        return '<div class="monthly-check-item ' + (item.done ? "done" : "") + '">' +
          '<span>' + esc(item.label) + '</span>' +
          '<b>' + esc(item.note) + '</b>' +
        '</div>';
      }).join("") +
    '</div>';
}

function renderEmergencyBar() {
  var el = document.querySelector("#emergencyBar");
  if (!el) return;
  var goal = emergencyGoal();
  // v8.0：应急罐是独立罐子，不再等于现金层；现金层只是投资组合里的弹药
  var cashValue = emergencyValue();
  var progress = goal > 0 ? Math.min(cashValue / goal, 1) : 0;
  var reached = cashValue >= goal;
  var barEl = el.querySelector(".emergency-bar-fill");
  var textEl = el.querySelector(".emergency-bar-text");
  var subEl = el.querySelector(".emergency-bar-sub");
  if (barEl) barEl.style.width = (progress * 100).toFixed(1) + "%";
  if (barEl) barEl.className = "emergency-bar-fill" + (reached ? " reached" : "");
  if (textEl) textEl.textContent = reached
    ? "应急罐已满 ✓"
    : "应急罐 " + money(cashValue) + " / " + money(goal);
  if (subEl) subEl.textContent = reached
    ? "应急罐已满，本月可投金额开始进投资组合"
    : "应急罐没满：本月可投金额先补应急罐，其他步骤跳过";
  // 目标可点击编辑
  var editEl = el.querySelector(".emergency-edit");
  if (editEl) {
    editEl.textContent = "目标 " + money(goal);
    editEl.onclick = function () {
      var input = prompt("设置应急罐目标金额（元）", goal);
      var val = parseFloat(input);
      if (!isNaN(val) && val > 0) {
        if (!data.settings) data.settings = {};
        data.settings.emergencyGoal = Math.round(val);
        if (saveData()) renderEmergencyBar();
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
      var invested = numberValue(m.invested);
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
  // 同步联动开关的勾选状态（放在提前 return 之前，保证空记录时也同步）
  const linkToggle = document.querySelector("#linkInvestToggle");
  if (linkToggle) linkToggle.checked = isLinkEnabled();
  const sorted = [...data.entries].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  if (!sorted.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><b>暂无记录</b><p>点「记一笔」记录收入、投资或大额消费。</p></div>';
    return;
  }

  // 按年月分组
  const groups = Object.create(null);
  sorted.forEach((item) => {
    const key = String(item.date || "").slice(0, 7).replace("-", "/") || "未知";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  Object.keys(groups).sort((a, b) => b.localeCompare(a)).forEach((monthKey) => {
    const items = groups[monthKey];
    const totalIncome = items.filter(i => i.kind === "收入").reduce((s, i) => s + numberValue(i.amount), 0);
    const totalInvest = items.filter(i => i.kind === "投资").reduce((s, i) => s + numberValue(i.amount), 0);
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

// 名义收益率 → 实际收益率（模型统一用实际口径：目标固定为「今天的购买力」）
function realRateFromNominal(nominalPct, inflationPct) {
  var nominal = clamp(numberValue(nominalPct) / 100, 0, 1);
  var inflation = clamp(numberValue(inflationPct) / 100, 0, 1);
  return (1 + nominal) / (1 + inflation) - 1;
}

function calcFire(inputs) {
  var annualExpense = max0(numberValue(inputs.annualExpense));
  var supplementIncome = max0(numberValue(inputs.supplementIncome));
  var currentAge = max0(numberValue(inputs.currentAge));
  var targetAge = max0(numberValue(inputs.targetAge));
  var inflationRate = clamp(numberValue(inputs.inflationRatePct) / 100, 0, 1);
  var years = Math.max(targetAge - currentAge, 0);
  var domesticMonthly = max0(numberValue(inputs.domesticMonthly));
  var domesticMonths = Math.round(max0(numberValue(inputs.domesticMonths)));
  var overseasMonthly = max0(numberValue(inputs.overseasMonthly));
  var firstYearSetupCost = max0(numberValue(inputs.firstYearSetupCost));
  var savingGrowthPct = numberValue(inputs.savingGrowthPct);
  var studyRatioPct = clamp(numberValue(inputs.studyRatioPct), 0, 50);
  var returnHome = Boolean(inputs.returnHome);
  var returnYears = max0(numberValue(inputs.returnYears));
  var netAnnualExpense = Math.max(annualExpense - supplementIncome, 0);
  var nominalFactor = Math.pow(1 + inflationRate, years);
  // 三条线固定 4% / 3.5% / 3%（v8.1 起不再有「最低线实际收益率」输入，第 1 张卡和第 3 张卡不再重复）
  var rates = [0.04, 0.035, 0.03];
  var primaryRate = rates[0];
  var lines = rates.map(function (rate) {
    var today = rate > 0 ? netAnnualExpense / rate : 0;
    return { rate: rate, today: today, nominal: today * nominalFactor };
  });
  var total = totals().value;
  // 进度条与预计达成日期统一按 3.5% 稳健线（lines[1]），口径不再打架
  var progress = lines[1].today > 0 ? total / lines[1].today : 0;

  var plan = {
    domesticMonthly: domesticMonthly,
    domesticMonths: domesticMonths,
    overseasMonthly: overseasMonthly,
    firstYearSetupCost: firstYearSetupCost,
    savingGrowthPct: savingGrowthPct,
    studyRatioPct: studyRatioPct,
    returnHome: returnHome,
    returnYears: returnYears,
  };
  var expectedAnnual = clamp(numberValue(inputs.expectedReturnPct) / 100, 0, 1);
  var realAnnual = realRateFromNominal(inputs.expectedReturnPct, inputs.inflationRatePct);
  var monthlyRate = Math.pow(1 + Math.max(realAnnual, 0), 1 / 12) - 1;
  var targetToday = lines[1].today;
  var projection = projectMonthsToTargetPhased(total, plan, monthlyRate, targetToday, inflationRate);
  var phasedMonthlyContribution = calcPhasedMonthlyContribution(domesticMonthly, domesticMonths, overseasMonthly, firstYearSetupCost, years, plan);

  // 三种天气：乐观 7% / 普通 5.5% / 悲观 4%（名义），同样折算成实际收益率后滚动
  var weather = [
    { key: "optimistic", label: "乐观", ratePct: 7 },
    { key: "normal", label: "普通", ratePct: 5.5 },
    { key: "pessimistic", label: "悲观", ratePct: 4 },
  ].map(function (w) {
    var real = realRateFromNominal(w.ratePct, inputs.inflationRatePct);
    var rate = Math.pow(1 + Math.max(real, 0), 1 / 12) - 1;
    var proj = projectMonthsToTargetPhased(total, plan, rate, targetToday, inflationRate);
    return {
      key: w.key,
      label: w.label,
      ratePct: w.ratePct,
      realRatePct: real * 100,
      reachable: proj.reachable,
      months: proj.months,
      age: proj.reachable && Number.isFinite(proj.months) ? Math.round((currentAge + proj.months / 12) * 10) / 10 : null,
      etaLabel: proj.reachable ? monthsToDateLabel(proj.months) : "超 80 年",
      human: proj.reachable ? monthsToHuman(proj.months) : "超 80 年",
    };
  });

  var sensitivity = null;
  if (projection.reachable) {
    var basMonths = projection.months;
    var plusPlan = Object.assign({}, plan, {
      domesticMonthly: domesticMonthly + 1000,
      overseasMonthly: overseasMonthly + 1000,
    });
    var pc = projectMonthsToTargetPhased(total, plusPlan, monthlyRate, targetToday, inflationRate);
    var pr = projectMonthsToTargetPhased(total, plan,
      Math.pow(1 + Math.max(realRateFromNominal(clamp(numberValue(inputs.expectedReturnPct) + 1, 0, 100), inputs.inflationRatePct), 0), 1 / 12) - 1,
      targetToday, inflationRate);
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
    phasedMonthlyContribution: phasedMonthlyContribution,
    domesticMonthly: domesticMonthly,
    domesticMonths: domesticMonths,
    overseasMonthly: overseasMonthly,
    firstYearSetupCost: firstYearSetupCost,
    expectedAnnual: expectedAnnual,
    realAnnual: realAnnual,
    savingGrowthPct: savingGrowthPct,
    studyRatioPct: studyRatioPct,
    studyDeductAnnual: Math.round((overseasMonthly || domesticMonthly) * 12 * studyRatioPct / 100),
    returnHome: returnHome,
    returnYears: returnYears,
    targetNominal: lines[1].nominal,
    targetToday: targetToday,
    projection: projection,
    weather: weather,
    sensitivity: sensitivity,
  };
}

function calcPhasedContributionForMonth(monthIndex, plan) {
  var setupDeduct = monthIndex <= 12 ? Math.ceil(max0(numberValue(plan.firstYearSetupCost)) / 12) : 0;
  var domesticMonths = Math.round(max0(numberValue(plan.domesticMonths)));
  var domesticMonthly = max0(numberValue(plan.domesticMonthly));
  var overseasMonthly = max0(numberValue(plan.overseasMonthly));
  var returnHome = Boolean(plan.returnHome);
  var returnYears = max0(numberValue(plan.returnYears));
  // 国内段 → 海外段 →（开启「提前回国」后）回国段；两段月存都为 0 时就是 0（不再有「按历史估算」兜底）
  var base = 0;
  if (monthIndex <= domesticMonths) base = domesticMonthly;
  else if (returnHome && returnYears > 0 && monthIndex > domesticMonths + Math.round(returnYears * 12)) base = domesticMonthly;
  else base = overseasMonthly;
  // 每年存款增长率（扣除通胀后）：实际购买力口径逐月抬升
  var grown = base * Math.pow(1 + numberValue(plan.savingGrowthPct) / 100, (monthIndex - 1) / 12);
  // 读书基金：从月存里先扣掉，不计入 FIRE 资产
  var studyKeep = 1 - clamp(numberValue(plan.studyRatioPct), 0, 50) / 100;
  return Math.max(grown * studyKeep - setupDeduct, 0);
}

function calcPhasedMonthlyContribution(domesticMonthly, domesticMonths, overseasMonthly, firstYearSetupCost, years, extraPlan) {
  var months = Math.max(Math.round(max0(years) * 12), 1);
  var plan = Object.assign({
    domesticMonthly: domesticMonthly,
    domesticMonths: domesticMonths,
    overseasMonthly: overseasMonthly,
    firstYearSetupCost: firstYearSetupCost,
    savingGrowthPct: 0,
    studyRatioPct: 0,
    returnHome: false,
    returnYears: 0,
  }, extraPlan || {});
  var sum = 0;
  for (var m = 1; m <= months; m += 1) sum += calcPhasedContributionForMonth(m, plan);
  return Math.round(sum / months);
}

// 月度滚动（实际购买力口径）：目标固定为今天的购买力，月存按实际增长率抬升
function projectMonthsToTarget(startValue, monthlyContribution, monthlyRate, targetTodayValue, annualInflation) {
  var plan = {
    domesticMonthly: monthlyContribution,
    domesticMonths: 80 * 12,
    overseasMonthly: monthlyContribution,
    firstYearSetupCost: 0,
    savingGrowthPct: 0,
    studyRatioPct: 0,
    returnHome: false,
    returnYears: 0,
  };
  return projectMonthsToTargetPhased(startValue, plan, monthlyRate, targetTodayValue, annualInflation);
}

function projectMonthsToTargetPhased(startValue, contributionPlan, monthlyRate, targetTodayValue, annualInflation) {
  var value = max0(startValue);
  var targetToday = max0(targetTodayValue);
  if (value >= targetToday) return { reachable: true, months: 0, finalValue: value, targetValue: targetToday };
  var MAX_MONTHS = 80 * 12; // 80 年上限，超出视为不可达
  for (var m = 1; m <= MAX_MONTHS; m++) {
    value = value * (1 + monthlyRate) + calcPhasedContributionForMonth(m, contributionPlan);
    if (value >= targetToday) return { reachable: true, months: m, finalValue: value, targetValue: targetToday };
  }
  return { reachable: false, months: Infinity, finalValue: value, targetValue: targetToday };
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

// FIRE 参数（v8.1 落盘到 settings.fire，随同步一起走）
function fireSettings() {
  var saved = (data.settings && isPlainRecord(data.settings.fire)) ? data.settings.fire : {};
  // 再走一遍 pickFireSettings：即使 localStorage 被手改脏，页面显示的也是夹取后的合法值
  return pickFireSettings(saved);
}

// 页面输入 ↔ settings.fire 键名（13 个输入，一一对应）
var FIRE_INPUT_MAP = {
  "#fireAnnualExpense": "annualExpense",
  "#fireCurrentAge": "currentAge",
  "#fireTargetAge": "targetAge",
  "#fireInflationRate": "inflationRatePct",
  "#fireSupplementIncome": "supplementIncome",
  "#fireExpectedReturn": "expectedReturnPct",
  "#fireDomesticMonthly": "domesticMonthly",
  "#fireDomesticMonths": "domesticMonths",
  "#fireOverseasMonthly": "overseasMonthly",
  "#fireSetupCost": "firstYearSetupCost",
  "#fireSavingGrowth": "savingGrowthPct",
  "#fireReturnYears": "returnYears",
};

// 把 settings.fire 写回输入框（刷新后值还在）；正在输入的框不打断
function syncFireInputs() {
  var saved = fireSettings();
  Object.keys(FIRE_INPUT_MAP).forEach(function (selector) {
    var el = document.querySelector(selector);
    if (!el || document.activeElement === el) return;
    var next = String(saved[FIRE_INPUT_MAP[selector]]);
    if (String(el.value) !== next) el.value = next;
  });
  var homeEl = document.querySelector("#fireReturnHome");
  if (homeEl && document.activeElement !== homeEl) homeEl.checked = Boolean(saved.returnHome);
}

// change 时把输入写回 settings.fire
function saveFireSettings() {
  var inputs = getFireInputs();
  if (!inputs) return;
  if (!data.settings) data.settings = {};
  data.settings.fire = pickFireSettings({
    annualExpense: inputs.annualExpense,
    currentAge: inputs.currentAge,
    targetAge: inputs.targetAge,
    inflationRatePct: inputs.inflationRatePct,
    supplementIncome: inputs.supplementIncome,
    expectedReturnPct: inputs.expectedReturnPct,
    domesticMonthly: inputs.domesticMonthly,
    domesticMonths: inputs.domesticMonths,
    overseasMonthly: inputs.overseasMonthly,
    firstYearSetupCost: inputs.firstYearSetupCost,
    savingGrowthPct: inputs.savingGrowthPct,
    returnHome: inputs.returnHome,
    returnYears: inputs.returnYears,
  });
  if (!saveData()) return;
  renderFire();
}

// FIRE 输入读取（v8.1）：DOM 优先（渲染时已把 settings.fire 写进输入框），其次 settings.fire，最后默认值
function getFireInputs() {
  var annualExpenseEl = document.querySelector("#fireAnnualExpense");
  if (!annualExpenseEl) return null;
  var saved = fireSettings();
  var pick = function (selector, fallback) {
    var el = document.querySelector(selector);
    if (!el || String(el.value).trim() === "") return fallback;
    return numberValue(el.value);
  };
  var returnHomeEl = document.querySelector("#fireReturnHome");
  return {
    annualExpense: pick("#fireAnnualExpense", saved.annualExpense),
    currentAge: pick("#fireCurrentAge", saved.currentAge),
    targetAge: pick("#fireTargetAge", saved.targetAge),
    inflationRatePct: pick("#fireInflationRate", saved.inflationRatePct),
    supplementIncome: pick("#fireSupplementIncome", saved.supplementIncome),
    expectedReturnPct: pick("#fireExpectedReturn", saved.expectedReturnPct),
    domesticMonthly: pick("#fireDomesticMonthly", saved.domesticMonthly),
    domesticMonths: pick("#fireDomesticMonths", saved.domesticMonths),
    overseasMonthly: pick("#fireOverseasMonthly", saved.overseasMonthly),
    firstYearSetupCost: pick("#fireSetupCost", saved.firstYearSetupCost),
    savingGrowthPct: pick("#fireSavingGrowth", saved.savingGrowthPct),
    // 读书基金：FIRE 页不再单独填比例，直接跟分配页设置走（未启用按 0）
    studyRatioPct: studyFundEnabled() ? studyFundRatioPct() : 0,
    returnHome: returnHomeEl ? returnHomeEl.checked : Boolean(saved.returnHome),
    returnYears: pick("#fireReturnYears", saved.returnYears),
  };
}

function renderFireWeather(result) {
  var wrap = document.querySelector("#fireWeather");
  if (!wrap) return;
  wrap.innerHTML = result.weather.map(function (w) {
    var isCurrent = result.projection.reachable && Number.isFinite(result.projection.months) && Math.abs(w.months - result.projection.months) < 1;
    return '<article class="weather-card' + (isCurrent ? " hit" : "") + '">' +
      "<span>" + esc(w.label) + "（名义 " + w.ratePct + "%）</span>" +
      "<strong>" + esc(w.human) + "</strong>" +
      "<small>" + esc(w.etaLabel) + (w.age != null ? " · 约 " + w.age + " 岁" : "") + "</small>" +
    "</article>";
  }).join("");
}

function renderFire() {
  syncFireInputs();
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
  var thirdCard = document.querySelector("#fireToday3") ? document.querySelector("#fireToday3").closest(".fire-card") : null;
  if (thirdCard) thirdCard.querySelector("span").textContent = "3% 安心线（今天）";
  document.querySelector("#fireToday3").textContent = fireMoney(result.lines[2].today);
  document.querySelector("#fireNominal3").textContent = "目标年龄名义 " + fireMoney(result.lines[2].nominal);
  document.querySelector("#fireNetExpense").textContent = money(result.netAnnualExpense);
  document.querySelector("#fireNominalFactor").textContent = result.nominalFactor.toFixed(3);
  document.querySelector("#fireProgressText").textContent = pct(result.progress);
  document.querySelector("#fireProgressBar").style.width = Math.min(result.progress, 1) * 100 + "%";

  renderFireDashboard(result);
  renderFireWeather(result);

  var rateEl = document.querySelector("#fireRateNote");
  if (rateEl) {
    rateEl.textContent = "测算用实际收益率 = (1 + 名义 " + (result.expectedAnnual * 100).toFixed(1) + "%) / (1 + 通胀 " +
      (result.inflationRate * 100).toFixed(1) + "%) − 1 = " + (result.realAnnual * 100).toFixed(2) +
      "%；三条线固定 4% / 3.5% / 3%，进度条与预计达成日期都按 3.5% 稳健线。年数与说明书期望的 13/15/16 年有差异，就是这个口径造成的。";
  }
  var studyEl = document.querySelector("#fireStudyNote");
  if (studyEl) {
    studyEl.textContent = "读书基金：跟分配页的启用开关和比例走（当前 " + result.studyRatioPct + "%" + (result.studyRatioPct > 0 ? "" : "，未启用按 0 计") +
      "）；启用后从月存里先扣掉、不计入 FIRE 资产，按当前参数每年少投约 " + money(result.studyDeductAnnual) + "。";
  }
  var socialEl = document.querySelector("#fireSocialNote");
  if (socialEl) {
    socialEl.textContent = "FIRE 后需按灵活就业身份继续缴社保，最低缴费年限将逐步提高到 20 年，这笔费用应包含在目标年支出里。";
  }

  var noWork = calcFire(Object.assign({}, inputs, { supplementIncome: 0 }));
  var noWorkEl = document.querySelector("#fireNoWork");
  if (noWorkEl && result.supplementIncome <= 0) {
    noWorkEl.textContent = "";
    noWorkEl.style.display = "none";
  } else if (noWorkEl) {
    noWorkEl.style.display = "block";
    var noWorkEta = noWork.projection.reachable
      ? (noWork.projection.months === 0 ? "当前已达模型目标" : monthsToDateLabel(noWork.projection.months) + "（约 " + monthsToHuman(noWork.projection.months) + "后）")
      : "80 年内未达模型目标";
    noWorkEl.textContent = "全年不工作对照（年劳动收入 0，3.5% 提款情景）：今天本金 " + fireMoney(noWork.lines[1].today)
      + "，目标年龄名义本金 " + fireMoney(noWork.lines[1].nominal) + "；预计 " + noWorkEta + "。";
  }
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
      etaEl.textContent = "已达成";
      etaSubEl.textContent = "当前净值已覆盖 3.5% 稳健线目标";
    } else {
      etaEl.textContent = monthsToDateLabel(proj.months);
      etaSubEl.textContent = "约 " + monthsToHuman(proj.months) + "后 · 目标 " + fireMoney(proj.targetValue || result.targetNominal)
        + " · 国内月存 " + money(result.domesticMonthly) + " / 海外月存 " + money(result.overseasMonthly) + " @ " + (result.expectedAnnual * 100).toFixed(0) + "%";
    }
  } else {
    etaEl.textContent = "超 80 年 / 不可达";
    etaSubEl.textContent = "提高月投入或预期收益率后再看（国内月存 " + money(result.domesticMonthly) + " / 海外月存 " + money(result.overseasMonthly) + "）";
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
    fv = fv * (1 + monthlyRate) + calcPhasedContributionForMonth(m, {
      domesticMonthly: result.domesticMonthly,
      domesticMonths: result.domesticMonths,
      overseasMonthly: result.overseasMonthly,
      firstYearSetupCost: result.firstYearSetupCost,
    });
    if (m % step === 0 || m === horizon) forecast.push({ value: fv });
  }

  var histSeries = history.map(function(h, i) {
    return { value: h.value, label: i === 0 ? h.month.replace(/^\d+\//, "") + "月" : (i === history.length - 1 ? "今天" : null) };
  });
  if (!histSeries.length) histSeries = [{ value: result.totalAssets, label: "今天" }];

  var chartTarget = proj && proj.reachable && proj.targetValue ? proj.targetValue : result.targetNominal;
  var maxVal = Math.max(chartTarget, fv, result.totalAssets) * 1.08;

  // 达成点坐标（在预测线末段）
  var specialDot = null;
  if (proj && proj.reachable && proj.months > 0) {
    var W = 320, padL = 28, padR = 8;
    var totalPts = histSeries.length - 1 + forecast.length - 1;
    var fcIdx = forecast.length - 1;
    var cx = totalPts > 0 ? padL + ((histSeries.length - 1 + fcIdx) / totalPts) * (W - padL - padR) : W - padR;
    var ty = 10 + (120 - 10 - 22) - (Math.max(chartTarget, 0) / maxVal) * (120 - 10 - 22);
    specialDot = { cx: cx, cy: ty, label: monthsToDateLabel(proj.months) };
  }

  drawLineChart(el, histSeries, {
    H: 140, padL: 28,
    maxVal: maxVal,
    targetVal: chartTarget,
    targetLabel: "目标",
    forecastSeries: forecast,
    emptyText: "在「月度」里填月末总资产后显示曲线。",
    specialDot: specialDot,
    yLabels: [
      { value: chartTarget, label: fireMoney(chartTarget) },
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
  var usdEl = document.querySelector("#allocUsdIncome");
  var fxEl = document.querySelector("#allocFxRate");
  var studyEl = document.querySelector("#allocStudyRatio");
  var expatEl = document.querySelector("#allocExpatToggle");
  var minCommEl = document.querySelector("#allocMinCommToggle");
  var fxRaw = fxEl ? parseFloat(fxEl.value) : NaN;
  var premiums = {};
  var savedPremiums = (data.settings && data.settings.premiumInputs) || {};
  Object.keys(savedPremiums).forEach(function (id) { premiums[id] = numberValue(savedPremiums[id]); });
  document.querySelectorAll("#allocLayers input[data-premium-id]").forEach(function (input) {
    var id = input.getAttribute("data-premium-id");
    var value = parseFloat(input.value);
    if (Number.isFinite(value)) premiums[id] = value;
  });
  return {
    income: max0(parseFloat(document.querySelector("#allocIncome").value)),
    expense: max0(parseFloat(document.querySelector("#allocExpense").value)),
    reserve: max0(parseFloat(document.querySelector("#allocReserve").value)),
    savingRatePct: clamp(Number.isFinite(savingRateRaw) ? savingRateRaw : 35, 0, 100),
    usdIncome: max0(usdEl ? parseFloat(usdEl.value) : 0),
    fxRate: Number.isFinite(fxRaw) && fxRaw > 0 ? fxRaw : fxRate(),
    expat: expatEl ? expatEl.checked : Boolean(data.settings && data.settings.expatMode),
    studyRatioPct: clamp(studyEl && studyEl.value !== "" ? numberValue(studyEl.value) : studyFundRatioPct(), 0, 50),
    minCommission5: minCommEl ? minCommEl.checked : !(data.settings && data.settings.minCommission5 === false),
    premiums: premiums,
  };
}

// ---- 溢价分级（任务 3.4 / 任务 4）----
function premiumTier(pct) {
  if (!Number.isFinite(pct)) return null;
  for (var i = 0; i < PREMIUM_TIERS.length; i += 1) {
    if (pct < PREMIUM_TIERS[i].max) return PREMIUM_TIERS[i];
  }
  return PREMIUM_TIERS[PREMIUM_TIERS.length - 1];
}

function channelAdvice(asset, premiumPct) {
  var channel = String(asset.channel || "");
  if (channel !== "看溢价") return channel || "场外";
  var tier = premiumTier(premiumPct);
  if (!tier) return "待填本月溢价（<2% 场内全额，2~3% 半额，3~5% 暂停场内，>5% 只走场外）";
  return tier.label;
}

// 溢价决定本月这笔钱有多少真的买进去、多少进等候罐
function premiumSplit(asset, amount, premiumPct) {
  if (String(asset.channel || "") !== "看溢价" || !Number.isFinite(premiumPct)) {
    return { invest: amount, waiting: 0, note: "" };
  }
  // v8.1 四档：<2% 全额（原来的「<1% 全额」和「1~2% 小额」实际行为一样，已合并）
  if (premiumPct < 2) return { invest: amount, waiting: 0, note: "溢价 <2%：正常按月买，场内" };
  if (premiumPct < 3) {
    var half = Math.round(amount / 2);
    return { invest: half, waiting: amount - half, note: "溢价 2~3%：半额，另一半进等候罐" };
  }
  if (premiumPct < 5) return { invest: 0, waiting: amount, note: "溢价 3~5%：暂停场内，改为场外每日定投（买不进就留等候罐）" };
  return { invest: 0, waiting: amount, note: "溢价 >5%：绝对不买场内，全部改为场外每日定投（限购就进等候罐）" };
}

// 按缺口分配：最低 5 元模式只推缺口最大的 1~2 只，否则按缺口比例分给全部
function distributeByGap(entries, budget, minComm) {
  var result = entries.map(function (entry) { return { entry: entry, amount: 0 }; });
  if (budget <= 0) return result;
  var active = result.filter(function (row) { return row.entry.gapAmount > 0; });
  if (!active.length) return result;
  var picked = active;
  if (minComm) {
    picked = active.slice().sort(function (a, b) { return b.entry.gapAmount - a.entry.gapAmount; }).slice(0, active.length > 1 ? 2 : 1);
  }
  var sum = picked.reduce(function (s, row) { return s + row.entry.gapAmount; }, 0) || 1;
  var allocated = 0;
  picked.forEach(function (row, index) {
    var isLast = index === picked.length - 1;
    var remaining = Math.max(budget - allocated, 0);
    var raw = isLast ? remaining : Math.round(budget * row.entry.gapAmount / sum);
    var amount = isLast ? remaining : Math.min(Math.max(raw, 0), remaining);
    row.amount = amount;
    allocated += amount;
  });
  return result;
}

// 核心分配引擎（v8.0）
// 顺序：应急罐优先 → 读书基金（默认关闭）→ 投资组合按缺口；外派阶段再按币种拆
function calcAllocation(inputs) {
  var savingRate = inputs.savingRatePct / 100;
  var expat = Boolean(inputs.expat);
  var fx = Number.isFinite(inputs.fxRate) && inputs.fxRate > 0 ? inputs.fxRate : fxRate();
  var usdIncomeRmb = max0(inputs.usdIncome) * fx;
  var totalIncome = max0(inputs.income) + (expat ? usdIncomeRmb : 0);
  var cashflowAvailable = Math.max(totalIncome - inputs.expense - inputs.reserve, 0);
  var targetSaving = totalIncome * savingRate;
  var rawInvestBase = Math.min(cashflowAvailable, targetSaving);
  var investBase = Math.round(rawInvestBase);
  var remainingCash = cashflowAvailable - investBase;

  var items = investmentAssets();
  var totalAssets = items.reduce(function (s, a) { return s + numberValue(a.value); }, 0);
  var targetSum = targetSumOf(items);
  var speculativeValue = items.reduce(function (s, a) {
    return a.layer === "投机层" ? s + numberValue(a.value) : s;
  }, 0);
  var speculativeRatio = totalAssets > 0 ? speculativeValue / totalAssets : 0;
  var specCap = speculativeCap();
  var speculativePaused = specCap > 0 && speculativeRatio >= specCap;
  var useCorrection = allocState.mode === "修正" && totalAssets > 0 && targetSum > 0;
  var effectiveTargets = computeEffectiveTargets(items);

  // ---- 步骤 1：应急罐没满，先补满（补满后剩余才继续往下走）----
  var goal = emergencyGoal();
  var emergencyNow = jarValue("emergency");
  var emergencyGap = Math.max(goal - emergencyNow, 0);
  var emergencyAlloc = Math.min(investBase, emergencyGap);
  var afterEmergency = investBase - emergencyAlloc;
  var emergencyMonths = emergencyGap > 0 && investBase > 0 ? Math.ceil(emergencyGap / investBase) : 0;

  // ---- 步骤 2：读书基金（默认关闭；启用后按比例，达到目标自动停止）----
  var studyEnabled = studyFundEnabled();
  var studyGoalAmt = studyFundGoal();
  var studyNow = jarValue("study");
  var studyAlloc = 0;
  var studyStopped = false;
  var studyNeedsGoal = false;
  if (studyEnabled && afterEmergency > 0) {
    if (studyGoalAmt <= 0) {
      // 启用但没填目标：不扣款。否则"达到目标后自动停止"永远不成立，会一直按比例扣。
      studyNeedsGoal = true;
    } else if (studyNow >= studyGoalAmt) {
      studyStopped = true;
    } else {
      var wantStudy = Math.round(afterEmergency * clamp(inputs.studyRatioPct, 0, 50) / 100);
      studyAlloc = Math.min(wantStudy, Math.max(studyGoalAmt - studyNow, 0));
    }
  }
  var portfolioBudget = afterEmergency - studyAlloc;

  // ---- 步骤 3：投资组合内部按缺口分配 ----
  // 缺口按「本月投完之后的组合总额」算：持仓全为 0 时也能按目标比例分配第一笔钱
  var baseTotal = totalAssets + Math.max(portfolioBudget, 0);
  var norms = items.map(function (a) {
    var normTarget = targetSum > 0 ? numberValue(a.target) / targetSum : 0;
    var effectiveTarget = numberValue(effectiveTargets[a.id]) || normTarget;
    var targetAmount = effectiveTarget * baseTotal;
    return {
      asset: a,
      normTarget: normTarget,
      effectiveTarget: effectiveTarget,
      targetAmount: targetAmount,
      gapAmount: Math.max(targetAmount - numberValue(a.value), 0),
      ratio: totalAssets > 0 ? numberValue(a.value) / totalAssets : 0,
      cap: productCap(a),
      premium: inputs.premiums && Number.isFinite(Number(inputs.premiums[a.id])) ? Number(inputs.premiums[a.id]) : NaN,
    };
  });

  var pool = [];
  var skipped = [];
  var suspended = [];
  norms.forEach(function (n) {
    var asset = n.asset;
    var buyStatus = String(asset.buyStatus || "正常");
    var entry = Object.assign({}, n, { channelAdvice: channelAdvice(asset, n.premium) });
    // v8.2：手动暂停与「暂停申购」同口径 —— 本月额度进等候罐，不再分给其他产品
    if (asset.status === "paused:manual") suspended.push(Object.assign(entry, { reason: "手动暂停：本月额度进等候罐" }));
    else if (buyStatus === "暂停申购") suspended.push(Object.assign(entry, { reason: "暂停申购：本月不推荐，金额转场外或等候罐" }));
    else if (speculativePaused && asset.layer === "投机层") skipped.push(Object.assign(entry, { reason: "投机层超限暂停" }));
    // 单品硬上限（黄金 10%）：上限从 V8_PRODUCTS 的 cap 读，不在逻辑里写死
    else if (n.cap > 0 && n.ratio >= n.cap) skipped.push(Object.assign(entry, { reason: asset.name + " 达到 " + pct(n.cap) + " 上限" }));
    else if (useCorrection && n.ratio - n.effectiveTarget > 0.03) skipped.push(Object.assign(entry, { reason: "偏高暂停（超目标 3 个百分点）" }));
    else pool.push(entry);
  });

  // 暂停申购 / 手动暂停的产品：本月不推荐，但它那份额度不走别的产品，全部进等候罐（说明书任务 4 验收；v8.2 起手动暂停并入同一口径）
  var poolGap = pool.reduce(function (sum, e) { return sum + e.gapAmount; }, 0);
  var suspendedGap = suspended.reduce(function (sum, e) { return sum + e.gapAmount; }, 0);
  var allGap = poolGap + suspendedGap;
  var waitingFromSuspended = allGap > 0 ? Math.round(portfolioBudget * suspendedGap / allGap) : 0;
  var investBudget = Math.max(portfolioBudget - waitingFromSuspended, 0);

  // 外派阶段：美元优先买美股（成长+投机），人民币买国内（现金/防御/生财）
  // 层目标也走归一化（任务 1 的兜底），不要写死 35%
  var usLayerTarget = items.reduce(function (sum, a) {
    return a.layer === "成长层" || a.layer === "投机层" ? sum + numberValue(a.target) : sum;
  }, 0);
  var usShare = targetSum > 0 ? usLayerTarget / targetSum : 0;
  var usEntries = pool.filter(function (e) { return e.asset.layer === "成长层" || e.asset.layer === "投机层"; });
  var domesticEntries = pool.filter(function (e) { return e.asset.layer !== "成长层" && e.asset.layer !== "投机层"; });

  var expatInfo = null;
  var rows = [];
  if (expat && investBudget > 0) {
    // P0-1：先用美元、人民币补剩下的。旧实现先按人民币收入切池，储蓄率低于（人民币收入÷总收入）时美元池恒为 0，
    // 而 domesticBudget 又按 usdTarget 扣掉一块，那块钱既没进美股也没进等候罐 —— 凭空消失。
    var usdPool = Math.min(usdIncomeRmb, investBudget);
    var rmbPool = Math.max(investBudget - usdPool, 0);
    var usdTarget = Math.round(usShare * investBudget);
    var usdAllocated = Math.min(usdPool, usdTarget);
    var usdRows = distributeByGap(usEntries, usdAllocated, inputs.minCommission5);
    var usdUsed = usdRows.reduce(function (sum, row) { return sum + row.amount; }, 0);
    // 美元没买进美股的部分（含因缺口为 0 没分掉的）全部走「先补弹药罐，其余建议结汇」
    var usdLeftover = Math.max(usdPool - usdUsed, 0);
    // 人民币全部给国内部分（应急罐与读书基金已在前面单独扣出，不重复占池）
    var rmbRows = distributeByGap(domesticEntries, rmbPool, inputs.minCommission5);
    var rmbUsed = rmbRows.reduce(function (sum, row) { return sum + row.amount; }, 0);
    // 弹药罐 = 投资组合里的现金层（货币基金）；扣掉本月已经分给现金层的部分，避免重复补
    var cashLayerNow = drawdownAmmo();
    var cashAllocNow = rmbRows.concat(usdRows).reduce(function (sum, row) {
      return row.entry.asset.layer === "现金层" ? sum + row.amount : sum;
    }, 0);
    var ammoTarget = Math.round(items.reduce(function (sum, a) {
      return a.layer === "现金层" ? sum + numberValue(effectiveTargets[a.id]) * totalAssets : sum;
    }, 0));
    var ammoGap = Math.max(ammoTarget - cashLayerNow - cashAllocNow, 0);
    var ammoTopUp = Math.min(usdLeftover, ammoGap);
    expatInfo = {
      fxRate: fx,
      usdIncome: max0(inputs.usdIncome),
      usdIncomeRmb: usdIncomeRmb,
      rmbIncome: max0(inputs.income),
      rmbPool: rmbPool,
      usdPool: usdPool,
      usdTarget: usdTarget,
      usdAllocated: usdAllocated,
      usdUsed: usdUsed,
      usdLeftover: usdLeftover,
      ammoTopUp: ammoTopUp,
      suggestConvert: Math.max(usdLeftover - ammoTopUp, 0),
      rmbUsed: rmbUsed,
      rmbUnallocated: Math.max(rmbPool - rmbUsed, 0),
      ammoNow: cashLayerNow,
      ammoTarget: ammoTarget,
      note: "不要把国内美元汇出去开海外券商买股票。",
    };
    rows = usdRows.concat(rmbRows).map(function (row) { return Object.assign(row, { currency: usEntries.indexOf(row.entry) >= 0 ? "USD" : "CNY" }); });
  } else {
    rows = distributeByGap(pool, investBudget, inputs.minCommission5);
  }

  // 溢价分流 + 组装产品行
  var products = [];
  var allocatedTotal = emergencyAlloc + studyAlloc;
  var waitingFromPremium = 0;
  var recommendedNames = [];
  rows.forEach(function (row) {
    var entry = row.entry;
    var asset = entry.asset;
    if (row.amount <= 0) {
      if (pool.indexOf(entry) >= 0) {
        var zeroReason = entry.gapAmount <= 0
          ? "本月无缺口（已达目标）"
          : (inputs.minCommission5 ? "最低 5 元：本月先买缺口最大的 1~2 只" : "按缺口比例分配后本月金额为 0");
        products.push({
          asset: asset, normTarget: entry.normTarget, effectiveTarget: entry.effectiveTarget, targetAmount: entry.targetAmount,
          gapAmount: entry.gapAmount, amount: 0, skipped: true, reason: zeroReason,
          channel: entry.channelAdvice, premium: entry.premium, bufferIncoming: 0,
        });
      }
      return;
    }
    var split = premiumSplit(asset, row.amount, entry.premium);
    var invested = split.invest;
    var waiting = split.waiting;
    waitingFromPremium += waiting;
    allocatedTotal += invested;
    if (invested > 0) recommendedNames.push(asset.name + "（" + entry.channelAdvice + "）");
    products.push({
      asset: asset, normTarget: entry.normTarget, effectiveTarget: entry.effectiveTarget, targetAmount: entry.targetAmount,
      gapAmount: entry.gapAmount, amount: invested, skipped: invested <= 0, reason: invested <= 0 ? split.note : "",
      channel: entry.channelAdvice, premium: entry.premium, premiumWaiting: waiting, premiumNote: split.note,
      currency: row.currency || "CNY", bufferIncoming: 0,
    });
  });
  skipped.concat(suspended).forEach(function (entry) {
    products.push({
      asset: entry.asset, normTarget: entry.normTarget, effectiveTarget: entry.effectiveTarget, targetAmount: entry.targetAmount,
      gapAmount: entry.gapAmount, amount: 0, skipped: true, reason: entry.reason,
      channel: entry.channelAdvice, premium: entry.premium, bufferIncoming: 0,
    });
  });

  // 资金守恒检查（说明书 P0-1 不变量，仅外派模式）：
  // 应急 + 读书 + 美股 + 国内 + 等候罐 + 弹药 + 建议结汇 = investBase（允许 ±1 元取整误差）
  // 差额只剩「人民币池没分掉的部分」（产品都到目标、没有缺口时），它会保留现金，已单列 unallocatedRmb。
  var balance = null;
  if (expatInfo) {
    var usdInvested = 0;
    var rmbInvested = 0;
    products.forEach(function (p) {
      if (p.currency === "USD") usdInvested += numberValue(p.amount);
      else rmbInvested += numberValue(p.amount);
    });
    var balanceAccounted = emergencyAlloc + studyAlloc + usdInvested + rmbInvested +
      waitingFromPremium + waitingFromSuspended + numberValue(expatInfo.ammoTopUp) + numberValue(expatInfo.suggestConvert);
    balance = {
      emergency: emergencyAlloc,
      study: studyAlloc,
      usdInvested: usdInvested,
      domesticInvested: rmbInvested,
      waiting: waitingFromPremium + waitingFromSuspended,
      ammo: numberValue(expatInfo.ammoTopUp),
      convert: numberValue(expatInfo.suggestConvert),
      accounted: balanceAccounted,
      investBase: investBase,
      diff: balanceAccounted - investBase,
      unallocatedRmb: numberValue(expatInfo.rmbUnallocated),
    };
  }

  // v8.2：手动暂停的份额已在等候罐里，这里按缺口占比把它单列出来（字段保留，含义改为「手动暂停对应的等候罐金额」）
  var manualGap = suspended.reduce(function (s, entry) {
    return entry.reason.indexOf("手动暂停") === 0 ? s + entry.gapAmount : s;
  }, 0);
  var manualPausedCash = suspendedGap > 0 ? Math.round(waitingFromSuspended * manualGap / suspendedGap) : 0;

  // 按层级汇总
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
    targetCheck: validateTargetSum(items),
    speculativeRatio: speculativeRatio,
    speculativePaused: speculativePaused,
    manualPausedCash: manualPausedCash,
    waitingFromPremium: waitingFromPremium,
    recommendedNames: recommendedNames,
    emergency: {
      goal: goal, value: emergencyNow, gap: emergencyGap, amount: emergencyAlloc,
      monthsToFull: emergencyMonths, full: emergencyGap <= 0, reachedAfter: emergencyNow + emergencyAlloc >= goal,
    },
    study: {
      enabled: studyEnabled, goal: studyGoalAmt, value: studyNow, amount: studyAlloc,
      ratioPct: clamp(inputs.studyRatioPct, 0, 50), stopped: studyStopped, needsGoal: studyNeedsGoal,
    },
    portfolioBudget: portfolioBudget,
    investBudget: investBudget,
    waitingFromSuspended: waitingFromSuspended,
    expat: expatInfo,
    balance: balance,
    products: products,
    layers: layerList,
  };
}

function statusLabel(layer) {
  var reasons = layer.products.map(function (p) { return String(p.reason || ""); });
  if (layer.allSkipped && reasons.some(function (r) { return r.indexOf("投机层超限") === 0; })) return "超限暂停";
  if (layer.allSkipped && reasons.some(function (r) { return r.indexOf("手动暂停") === 0; })) return "手动暂停";
  if (layer.allSkipped && reasons.every(function (r) { return r.indexOf("最低 5 元") === 0 || r.indexOf("暂停申购") === 0; })) return "本月不推荐";
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

function renderJarAllocation(result) {
  var wrap = document.querySelector("#jarAllocation");
  if (!wrap) return;
  var rows = [];
  rows.push('<div class="jar-split-row"><span>🛟 应急罐</span><strong>' + money(result.emergency.amount) + '</strong><em>' +
    (result.emergency.full ? "已满，本月不再补" : "还差 " + money(result.emergency.gap) + "，预计 " + result.emergency.monthsToFull + " 个月存满") + '</em></div>');
  rows.push('<div class="jar-split-row' + (result.study.enabled ? "" : " muted") + '"><span>🎓 读书基金</span><strong>' + money(result.study.amount) + '</strong><em>' +
    (result.study.enabled ? (result.study.stopped ? "已达目标，自动停止" : "比例 " + result.study.ratioPct + "%（优先美元）") : "默认关闭，本月跳过") + '</em></div>');
  rows.push('<div class="jar-split-row"><span>📈 投资组合</span><strong>' + money(result.portfolioBudget) + '</strong><em>' +
    (result.recommendedNames.length ? "推荐 " + esc(result.recommendedNames.join("、")) : "按缺口分配") + '</em></div>');
  if (result.expat) {
    var x = result.expat;
    rows.push('<div class="jar-split-row alloc-currency"><span>💵 外派币种</span><strong>' + money(x.usdIncomeRmb) + '</strong><em>' +
      "美元收入折合（1 美元 = " + x.fxRate + "）：美股用 " + money(x.usdUsed) + "，人民币 " + money(x.rmbPool) + " 分给国内部分；剩余美元 " +
      money(x.usdLeftover) + " 先补弹药罐 " + money(x.ammoTopUp) + "，其余建议结汇 " + money(x.suggestConvert) + '</em></div>');
  }
  if (result.waitingFromPremium > 0 || result.waitingFromSuspended > 0) {
    rows.push('<div class="jar-split-row"><span>⏳ 等候罐</span><strong>' + money(result.waitingFromPremium + result.waitingFromSuspended) + '</strong><em>' +
      (result.waitingFromPremium > 0 ? "溢价过高 " + money(result.waitingFromPremium) : "") +
      (result.waitingFromPremium > 0 && result.waitingFromSuspended > 0 ? "；" : "") +
      (result.waitingFromSuspended > 0 ? "暂停申购 / 手动暂停 " + money(result.waitingFromSuspended) : "") + '</em></div>');
  }
  wrap.innerHTML = '<div class="checklist-title">本月分配顺序</div><div class="jar-split-grid">' + rows.join("") + '</div>';
}

function renderAllocLayers(result) {
  var layersEl = document.querySelector("#allocLayers");
  if (!layersEl) return;
  layersEl.innerHTML = "";
  result.layers.forEach(function (layer) {
    var layerDiv = document.createElement("div");
    layerDiv.className = "alloc-layer" + (allocState.expanded[layer.name] ? " open" : "");
    var colorClass = layerColor(layer.products[0] && layer.products[0].asset.element);
    var statusText = statusLabel(layer);
    var statusBadge = statusText === "正常" ? '<i class="badge ok">正常</i>' : '<i class="badge fire">' + statusText + "</i>";
    var layerMeta = V8_LAYERS.find(function (l) { return l.name === layer.name; }) || {};
    layerDiv.innerHTML =
      '<div class="alloc-layer-head" data-layer="' + esc(layer.name) + '">' +
        '<div class="layer-label">' +
          '<i class="badge ' + colorClass + '">' + esc(layer.name) + "</i> " + statusBadge +
          (layerMeta.cap ? '<small>上限 ' + pct(layerMeta.cap) + "</small>" : "") +
        "</div>" +
        '<div class="layer-amount">' + money(layer.total) + '<small>' + pct(layer.normTargetSum) + "</small></div>" +
        '<span class="layer-arrow">▾</span>' +
      "</div>" +
      '<div class="alloc-layer-body">' +
        layer.products.map(function (p) {
          var skippedClass = p.skipped ? " skipped" : "";
          var extras = [];
          if (p.asset.code) extras.push("代码 " + esc(p.asset.code));
          extras.push("在哪买：" + esc(p.channel || p.asset.channel || "—"));
          if (p.asset.buyStatus && p.asset.buyStatus !== "正常") extras.push(esc(p.asset.buyStatus));
          if (p.gapAmount > 0) extras.push("缺口 " + money(p.gapAmount));
          if (p.currency === "USD") extras.push("美元现汇份额");
          if (p.premiumWaiting > 0) extras.push("进等候罐 " + money(p.premiumWaiting));
          if (p.premiumNote) extras.push(esc(p.premiumNote));
          var premiumHtml = String(p.asset.channel) === "看溢价"
            ? '<label class="premium-input">本月溢价 %<input type="number" step="0.1" data-premium-id="' + esc(p.asset.id) + '" value="' + (Number.isFinite(p.premium) ? p.premium : "") + '" placeholder="—"></label>'
            : "";
          var subText = pct(p.normTarget);
          if (p.skipped) subText += " · " + esc(p.reason);
          return '<div class="alloc-product' + skippedClass + '">' +
            '<span class="prod-name">' + esc(p.asset.name) + '<small class="prod-meta">' + extras.join(" · ") + "</small></span>" +
            '<span class="prod-amount">' + money(p.amount) + "<small>" + subText + "</small></span>" +
            premiumHtml +
          "</div>";
        }).join("") +
      "</div>";
    layersEl.appendChild(layerDiv);
  });
  layersEl.querySelectorAll(".alloc-layer-head").forEach(function (head) {
    head.addEventListener("click", function () {
      var layerName = head.getAttribute("data-layer");
      allocState.expanded[layerName] = !allocState.expanded[layerName];
      refreshAllocation();
    });
  });
  layersEl.querySelectorAll("input[data-premium-id]").forEach(function (input) {
    input.addEventListener("change", function () {
      var id = input.getAttribute("data-premium-id");
      var value = parseFloat(input.value);
      if (!data.settings) data.settings = {};
      if (!isPlainRecord(data.settings.premiumInputs)) data.settings.premiumInputs = {};
      if (Number.isFinite(value)) data.settings.premiumInputs[id] = value;
      else delete data.settings.premiumInputs[id];
      if (!saveData()) return;
      refreshAllocation();
    });
  });
}

function refreshAllocation() {
  var inputs = getAllocInputs();
  var result = calcAllocation(inputs);

  document.querySelector("#allocCashflow").textContent = money(result.cashflowAvailable);
  document.querySelector("#allocSavingPct").textContent = inputs.savingRatePct;
  document.querySelector("#allocTargetSaving").textContent = money(result.targetSaving);
  document.querySelector("#allocFinalInvest").textContent = money(result.allocatedTotal);
  document.querySelector("#allocRemaining").textContent = money(result.actualRemainingCash);
  renderJarAllocation(result);
  renderAllocationChecklist(result);
  renderDrawdownChecker();

  var hint = document.querySelector("#allocHint");
  hint.style.display = "none";
  var hints = [];
  if (result.targetMissing) hints.push("目标占比未设置，请先在资产页设置目标占比。");
  if (!result.emergency.full) hints.push("先打地基：应急罐还差 " + money(result.emergency.gap) + " 元，预计 " + result.emergency.monthsToFull + " 个月存满；存满之前其他步骤跳过。");
  if (result.cashflowAvailable <= 0) hints.push("本月现金流不足，建议先不投资，保留现金。");
  else if (result.targetSaving > result.cashflowAvailable) hints.push("本月现金流限制，实际建议投资低于目标储蓄。");
  if (result.study.enabled) {
    if (result.study.needsGoal) hints.push("读书基金已启用但目标金额是 0：请先填目标，本月不扣款（否则永远不会自动停止）。");
    else if (result.study.stopped) hints.push("读书基金已达目标，这一步自动停止，剩余金额进投资组合。");
    else if (result.study.amount > 0) hints.push("读书基金本月 " + money(result.study.amount) + "（比例 " + result.study.ratioPct + "%），优先用美元存。");
  } else {
    hints.push("读书基金默认关闭，这一步跳过。");
  }
  if (inputs.minCommission5 && result.emergency.full && result.portfolioBudget > 0) hints.push("券商收最低 5 元：本月只推荐缺口最大的 1~2 只，单笔尽量不少于 3000 元。");
  if (result.waitingFromPremium > 0) hints.push("本月有 " + money(result.waitingFromPremium) + " 因溢价进等候罐。");
  if (result.waitingFromSuspended > 0) hints.push("有 " + money(result.waitingFromSuspended) + " 因产品暂停申购或手动暂停进等候罐（不再分给其他产品）。");
  if (result.expat) hints.push(result.expat.note);
  if (result.useCorrection && result.allocatedTotal === 0 && result.investBase > 0) hints.push("当前配置无优先补仓项，本月建议保留现金。原始建议投资额度：" + money(result.investBase));
  if (result.speculativePaused) hints.push("投机层已达到或超过 " + pct(speculativeCap()) + "，本月自动暂停给投机层分配新资金。");
  // 外派模式里「补弹药罐 / 建议结汇」的钱不算未分配现金，先从差额里扣掉再判断
  var unallocatedCash = result.investBase - result.allocatedTotal;
  if (result.expat) unallocatedCash = Math.max(unallocatedCash - numberValue(result.expat.ammoTopUp) - numberValue(result.expat.suggestConvert), 0);
  if (unallocatedCash > 1) hints.push("部分产品暂停或转入等候罐，未分配金额保留现金。原始建议投资额度：" + money(result.investBase));
  if (hints.length) {
    hint.style.display = "block";
    hint.innerHTML = hints.map(function (t) { return '<div class="tip">' + esc(t) + "</div>"; }).join("");
  }

  renderAllocLayers(result);
}

function renderAllocationChecklist(result) {
  var wrap = document.querySelector("#allocChecklist");
  if (!wrap) return;
  var inputs = result.inputs;
  var rows = [
    { label: "固定支出账户", value: money(inputs.expense), note: "房租、订阅、保险等" },
    { label: "机动预留", value: money(inputs.reserve), note: "聚餐、人情、交通等" },
    { label: "应急罐", value: money(result.emergency.amount), note: result.emergency.full ? "已满" : "先打地基" },
    { label: "读书基金", value: money(result.study.amount), note: result.study.enabled ? "启用中" : "默认关闭" },
    { label: "本月计划投资", value: money(result.allocatedTotal), note: "计划，不是执行" },
    { label: "剩余现金", value: money(result.actualRemainingCash), note: result.waitingFromPremium > 0 ? "含等候罐 " + money(result.waitingFromPremium) : "保留现金" },
  ];
  wrap.innerHTML = '<div class="checklist-title">工资到账后操作清单</div><div class="checklist-grid">' +
    rows.map(function (r, index) {
      return '<div class="checklist-item' + (index === 4 ? " primary" : "") + '"><span>' + esc(r.label) + "</span><strong>" +
        esc(r.value) + "</strong><small>" + esc(r.note) + "</small></div>";
    }).join("") + "</div>";
}

// ---- 回撤检查器（任务 7）----
// 弹药罐 = 投资组合里的现金层（货币基金）市值；1 份 = 弹药罐余额 ÷ 3，三档正好用完。
function drawdownAmmo() {
  return investmentAssets()
    .filter(function (a) { return a.layer === "现金层" && isAvailableAsset(a); })
    .reduce(function (s, a) { return s + numberValue(a.value); }, 0);
}

function drawdownInputs(assetId) {
  var store = (data.settings && data.settings.drawdownInputs) || {};
  var row = store[assetId] || {};
  return { high: numberValue(row.high), price: numberValue(row.price) || numberValue(row.current) };
}

function drawdownDone(assetId, pct) {
  var store = (data.settings && data.settings.drawdownDone) || {};
  return Boolean(store[assetId + "_" + pct]);
}

function calcDrawdownPlan() {
  var ammo = drawdownAmmo();
  var unit = Math.floor(ammo / 3);
  var total = totals();
  var items = [];
  DRAWDOWN_RULES.forEach(function (rule) {
    var asset = data.assets.find(function (a) { return a.id === rule.assetId; });
    if (!asset) return;
    var input = drawdownInputs(rule.assetId);
    var dropPct = input.high > 0 && input.price > 0 ? ((input.high - input.price) / input.high) * 100 : NaN;
    var hitIndex = -1;
    if (Number.isFinite(dropPct)) {
      rule.triggers.forEach(function (trigger, index) { if (dropPct >= trigger.pct) hitIndex = index; });
    }
    var trigger = hitIndex >= 0 ? rule.triggers[hitIndex] : null;
    var specCapNow = speculativeCap();
    var blocked = asset.layer === "投机层" && specCapNow > 0 && total.specRatio >= specCapNow;
    var executed = trigger ? drawdownDone(rule.assetId, trigger.pct) : false;
    items.push({
      assetId: rule.assetId,
      name: rule.name || asset.name,
      assetName: asset.name,
      high: input.high,
      price: input.price,
      dropPct: dropPct,
      hitIndex: hitIndex,
      trigger: trigger,
      units: trigger ? trigger.units : 0,
      amount: trigger ? Math.round(unit * trigger.units) : 0,
      blocked: blocked,
      executed: executed,
      reason: blocked ? "投机层已达 " + pct(specCapNow) + "，这一档不买" : (executed ? "这一档已执行过，同一档不重复提示" : ""),
    });
  });
  return { ammo: ammo, unit: unit, items: items, specRatio: total.specRatio };
}

function drawdownHitText(item) {
  if (!Number.isFinite(item.dropPct)) return "填入 52 周最高价与现价后自动计算";
  if (item.hitIndex < 0) return "未到第 1 档（-" + item.dropPct.toFixed(1) + "%）";
  return "第 " + (item.hitIndex + 1) + " 档（-" + item.dropPct.toFixed(1) + "%）";
}

function drawdownActionText(item) {
  if (!item.trigger) return "—";
  if (item.blocked) return item.reason;
  if (item.executed) return "这一档已执行过";
  return "转 " + item.units + " 份 = " + money(item.amount);
}

// 只就地刷新结果单元格：不动输入框，避免把用户正在填的另一个价格冲掉
function refreshDrawdownResults() {
  var wrap = document.querySelector("#opportunityChecker");
  if (!wrap) return;
  var plan = calcDrawdownPlan();
  var metrics = wrap.querySelector(".opportunity-metrics");
  if (metrics) {
    metrics.innerHTML =
      "<div><span>弹药罐余额</span><strong>" + money(plan.ammo) + "</strong><small>投资组合里的现金层</small></div>" +
      "<div><span>1 份 =</span><strong>" + money(plan.unit) + "</strong><small>弹药罐余额 ÷ 3，三档正好用完</small></div>";
  }
  plan.items.forEach(function (item) {
    var row = null;
    wrap.querySelectorAll(".drawdown-row").forEach(function (el) {
      if (el.getAttribute("data-dd-row") === item.assetId) row = el;
    });
    if (!row) return;
    var hitEl = row.querySelector(".drawdown-hit");
    if (hitEl) hitEl.textContent = drawdownHitText(item);
    var doneEl = row.querySelector(".drawdown-done");
    if (doneEl) {
      var doneBox = item.trigger
        ? '<label class="drawdown-done-box"><input type="checkbox" data-dd-done="' + esc(item.assetId + "_" + item.trigger.pct) + '"' + (item.executed ? " checked" : "") + ">已执行</label>"
        : "";
      doneEl.innerHTML = esc(drawdownActionText(item)) + doneBox;
      var box = doneEl.querySelector("input[data-dd-done]");
      if (box) box.addEventListener("change", onDrawdownDoneChange);
    }
  });
}

function onDrawdownDoneChange(event) {
  var input = event.currentTarget;
  var key = input.getAttribute("data-dd-done");
  if (!data.settings) data.settings = {};
  if (!isPlainRecord(data.settings.drawdownDone)) data.settings.drawdownDone = {};
  if (input.checked) data.settings.drawdownDone[key] = true;
  else delete data.settings.drawdownDone[key];
  if (!saveData()) return;
  refreshDrawdownResults();
}

function onDrawdownInputChange(event) {
  var input = event.currentTarget;
  var id = input.getAttribute("data-dd-id");
  var field = input.getAttribute("data-dd-field");
  var value = parseFloat(input.value);
  if (!data.settings) data.settings = {};
  if (!isPlainRecord(data.settings.drawdownInputs)) data.settings.drawdownInputs = {};
  if (!isPlainRecord(data.settings.drawdownInputs[id])) data.settings.drawdownInputs[id] = {};
  data.settings.drawdownInputs[id][field] = Number.isFinite(value) ? value : 0;
  if (!saveData()) return;
  refreshDrawdownResults();
}

function renderDrawdownChecker() {
  var wrap = document.querySelector("#opportunityChecker");
  if (!wrap) return;
  var panel = wrap.querySelector(".opportunity-panel");
  var keepOpen = !!(panel && panel.open);
  var plan = calcDrawdownPlan();
  var rows = plan.items.map(function (item) {
    var doneBox = item.trigger
      ? '<label class="drawdown-done-box"><input type="checkbox" data-dd-done="' + esc(item.assetId + "_" + item.trigger.pct) + '"' + (item.executed ? " checked" : "") + ">已执行</label>"
      : "";
    return '<div class="drawdown-row' + (item.blocked ? " blocked" : "") + '" data-dd-row="' + esc(item.assetId) + '">' +
      '<div class="drawdown-name"><b>' + esc(item.name) + "</b><small>" + esc(item.assetName) + "</small></div>" +
      '<label class="drawdown-input">52 周最高<input type="number" step="0.001" data-dd-id="' + esc(item.assetId) + '" data-dd-field="high" value="' + (item.high || "") + '" placeholder="—"></label>' +
      '<label class="drawdown-input">现价<input type="number" step="0.001" data-dd-id="' + esc(item.assetId) + '" data-dd-field="price" value="' + (item.price || "") + '" placeholder="—"></label>' +
      '<div class="drawdown-hit">' + esc(drawdownHitText(item)) + "</div>" +
      '<div class="drawdown-done">' + esc(drawdownActionText(item)) + doneBox + "</div>" +
    "</div>";
  }).join("");
  wrap.innerHTML =
    '<details class="opportunity-panel"' + (keepOpen ? " open" : "") + ">" +
      "<summary><span>回撤检查器：填 52 周最高价和现价</span><small>只在明显回撤时打开</small></summary>" +
      '<div class="opportunity-metrics">' +
        "<div><span>弹药罐余额</span><strong>" + money(plan.ammo) + "</strong><small>投资组合里的现金层</small></div>" +
        "<div><span>1 份 =</span><strong>" + money(plan.unit) + "</strong><small>弹药罐余额 ÷ 3，三档正好用完</small></div>" +
      "</div>" +
      '<div class="opportunity-note">回撤 = 从 52 周最高收盘价算起的跌幅，券商 App 里能直接看到。App 不接行情，只按你填的数字算；已执行过的档位可以打勾，同一档不重复提示。</div>' +
      '<div class="drawdown-panel">' + rows + "</div>" +
    "</details>";
  wrap.querySelectorAll("input[data-dd-id]").forEach(function (input) {
    input.addEventListener("change", onDrawdownInputChange);
  });
  wrap.querySelectorAll("input[data-dd-done]").forEach(function (input) {
    input.addEventListener("change", onDrawdownDoneChange);
  });
}

function saveAllocation() {
  var inputs = getAllocInputs();
  if (inputs.income <= 0 && !(inputs.expat && inputs.usdIncome > 0)) {
    alert("请先填写月收入");
    return;
  }
  var result = calcAllocation(inputs);
  var now = new Date();
  var currentKey = now.getFullYear() + "/" + (now.getMonth() + 1);
  var currentMonth = data.monthly.find(function (m) { return m.month === currentKey; });

  var effectiveMode = allocState.mode;
  if (allocState.mode === "修正" && result.totalAssets === 0) effectiveMode = "标准";

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
      channel: p.channel || "",
      currency: p.currency || "CNY",
      premium: Number.isFinite(p.premium) ? p.premium : null,
      premiumWaiting: p.premiumWaiting || 0,
      gapAmount: p.gapAmount || 0,
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
      emergencyAmount: result.emergency.amount,
      emergencyGoal: result.emergency.goal,
      emergencyFull: result.emergency.full,
      studyAmount: result.study.amount,
      studyEnabled: result.study.enabled,
      portfolioBudget: result.portfolioBudget,
      waitingFromPremium: result.waitingFromPremium,
      speculativeRatio: result.speculativeRatio,
      speculativePaused: result.speculativePaused,
      expat: result.expat ? {
        fxRate: result.expat.fxRate,
        usdPool: result.expat.usdPool,
        usdAllocated: result.expat.usdAllocated,
        usdLeftover: result.expat.usdLeftover,
        ammoTopUp: result.expat.ammoTopUp,
        suggestConvert: result.expat.suggestConvert,
      } : null,
    },
    allocationMode: allocState.mode,
    effectiveAllocationMode: effectiveMode,
    reserve: inputs.reserve,
    savingRate: inputs.savingRatePct / 100,
    usdIncome: inputs.expat ? inputs.usdIncome : 0,
    fxRate: inputs.fxRate,
    allocationNote: "本月计划投资 " + money(result.allocatedTotal) + "，储蓄率 " + inputs.savingRatePct + "%，模式：" + effectiveMode,
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

  if (!saveData()) return false;
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
    switchView("monthly");
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
  [incomeEl, expenseEl, reserveEl, savingRateEl,
    document.querySelector("#allocUsdIncome"),
    document.querySelector("#allocFxRate"),
    document.querySelector("#allocStudyRatio")].forEach(function (el) {
    if (el) el.addEventListener("input", scheduleAllocRebuild);
  });

  var expatEl = document.querySelector("#allocExpatToggle");
  if (expatEl) {
    expatEl.checked = Boolean(data.settings && data.settings.expatMode);
    expatEl.addEventListener("change", function () {
      if (!data.settings) data.settings = {};
      data.settings.expatMode = expatEl.checked;
      if (!saveData()) return;
      render();
    });
  }

  var minCommEl = document.querySelector("#allocMinCommToggle");
  if (minCommEl) {
    minCommEl.checked = !(data.settings && data.settings.minCommission5 === false);
    minCommEl.addEventListener("change", function () {
      if (!data.settings) data.settings = {};
      data.settings.minCommission5 = minCommEl.checked;
      if (!saveData()) return;
      refreshAllocation();
    });
  }

  var studyToggle = document.querySelector("#allocStudyToggle");
  if (studyToggle) {
    studyToggle.checked = studyFundEnabled();
    studyToggle.addEventListener("change", function () {
      if (!data.settings) data.settings = {};
      data.settings.studyFundEnabled = studyToggle.checked;
      if (!saveData()) return;
      render();
    });
  }

  var studyRatioInput = document.querySelector("#allocStudyRatio");
  if (studyRatioInput) {
    studyRatioInput.value = studyFundRatioPct();
    studyRatioInput.addEventListener("change", function () {
      if (!data.settings) data.settings = {};
      data.settings.studyFundRatio = clamp(numberValue(studyRatioInput.value), 0, 50);
      if (!saveData()) return;
      refreshAllocation();
    });
  }

  var allocFxInput = document.querySelector("#allocFxRate");
  if (allocFxInput) {
    allocFxInput.value = fxRate();
    allocFxInput.addEventListener("change", function () {
      var value = parseFloat(allocFxInput.value);
      if (!Number.isFinite(value) || value <= 0) return;
      if (!data.settings) data.settings = {};
      data.settings.fxRate = value;
      if (!saveData()) return;
      render();
    });
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

  // FIRE 输入：input 只重算；change 写回 settings.fire（落盘 + 随同步走）
  Object.keys(FIRE_INPUT_MAP).forEach(function (selector) {
    var input = document.querySelector(selector);
    if (!input) return;
    input.addEventListener("input", renderFire);
    input.addEventListener("change", saveFireSettings);
  });

  var returnHomeEl = document.querySelector("#fireReturnHome");
  var returnYearsEl = document.querySelector("#fireReturnYears");
  var syncReturnYears = function () {
    if (returnYearsEl) returnYearsEl.disabled = !(returnHomeEl && returnHomeEl.checked);
  };
  if (returnHomeEl) {
    returnHomeEl.addEventListener("change", function () {
      syncReturnYears();
      saveFireSettings();
    });
    syncReturnYears();
  }
  syncFireInputs();

  var linkToggle = document.querySelector("#linkInvestToggle");
  if (linkToggle) {
    linkToggle.addEventListener("change", function () {
      if (!data.settings) data.settings = {};
      data.settings.linkInvestEntry = linkToggle.checked;
      if (!saveData()) render();
    });
  }

  renderTripChecklist();
});

function fieldsToHtml(fields, values) {
  return fields.map((field) => {
    const value = values[field.key] ?? "";
    const safeKey = esc(field.key);
    const safeLabel = esc(field.label);
    const safeValue = esc(value);
    const hintHtml = field.hint ? `<small class="field-hint">${esc(field.hint)}</small>` : "";
    if (field.type === "select") {
      return `<div class="field"><label>${safeLabel}</label><select name="${safeKey}">
        ${field.options.map((o) => {
          const optionValue = typeof o === "object" ? o.value : o;
          const optionLabel = typeof o === "object" ? o.label : o;
          return `<option value="${esc(optionValue)}" ${String(optionValue) === String(value) ? "selected" : ""}>${esc(optionLabel)}</option>`;
        }).join("")}
      </select>${hintHtml}</div>`;
    }
    if (field.type === "textarea") {
      return `<div class="field wide"><label>${safeLabel}</label><textarea name="${safeKey}" rows="3">${safeValue}</textarea>${hintHtml}</div>`;
    }
    const readonlyAttr = field.readonly ? ' readonly style="background:#f9fafb;color:#9ca3af"' : "";
    const isNumber = field.type === "number";
    const stepAttr = isNumber ? ' step="0.01"' : "";
    const inputType = isNumber ? "number" : esc(field.type || "text");
    let listAttr = "";
    let datalistHtml = "";
    if (Array.isArray(field.datalist) && field.datalist.length) {
      const listId = "dl-" + safeKey;
      listAttr = ` list="${listId}" autocomplete="off"`;
      const seen = {};
      const opts = field.datalist
        .map((o) => String(o == null ? "" : o).trim())
        .filter((o) => o && !seen[o] && (seen[o] = true))
        .map((o) => `<option value="${esc(o)}"></option>`)
        .join("");
      datalistHtml = `<datalist id="${listId}">${opts}</datalist>`;
    }
    return `<div class="field"><label>${safeLabel}</label><input name="${safeKey}" type="${inputType}"${stepAttr} value="${safeValue}"${listAttr}${readonlyAttr}>${datalistHtml}${hintHtml}</div>`;
  }).join("");
}

function openEditor(config) {
  editing = config;
  document.querySelector("#dialogTitle").textContent = config.title;
  document.querySelector("#dialogFields").innerHTML = fieldsToHtml(config.fields, config.item);
  document.querySelector("#deleteBtn").style.visibility = config.isNew ? "hidden" : "visible";
  document.querySelector("#editorDialog").showModal();
  // 新建记一笔时聚焦金额框，省一次点击
  if (config.isNew && config.focusKey) {
    const target = document.querySelector(`#dialogFields [name="${config.focusKey}"]`);
    if (target) {
      target.focus();
      if (typeof target.select === "function") target.select();
    }
  }
}

function openAssetEditor(id) {
  const isNew = !id;
  const raw = isNew ? {
    id: crypto.randomUUID(), layer: "现金层", element: "水", name: "", type: "", target: 0.05,
    value: 0, valueUsd: 0, cost: 0, updated: today(), note: "", status: "available", jar: "investment",
    code: "", feePct: 0, channel: "场外", buyStatus: "正常", buyStatusChecked: "", waitingSince: "",
  } : data.assets.find((x) => x.id === id);
  const item = { ...raw, target: Math.round(numberValue(raw.target) * 100), status: raw.status || "available" };
  openEditor({
    title: isNew ? "新增资产" : "编辑资产",
    isNew,
    item,
    collection: "assets",
    fields: [
      { key: "name", label: "产品名称" },
      { key: "jar", label: "属于哪个罐子", type: "select", options: [
        { value: "investment", label: "投资组合" },
        { value: "emergency", label: "应急罐" },
        { value: "study", label: "读书基金" },
        { value: "waiting", label: "等候罐" },
      ], hint: "只有「投资组合」参与比例、偏离度和分配计算" },
      { key: "layer", label: "层级", type: "select", options: ["现金层", "防御层", "生财层", "成长层", "投机层", "罐子"] },
      { key: "element", label: "五行", type: "select", options: ["金", "水", "土", "火", "木", "金水", ""] },
      { key: "type", label: "产品类型" },
      { key: "target", label: "目标占比（%）", type: "number", pctInput: true },
      { key: "code", label: "产品代码" },
      { key: "feePct", label: "年费率（%）", type: "number" },
      { key: "channel", label: "在哪买", type: "select", options: ["场内", "场外", "看溢价", ""] },
      { key: "buyStatus", label: "能不能买", type: "select", options: ["正常", "限购", "暂停申购", "溢价过高"] },
      { key: "buyStatusChecked", label: "上次检查日期", type: "date" },
      { key: "status", label: "状态", type: "select", options: ["available", "paused:manual"], hint: "available=正常；paused:manual=手动暂停，本月额度进等候罐（旧 buffered 暂存机制已在 v8.1 并入「能不能买=暂停申购」）" },
      { key: "value", label: "当前市值（人民币）", type: "number" },
      { key: "valueUsd", label: "当前市值（美元，读书基金/等候罐用）", type: "number" },
      { key: "waitingSince", label: "等候罐开始等待的月份（如 2026/12）" },
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
  // 投机层占比：按资产页当前持仓实时计算，只读展示，无需手填
  const specRatioDisplay = pct(totals().specRatio);
  const item = { ...raw, _savingRateDisplay: savingRateDisplay, _specRatioDisplay: specRatioDisplay };
  openEditor({
    title: isNew ? "新增月份" : "编辑月度复盘",
    isNew,
    item,
    collection: "monthly",
    fields: [
      { key: "month", label: "月份（如 2026/6）" },
      { key: "income", label: "月收入", type: "number" },
      { key: "expense", label: "月固定支出", type: "number" },
      { key: "invested", label: "实际投入", type: "number", hint: "记一笔里的「投资」会自动累加到这里，一般不用手填" },
      { key: "_savingRateDisplay", label: "储蓄率（%，自动计算，不用填）", type: "text", readonly: true },
      { key: "monthEndAssets", label: "月末总资产", type: "number" },
      { key: "_specRatioDisplay", label: "投机层占比", type: "text", readonly: true, hint: "按资产页当前持仓自动计算，不用填" },
      { key: "note", label: "备注", type: "textarea" },
    ],
  });
}

function openEntryEditor(id) {
  const isNew = !id;
  let lastKind = "投资";
  try { lastKind = localStorage.getItem(LAST_KIND_KEY) || lastKind; } catch { /* Optional preference only. */ }
  const item = isNew
    ? { id: crypto.randomUUID(), date: today(), kind: lastKind, amount: 0, target: "", channel: "", note: "" }
    : data.entries.find((x) => x.id === id);
  // 去向候选：资产名（投资优先选这些）+ 历史用过的去向；渠道候选：历史用过的渠道
  const assetNames = data.assets.map((a) => a.name).filter(Boolean);
  const pastTargets = data.entries.map((e) => e.target).filter(Boolean);
  const pastChannels = data.entries.map((e) => e.channel).filter(Boolean);
  openEditor({
    title: isNew ? "记一笔" : "编辑记录",
    isNew,
    item,
    collection: "entries",
    focusKey: "amount",
    fields: [
      { key: "date", label: "日期", type: "date" },
      { key: "kind", label: "类型", type: "select", options: ["收入", "投资", "消费", "转账", "其他"] },
      { key: "amount", label: "金额", type: "number" },
      { key: "target", label: "去向/产品（投资选资产名可自动联动）", datalist: assetNames.concat(pastTargets) },
      { key: "channel", label: "渠道", datalist: pastChannels },
      { key: "note", label: "备注", type: "textarea" },
    ],
  });
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}/${d.getMonth() + 1}`;
}

function currentMonthRecord() {
  return data.monthly.find(function (m) { return m.month === currentMonth(); });
}

function hasAllocationPlan(month) {
  return !!(month && Array.isArray(month.allocationPlan) && month.allocationPlan.length > 0);
}

// 弹药罐 = 投资组合里的现金层（货币基金），见 drawdownAmmo()

function isUpdatedThisMonth(dateText) {
  var d = String(dateText || "").slice(0, 10);
  if (!d) return false;
  var now = new Date();
  var prefix = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  return d.indexOf(prefix) === 0;
}

function switchView(viewName) {
  var btn = document.querySelector('.tab[data-view="' + viewName + '"]');
  var view = document.querySelector("#" + viewName);
  if (!btn || !view) return;
  document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  btn.classList.add("active");
  view.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function actionItem(label, detail, viewName, buttonText) {
  return { label: label, detail: detail, viewName: viewName, buttonText: buttonText || "去处理" };
}

// 各层实际占比与目标的偏离（任务 5）
function layerDeviations() {
  // 只算还留在方案里的资产（target > 0）：迁移保留的已移除产品不该影响修剪建议
  var items = investmentAssets().filter(function (a) { return numberValue(a.target) > 0; });
  var total = items.reduce(function (s, a) { return s + numberValue(a.value); }, 0);
  if (total <= 0) return [];
  return V8_LAYERS.map(function (layer) {
    var value = items.filter(function (a) { return a.layer === layer.name; })
      .reduce(function (s, a) { return s + numberValue(a.value); }, 0);
    var ratio = value / total;
    return {
      name: layer.name,
      label: layer.label,
      target: layer.target,
      cap: layer.cap,
      ratio: ratio,
      gap: ratio - layer.target,
      amount: Math.round(Math.abs(ratio - layer.target) * total),
    };
  }).filter(function (d) { return d.target > 0; });
}

// 建仓期：组合市值还不到「12 个月的计划投入」，或者开始记账还不到 6 个月。
// 每月只买 1~2 只时偏离一定很大，这时候提示偏离只是噪音。
function buildingPhase() {
  var nowIdx = monthIndex(currentMonth());
  var activeIdx = [];
  var plans = [];
  data.monthly.forEach(function (m) {
    var idx = monthIndex(m.month);
    if (!Number.isFinite(idx) || idx > nowIdx) return;
    var plan = numberValue(m.invested) || numberValue(m.plannedInvested);
    if (numberValue(m.income) > 0 || numberValue(m.expense) > 0 || plan > 0 || numberValue(m.monthEndAssets) > 0) activeIdx.push(idx);
    if (plan > 0) plans.push(plan);
  });
  if (activeIdx.length) {
    var first = Math.min.apply(null, activeIdx);
    if (nowIdx - first + 1 < 6) return true;
  }
  if (plans.length) {
    var avg = plans.reduce(function (s, v) { return s + v; }, 0) / plans.length;
    if (avg > 0 && portfolioValue() < avg * 12) return true;
  }
  return false;
}

// 再平衡（修剪）提醒：只有每年 1 月做年度修剪（卖多买少）；其余时间不出任何卖出建议，
// 层偏低超过 5 个百分点最多提示「下次发薪按分配页补这一层」，不给金额；
// 建仓期不提示偏离；投机层 / 单品硬上限任何月份都提醒。
function rebalanceAdvice() {
  var out = [];
  var now = new Date();
  var isJanuary = now.getMonth() === 0;
  if (isJanuary) {
    out.push({ label: "年度复盘：修剪 + 按汇率重算 FIRE", detail: "每年 1 月做一次：哪一层偏离目标超过 5 个百分点就卖多买少，并按当年汇率重算 FIRE。", view: "rules", button: "看规则" });
  }
  var deviations = layerDeviations();
  if (!buildingPhase()) {
    deviations.forEach(function (d) {
      if (d.cap && d.ratio > d.cap) return; // 硬上限由下面单独提醒
      if (d.gap > 0.05) {
        if (isJanuary) out.push({ label: d.label + "层偏高 " + pct(d.gap) + "，建议修剪", detail: "卖出约 " + money(d.amount) + "，调回目标 " + pct(d.target) + "。", view: "assets", button: "去资产" });
        return; // 其余月份不出卖出建议
      }
      if (d.gap < -0.05) {
        if (isJanuary) out.push({ label: d.label + "层偏低 " + pct(-d.gap) + "，建议补回", detail: "买入约 " + money(d.amount) + "，调回目标 " + pct(d.target) + "。", view: "assets", button: "去资产" });
        else out.push({ label: d.label + "层偏低 " + pct(-d.gap), detail: "下次发薪按分配页补这一层，本月不做卖出。", view: "allocate", button: "去分配" });
      }
    });
  }
  var spec = deviations.find(function (d) { return d.name === "投机层"; });
  var cap = speculativeCap();
  if (spec && cap > 0 && spec.ratio > cap) {
    var sellAmount = Math.round((spec.ratio - cap) * totals().value);
    out.push({ label: "投机层超过上限，卖回 " + pct(cap), detail: "当前 " + pct(spec.ratio) + "，卖出约 " + money(sellAmount) + " 把投机层调回 " + pct(cap) + "。", view: "assets", button: "去资产" });
  }
  return out;
}

function buildTodayActions() {
  var month = currentMonthRecord();
  var t = totals();
  var goal = emergencyGoal();
  var now = new Date();
  var actions = [];

  // 任务 9：首次使用引导（所有资产都是 0 时）
  if (t.grandTotal <= 0) {
    actions.push(actionItem("第 1 步：在「资产」页的应急罐里填入已有金额", "应急罐默认已经存在，先把救命钱记下来，其他都往后放。", "assets", "去资产"));
    actions.push(actionItem("第 2 步：在「分配」页填本月收入和支出", "工资到账后先生成本月分配计划。", "allocate", "去分配"));
    actions.push(actionItem("第 3 步：每月发薪日回来，按分配结果执行", "发薪日即投资日；买入后到「随手记」记一笔。", "ledger", "去随手记"));
    return actions.slice(0, 6);
  }

  // 任务 5：修剪/再平衡提醒（平时不显示任何买卖建议）
  rebalanceAdvice().forEach(function (item) {
    actions.push(actionItem(item.label, item.detail, item.view, item.button || "去处理"));
  });

  if (!hasAllocationPlan(month)) {
    actions.push(actionItem("本月计划未保存", "工资到账后先生成本月分配计划。", "allocate", "去分配"));
  } else if (numberValue(month && month.plannedInvested) > 0 && numberValue(month && month.invested) <= 0) {
    actions.push(actionItem("计划已保存，买入后记得去随手记", "计划不等于执行，真实买入后再记录。", "ledger", "去随手记"));
  }

  if (now.getDate() >= 25 && (!month || numberValue(month.monthEndAssets) <= 0 || !investmentAssets().some(function (a) { return isUpdatedThisMonth(a.updated); }))) {
    actions.push(actionItem("月底记得更新市值", "每月 25 号后对照账户批量更新资产市值。", "assets", "去资产"));
  }

  if (emergencyValue() < goal) {
    actions.push(actionItem("应急罐没满，本月优先补满", "先打地基：还差 " + money(goal - emergencyValue()) + "，存满之前其他步骤跳过。", "allocate", "去分配"));
  }

  if (!actions.length) {
    actions.push(actionItem("今天没有必须处理的动作", "保持月度节奏，别为了操作而操作。", "rules", "看纪律"));
  }

  return actions.slice(0, 6);
}

function renderTodayActions() {
  var wrap = document.querySelector("#todayActions");
  if (!wrap) return;
  var actions = buildTodayActions();
  wrap.innerHTML = actions.map(function (item) {
    return '<div class="today-action">' +
      '<div><b>' + esc(item.label) + '</b><small>' + esc(item.detail) + '</small></div>' +
      '<button type="button" class="ghost-btn action-jump" data-view="' + esc(item.viewName) + '">' + esc(item.buttonText) + '</button>' +
    '</div>';
  }).join("");
  wrap.querySelectorAll(".action-jump").forEach(function (btn) {
    btn.addEventListener("click", function () { switchView(btn.getAttribute("data-view")); });
  });
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchView(btn.dataset.view);
  });
});

document.querySelector("#expandRulesBtn")?.addEventListener("click", function () {
  document.querySelectorAll(".rule-section").forEach(function (section) { section.open = true; });
});

document.querySelector("#collapseRulesBtn")?.addEventListener("click", function () {
  document.querySelectorAll(".rule-section").forEach(function (section) { section.open = false; });
});

document.querySelector("#copyOnboardingBtn")?.addEventListener("click", async function () {
  var text = document.querySelector("#onboardingChecklist")?.innerText || "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast("入职后回填清单已复制");
  } catch {
    toast("浏览器禁止自动复制，请手动选中清单复制");
  }
});

document.querySelector("#addAssetBtn").addEventListener("click", () => openAssetEditor());
document.querySelector("#addMonthBtn").addEventListener("click", () => openMonthEditor());
document.querySelector("#addEntryBtn").addEventListener("click", () => openEntryEditor());
document.querySelector("#updateMarketBtn")?.addEventListener("click", () => openMarketValueEditor());
document.querySelector("#marketValueForm")?.addEventListener("submit", (event) => {
  if (event.submitter && event.submitter.value === "save") {
    event.preventDefault();
    if (saveMarketValues()) document.querySelector("#marketValueDialog")?.close();
  }
});

document.querySelector("#applyHalfFireBtn")?.addEventListener("click", () => {
  if (!confirm("套用 v8.2 配置：按新方案更新资产的目标占比、层级、产品代码、费率和罐子归属。\n\n建议先点右上角「导出」保存 JSON 备份。\n\n• 不会改动当前市值 / 累计投入 / 更新日期 / 备注\n• 「能不能买」和你手动设的「状态」（手动暂停）都按现在的保留，不会被重置\n• id 或名称匹配的产品就地更新；新增的会创建\n• 不在新方案里的产品会保留但目标设为 0（你可以手动删除或调整）\n• 应急罐 / 读书基金 / 等候罐会补齐，已有金额不动\n\n确定继续吗？")) return;
  var byId = {};
  var byName = {};
  data.assets.forEach(function (a) { byId[a.id] = a; byName[a.name] = a; });
  var nextAssets = [];
  V8_PRODUCTS.forEach(function (row) {
    var existing = byId[row.id] || byName[row.name];
    if (existing) {
      // v8.2：只更新比例 / 层级 / 代码 / 费率 / 罐子归属；「能不能买」和手动暂停状态按用户现在的设置保留
      nextAssets.push(Object.assign({}, existing, {
        layer: row.layer, element: row.element, name: row.name, type: row.type, target: row.target,
        status: existing.status === "paused:manual" ? "paused:manual" : "available",
        jar: "investment", code: row.code, feePct: row.feePct,
        channel: row.channel, buyStatus: existing.buyStatus || "正常",
        bufferDestinationId: "", bufferDestination: "",
      }));
      delete byId[existing.id];
      delete byName[existing.name];
    } else {
      nextAssets.push(makeProductAsset(row));
    }
  });
  Object.keys(byId).forEach(function (id) {
    var orphan = byId[id];
    if (V8_NON_INVEST_JARS.indexOf(assetJar(orphan)) >= 0) {
      nextAssets.push(orphan);
      return;
    }
    nextAssets.push(Object.assign({}, orphan, {
      target: 0, status: orphan.status === "paused:manual" ? "paused:manual" : "available", bufferDestinationId: "", bufferDestination: "",
      note: (orphan.note ? orphan.note + "｜" : "") + "已不在 v8.2 方案，建议清仓后删除",
    }));
  });
  ["emergency", "study", "waiting"].forEach(function (jar) {
    if (!nextAssets.some(function (a) { return assetJar(a) === jar; })) nextAssets.push(makeJarAsset(jar));
  });
  data.assets = nextAssets;
  if (!saveData()) return;
  render();
  alert("v8.2 配置已套用。建议去「资产」Tab 检查每项的罐子、层级、目标占比和状态（「能不能买」按你原来的设置保留）。");
});

// 出海清单打勾（任务 6.4）：状态存 settings.tripChecklist，刷新页面后仍在
function renderTripChecklist() {
  var store = (data.settings && data.settings.tripChecklist) || {};
  document.querySelectorAll("input[data-trip-key]").forEach(function (input) {
    var key = input.getAttribute("data-trip-key");
    input.checked = Boolean(store[key]);
    var label = input.closest(".trip-item");
    if (label) label.classList.toggle("done", input.checked);
  });
}

document.querySelectorAll("input[data-trip-key]").forEach(function (input) {
  input.addEventListener("change", function () {
    var key = input.getAttribute("data-trip-key");
    if (!data.settings) data.settings = {};
    if (!isPlainRecord(data.settings.tripChecklist)) data.settings.tripChecklist = {};
    if (input.checked) data.settings.tripChecklist[key] = true;
    else delete data.settings.tripChecklist[key];
    if (!saveData()) return;
    renderTripChecklist();
  });
});

function refreshSyncDialog() {
  const codeEl = document.querySelector("#syncCodeText");
  const helpEl = document.querySelector("#syncHelp");
  if (!codeEl || !window.supabase) return;
  if (storageBlocked) {
    codeEl.value = "";
    if (helpEl) helpEl.textContent = storageErrorMessage;
    return;
  }
  const code = getSyncCodeSafely();
  if (!code) {
    codeEl.value = "";
    if (helpEl) helpEl.textContent = storageErrorMessage || "本机同步身份无法读取。";
    return;
  }
  codeEl.value = code;
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
  const help = document.querySelector("#syncHelp");
  if (storageBlocked) {
    help.textContent = storageErrorMessage;
    return;
  }
  if (syncSwitchInFlight || syncInFlight || syncPending) {
    help.textContent = "本机正在同步，请等同步完成后再切换同步码。";
    return;
  }
  const code = input.value.trim();
  if (!code) {
    document.querySelector("#syncHelp").textContent = "请先粘贴同步码。";
    return;
  }
  if (!confirm("会先读取并校验该同步码对应的云端账本，成功后替换本设备账本。建议先导出本机 JSON 备份。继续吗？")) return;
  const revisionAtStart = dataRevision;
  const dataAtStart = data;
  const syncCodeAtStart = getSyncCodeSafely();
  if (!syncCodeAtStart) {
    help.textContent = storageErrorMessage || "本机同步身份无法读取。";
    return;
  }
  syncSwitchInFlight = true;
  document.querySelector("#applySyncCodeBtn").disabled = true;
  document.querySelector("#resetSyncCodeBtn").disabled = true;
  help.textContent = "正在校验云端账本…";
  try {
    const record = await window.supabase.loadRecordForSyncCode(code);
    if (!record) throw new Error("该同步码尚无云端账本，请先在原设备完成同步。本机账本和同步码已保留。");
    validateCloudRecord(record);
    const nextData = normalizeData(record.data);
    if (dataRevision !== revisionAtStart || data !== dataAtStart || syncInFlight || syncPending || getSyncCodeSafely() !== syncCodeAtStart) {
      throw new Error("校验期间本机有改动或同步状态变化，请等同步完成后重试。本机账本和同步码已保留。");
    }
    fillMissingMonths(nextData);
    const nextMeta = { ...meta, updatedAt: record.updatedAt, lastSyncedAt: record.updatedAt, lastSyncError: "" };
    window.supabase.applySyncCode(code, [[STORAGE_KEY, JSON.stringify(nextData)], [META_KEY, JSON.stringify(nextMeta)]]);
    cancelQueuedSync();
    commitSyncCodeData(nextData, nextMeta);
    render();
    input.value = "";
    refreshSyncDialog();
    window.supabase.setStatus("online", `上次同步：${formatDateTime(meta.lastSyncedAt)}`);
    help.textContent = "同步码已导入，本设备已切换到已校验的云端账本。";
  } catch (error) {
    if (String(error && error.message || error).includes("回退未完成")) {
      blockStorage("本机存储回退未完成，账本已锁定。请勿继续编辑，并先检查浏览器存储。", error);
    }
    help.textContent = `导入失败：${error.message}`;
  } finally {
    syncSwitchInFlight = false;
    document.querySelector("#applySyncCodeBtn").disabled = false;
    document.querySelector("#resetSyncCodeBtn").disabled = false;
  }
});

document.querySelector("#resetSyncCodeBtn")?.addEventListener("click", async () => {
  if (storageBlocked) {
    document.querySelector("#syncHelp").textContent = storageErrorMessage;
    return;
  }
  if (syncSwitchInFlight || syncInFlight || syncPending) {
    document.querySelector("#syncHelp").textContent = "本机正在同步，请等同步完成后再生成新的同步码。";
    return;
  }
  if (!confirm("确定要生成新的同步身份吗？\n\n这会创建一套新的云端账本钥匙，旧设备不会自动跟随，新旧数据也不会自动合并。建议先导出当前 JSON 备份，再继续。")) return;
  const nextData = structuredClone(data);
  const nextMeta = { ...meta, updatedAt: new Date().toISOString(), lastSyncedAt: null, lastSyncError: "" };
  try {
    window.supabase.resetIdentity([[STORAGE_KEY, JSON.stringify(nextData)], [META_KEY, JSON.stringify(nextMeta)]]);
    cancelQueuedSync();
    commitSyncCodeData(nextData, nextMeta);
    refreshSyncDialog();
    document.querySelector("#syncHelp").textContent = "已生成新同步码并保存本机账本，正在同步云端。";
    void syncToCloud(makeSyncPayload());
  } catch (error) {
    if (String(error && error.message || error).includes("回退未完成")) {
      blockStorage("本机存储回退未完成，账本已锁定。请勿继续编辑，并先检查浏览器存储。", error);
    }
    document.querySelector("#syncHelp").textContent = `生成失败：${error.message}`;
  }
});

// ---- 投资记一笔 → 资产累计投入 / 月度实际投入 自动联动 ----
// 设计：每条投资 entry 用 linkedAssetId/linkedMonth/linkedAmount 记住"上次联动加了多少、加到哪"。
// Reverse and reapply links when accounting fields change; metadata-only edits preserve the saved link.

function isLinkEnabled() {
  return !(data.settings && data.settings.linkInvestEntry === false);
}

function monthKeyFromDate(dateStr) {
  // entry.date 形如 2026-06-07 → 月度 key "2026/6"
  var parts = String(dateStr || "").slice(0, 10).split("-");
  if (parts.length < 2) return currentMonth();
  var y = Number(parts[0]); var m = Number(parts[1]);
  if (!y || !m) return currentMonth();
  return y + "/" + m;
}

// 冲销一条投资 entry 之前造成的联动影响（按它记录的 linked* 字段回退）
function reverseEntryLink(entry) {
  if (!entry || !entry.linkedAmount) return;
  var amt = numberValue(entry.linkedAmount);
  if (amt === 0) return;
  if (entry.linkedAssetId) {
    var asset = data.assets.find(function (a) { return a.id === entry.linkedAssetId; });
    if (asset) asset.cost = Math.max(numberValue(asset.cost) - amt, 0);
  }
  if (entry.linkedMonth) {
    var month = data.monthly.find(function (m) { return m.month === entry.linkedMonth; });
    if (month) month.invested = Math.max(numberValue(month.invested) - amt, 0);
  }
  entry.linkedAssetId = "";
  entry.linkedMonth = "";
  entry.linkedAmount = 0;
}

function entryLinkFieldsChanged(original, updated) {
  if (!original) return false;
  return String(original.kind || "") !== String(updated.kind || "") ||
    String(original.date || "") !== String(updated.date || "") ||
    numberValue(original.amount) !== numberValue(updated.amount) ||
    String(original.target || "").trim() !== String(updated.target || "").trim();
}

// 应用一条投资 entry 的联动：把金额加到匹配资产的累计投入 + 当月实际投入，并在 entry 上记账
// 返回被联动的资产对象（用于市值快捷提示），无匹配资产返回 null
function applyEntryLink(entry, preferredAssetId) {
  entry.linkedAssetId = "";
  entry.linkedMonth = "";
  entry.linkedAmount = 0;
  if (!isLinkEnabled()) return null;
  if (String(entry.kind) !== "投资") return null;
  var amt = numberValue(entry.amount);
  if (amt <= 0) return null;
  // Prefer a remembered asset identity during edits; otherwise match by destination name.
  var asset = preferredAssetId
    ? data.assets.find(function (a) { return a.id === preferredAssetId; }) || null
    : data.assets.find(function (a) { return a.name && a.name === String(entry.target).trim(); }) || null;
  var monthKey = monthKeyFromDate(entry.date);
  var month = data.monthly.find(function (m) { return m.month === monthKey; });
  if (!month) {
    month = { id: crypto.randomUUID(), month: monthKey, income: 0, expense: 0, invested: 0, monthEndAssets: 0, specRatio: 0, note: "" };
    data.monthly.push(month);
  }
  month.invested = numberValue(month.invested) + amt;
  if (asset) asset.cost = numberValue(asset.cost) + amt;
  entry.linkedAssetId = asset ? asset.id : (preferredAssetId || "");
  entry.linkedMonth = monthKey;
  entry.linkedAmount = amt;
  return asset;
}

// 轻量提示条：底部浮现 2.4 秒后淡出，不打断操作
var toastTimer = null;
function toast(message) {
  var el = document.querySelector("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2400);
}

// 批量更新市值：列出所有资产，每行预填当前市值，对照券商一次性改完保存。
// 这是市值的正确更新时机——跟着"每月看一次账户"的仪式走，而不是跟着每笔买入。
function openMarketValueEditor() {
  var dlg = document.querySelector("#marketValueDialog");
  var listEl = document.querySelector("#mvList");
  if (!dlg || !listEl) return;
  if (!data.assets.length) {
    alert("还没有资产，先在资产页新增或套用配置。");
    return;
  }
  listEl.innerHTML = data.assets.map(function (a) {
    var jar = assetJar(a);
    var cost = numberValue(a.cost);
    var val = numberValue(a.value);
    var jarName = (V8_JARS.find(function (j) { return j.key === jar; }) || {}).name || "";
    var detail = jar === "investment"
      ? "累计投入 " + money(cost) + (val ? " · 现" + money(val) + ' <span class="' + (val - cost > 0 ? "mv-up" : val - cost < 0 ? "mv-down" : "") + '">' + (val - cost >= 0 ? "+" : "") + money(val - cost) + "</span>" : "")
      : esc(jarName) + (val || numberValue(a.valueUsd) ? " · 现" + money(val) : "");
    var usdRow = (jar === "study" || jar === "waiting")
      ? '<input class="mv-cell mv-usd" type="number" inputmode="decimal" step="0.01" data-usd-id="' + esc(a.id) + '" value="' + (numberValue(a.valueUsd) || "") + '" placeholder="美元">'
      : "";
    return '<div class="mv-row">' +
      '<div class="mv-name"><b>' + esc(a.name) + '</b><small>' + detail + '</small></div>' +
      '<input class="mv-cell" type="number" inputmode="decimal" step="0.01" data-asset-id="' + esc(a.id) + '" value="' + (val || "") + '" placeholder="0">' +
      usdRow +
    '</div>';
  }).join("");
  dlg.returnValue = "";
  dlg.showModal();
}

// 保存批量市值：把每行输入写回对应资产的 value/valueUsd，并更新日期
function saveMarketValues() {
  var inputs = document.querySelectorAll("#mvList .mv-cell[data-asset-id]");
  var changed = 0;
  inputs.forEach(function (input) {
    var id = input.getAttribute("data-asset-id");
    var asset = data.assets.find(function (a) { return a.id === id; });
    if (!asset) return;
    var raw = String(input.value).trim();
    if (raw === "") return; // 空着不动这只
    var val = parseFloat(raw);
    if (isNaN(val) || val < 0) return;
    var rounded = Math.round(val);
    if (rounded !== numberValue(asset.value)) {
      asset.value = rounded;
      if (assetJar(asset) === "investment") asset.updated = today();
      changed += 1;
    }
  });
  document.querySelectorAll("#mvList .mv-cell[data-usd-id]").forEach(function (input) {
    var id = input.getAttribute("data-usd-id");
    var asset = data.assets.find(function (a) { return a.id === id; });
    if (!asset) return;
    var raw = String(input.value).trim();
    var val = raw === "" ? 0 : parseFloat(raw);
    if (!Number.isFinite(val) || val < 0) return;
    if (val !== numberValue(asset.valueUsd)) {
      asset.valueUsd = val;
      changed += 1;
    }
  });
  // 等候罐第一次有钱：记下开始等待的月份，用于「已等待 N 个月」
  jarAssets("waiting").forEach(function (a) {
    if ((numberValue(a.value) > 0 || numberValue(a.valueUsd) > 0) && !String(a.waitingSince || "")) a.waitingSince = currentMonth();
  });
  if (!saveData()) return false;
  render();
  toast(changed > 0 ? "已更新 " + changed + " 项金额" : "金额无变化");
  return true;
}

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

  // 记一笔：保存前先冲销该记录的旧联动，写入后再应用新联动
  let linkedAsset = null;
  let linkedAmount = 0;
  if (editing.collection === "entries") {
    var originalEntry = index >= 0 ? collection[index] : null;
    var originalLinkedAmount = numberValue(originalEntry && originalEntry.linkedAmount);
    var linkFieldsChanged = entryLinkFieldsChanged(originalEntry, updated);
    if (originalEntry && originalLinkedAmount > 0 && !linkFieldsChanged) {
      updated.linkedAssetId = originalEntry.linkedAssetId;
      updated.linkedMonth = originalEntry.linkedMonth;
      updated.linkedAmount = originalEntry.linkedAmount;
      collection[index] = updated;
    } else {
      if (originalEntry && originalLinkedAmount > 0 && linkFieldsChanged && !isLinkEnabled()) {
        alert("这条投资记录已经联动到资产/月度。关闭自动联动时不能修改日期、类型、金额或去向；请先打开自动联动再修改，或删除后重记。");
        return;
      }
      var sameDestination = originalEntry && String(originalEntry.target || "").trim() === String(updated.target || "").trim();
      var preferredAssetId = originalLinkedAmount > 0 && sameDestination ? originalEntry.linkedAssetId : "";
      if (index >= 0) reverseEntryLink(collection[index]); // 冲销 collection 里的原始记录
      if (index >= 0) collection[index] = updated;
      else collection.push(updated);
      linkedAsset = applyEntryLink(updated, preferredAssetId);
      linkedAmount = numberValue(updated.linkedAmount);
    }
  } else {
    if (editing.collection === "monthly") {
      // 投机层占比按当前持仓自动写入；清理只读展示用的下划线字段，避免脏字段被持久化
      updated.specRatio = totals().specRatio;
      Object.keys(updated).forEach((k) => { if (k.charAt(0) === "_") delete updated[k]; });
    }
    if (index >= 0) collection[index] = updated;
    else collection.push(updated);
  }
  if (!saveData()) return;
  if (editing.collection === "entries") {
    try { localStorage.setItem(LAST_KIND_KEY, String(updated.kind || "投资")); } catch { /* Optional preference only. */ }
  }
  document.querySelector("#editorDialog").close();
  render();
  // 联动到具体资产时给个轻提示，引导去批量更新市值（不再每笔弹框打断）
  if (linkedAsset && linkedAmount > 0) {
    toast("已计入「" + linkedAsset.name + "」累计投入 · 月底点资产页「更新市值」对账");
  }
});

document.querySelector("#deleteBtn").addEventListener("click", () => {
  if (!editing || editing.isNew) return;
  var deleteMsg = "确定要删除这条记录吗？此操作不可撤销。";
  if (editing.collection === "assets") {
    deleteMsg = "确定要删除这项资产吗？此操作不可撤销。\n\n真实清仓建议把目标占比改为 0 或在备注写清仓，不要删除历史资产记录。";
  } else if (editing.collection === "entries") {
    deleteMsg = "确定要删除这条随手记吗？如果它已联动实际投入，删除时会同步冲销；此操作不可撤销。";
  }
  if (!confirm(deleteMsg)) return;
  // 删除投资记录前，先冲销它造成的累计投入/月度投入联动
  if (editing.collection === "entries") {
    const original = data.entries.find((item) => item.id === editing.item.id);
    if (original) reverseEntryLink(original);
  }
  data[editing.collection] = data[editing.collection].filter((item) => item.id !== editing.item.id);
  if (!saveData()) return;
  document.querySelector("#editorDialog").close();
  render();
});

document.querySelector("#exportBtn").addEventListener("click", () => {
  if (storageBlocked && !hasExportableLedger) {
    showStorageNotice(storageErrorMessage, true);
    return;
  }
  const backupData = hasExportableLedger ? committedData : data;
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `五行理财备份-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#importInput").addEventListener("change", async (event) => {
  if (storageBlocked) {
    alert(storageErrorMessage || "本机存储已锁定，无法导入账本。");
    event.target.value = "";
    return;
  }
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    validateLedgerData(parsed);
    if (!confirm("导入会覆盖当前本地账本。建议先导出当前数据作为 JSON 备份。确定导入吗？")) return;
    const nextData = normalizeData(structuredClone(parsed));
    fillMissingMonths(nextData);
    if (!saveData({ data: nextData })) {
      alert("导入失败：本机保存失败，原账本已保留。");
      return;
    }
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
  if (storageBlocked || !window.supabase) return false;
  let syncCodeAtStart = null;
  try {
    if (!isCloudConfiguredSafely()) {
      if (!storageBlocked) window.supabase.setStatus("offline");
      return false;
    }
    if (syncSwitchInFlight || syncInFlight || syncPending) return false;
    syncCodeAtStart = getSyncCodeSafely();
    if (!syncCodeAtStart) return false;
    window.supabase.setStatus("syncing");
    const revisionAtStart = dataRevision;
    const dataAtStart = data;
    const record = await window.supabase.loadRecord();
    if (storageBlocked || syncSwitchInFlight || getSyncCodeSafely() !== syncCodeAtStart) return false;
    if (dataRevision !== revisionAtStart || data !== dataAtStart) {
      window.supabase.setStatus("online", "已保留读取云端期间的本地改动，等待本地同步完成");
      return false;
    }
    if (record) validateCloudRecord(record);
    checkPeerVersion(record);
    const localTime = timeValue(meta.updatedAt);
    const cloudTime = timeValue(record && record.updatedAt);
    const localHasData = hasMeaningfulData(data);

    if (record && record.data) {
      if (options.preferCloud || !localHasData || cloudTime >= localTime) {
        const nextData = normalizeData(structuredClone(record.data));
        fillMissingMonths(nextData);
        const nextUpdatedAt = record.updatedAt || meta.updatedAt || new Date().toISOString();
        const nextMeta = { ...meta, updatedAt: nextUpdatedAt, lastSyncedAt: record.updatedAt || nextUpdatedAt, lastSyncError: "" };
        if (!commitRemoteData(nextData, nextMeta)) {
          if (!storageBlocked) window.supabase.setStatus("error", storageErrorMessage || "云端账本未能保存到本机，原账本已保留。");
          return false;
        }
        render();
        if (record.legacy) {
          window.supabase.setStatus("legacy", "检测到旧版同步记录；建议导出备份后重新生成同步码迁移到当前云同步。");
        } else {
          window.supabase.setStatus("online", `上次同步：${formatDateTime(meta.lastSyncedAt)}`);
        }
        if (record.protected === false && !record.legacy) {
          await syncToCloud(makeSyncPayload());
        }
      } else {
        await syncToCloud(makeSyncPayload());
      }
    } else {
      if (localHasData) {
        await syncToCloud(makeSyncPayload());
      } else {
        window.supabase.setStatus("online", "云端已连接，编辑后会自动同步");
      }
    }
    return true;
  } catch (error) {
    if (storageBlocked || syncSwitchInFlight || (syncCodeAtStart && getSyncCodeSafely() !== syncCodeAtStart)) return false;
    const message = error && error.message ? error.message : String(error);
    const nextMeta = { ...meta, lastSyncError: message };
    persistMeta(nextMeta);
    console.error("云同步初始化失败：", error);
    window.supabase.setStatus("error", message);
    return false;
  } finally {
    if (!syncSwitchInFlight && !storageBlocked && syncCodeAtStart && getSyncCodeSafely() === syncCodeAtStart) refreshSyncDialog();
  }
}

// 静默从云端拉取：仅当云端确实更新（updatedAt 更新）且本地无挂起改动时才覆盖，
// 用于切回页面/网络恢复后把其它设备的改动同步过来，不打扰当前编辑。
async function pullFromCloudIfNewer() {
  if (storageBlocked || !window.supabase) return false;
  let syncCodeAtStart = null;
  try {
    if (!isCloudConfiguredSafely()) return false;
    if (syncSwitchInFlight || syncInFlight || syncPending) return false; // Local edits or an identity switch take priority.
    if (document.querySelector("dialog[open]")) return false;
    syncCodeAtStart = getSyncCodeSafely();
    if (!syncCodeAtStart) return false;
    const revisionAtStart = dataRevision;
    const dataAtStart = data;
    const record = await window.supabase.loadRecord();
    if (storageBlocked || dataRevision !== revisionAtStart || data !== dataAtStart || syncSwitchInFlight || syncInFlight || syncPending || document.querySelector("dialog[open]") || getSyncCodeSafely() !== syncCodeAtStart) return false;
    if (!record) return false;
    validateCloudRecord(record);
    checkPeerVersion(record);
    const cloudTime = timeValue(record.updatedAt);
    const localTime = timeValue(meta.updatedAt);
    if (cloudTime <= localTime) return false; // 云端不比本地新，无需覆盖
    const nextData = normalizeData(structuredClone(record.data));
    fillMissingMonths(nextData);
    const nextMeta = { ...meta, updatedAt: record.updatedAt, lastSyncedAt: record.updatedAt, lastSyncError: "" };
    if (!commitRemoteData(nextData, nextMeta)) {
      if (!storageBlocked) window.supabase.setStatus("error", storageErrorMessage || "云端账本未能保存到本机，原账本已保留。");
      return false;
    }
    render();
    window.supabase.setStatus("online", `已拉取最新：${formatDateTime(meta.lastSyncedAt)}`);
    return true;
  } catch (error) {
    if (storageBlocked || (syncCodeAtStart && getSyncCodeSafely() !== syncCodeAtStart)) return false;
    const message = error && error.message ? error.message : String(error);
    persistMeta({ ...meta, lastSyncError: message });
    console.warn("后台拉取云端失败：", error);
    window.supabase.setStatus("error", message);
    return false;
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
if (window.__v8MigratedNotice) {
  toast("本机账本已升级到 v8.1；如果还有别的设备在用旧版，请把它也升级到 v8.1 再同步");
}
initCloudSync();
