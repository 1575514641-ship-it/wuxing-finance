# 五行理财 App 交接说明

## 项目边界

- 项目类型：纯静态 PWA，部署到 Netlify，无构建步骤。
- 入口：`index.html`，主逻辑：`app.js`，样式：`styles.css`，Service Worker：`sw.js`，云同步封装：`supabase.js`。
- 线上地址：https://www0706.netlify.app/
- 仓库：`1575514641-ship-it/wuxing-finance`，当前主分支 `main`。
- 当前版本：v7.8。

## 运行与验证

- 本地启动：运行 `启动App.ps1`，访问 `http://127.0.0.1:8765`。
- 本地停止：运行 `停止App.ps1`。
- 每次改动后至少执行：
  - `node --check app.js`
  - `node --check sw.js`
  - `node --check supabase.js`
- 前端改动需用 375px 移动视口检查无横向滚动。

## 发布收尾

每个版本发布前必须同步三处缓存/版本：

- `index.html` 顶部 `<small>v7.x</small>`
- `index.html` 里的 `supabase.js?v=7-x` 和 `app.js?v=7-x`
- `sw.js` 第一行 `CACHE_NAME = "wuxing-finance-app-v7-x"`

提交链路：

```powershell
git add app.js index.html styles.css sw.js 使用说明.md CLAUDE.md
git commit -m "v7.x: ..."
git -c http.version=HTTP/1.1 -c http.lowSpeedLimit=1 -c http.lowSpeedTime=120 push origin main
```

GitHub 网络偶尔 reset，优先用上面的 HTTP/1.1 push 参数重试。

## 核心产品定位

- 这是「工资到账决策器」，不是记账工具。
- 计划与执行严格分开：分配页保存 `plannedInvested` 和 `allocationPlan`，不能覆盖月度 `invested`，不能写入 `entries`。
- 随手记只记录真实发生的收入、投资、大额消费。

## 资产配置与硬规则

- 不要改 v7 目标占比：现金 10%、防御 22%、生财 22%、成长 36%、投机 10%。
- 投机层市值占总资产 `>= 10%` 时，分配页自动暂停给投机层新增资金；标准模式和修正模式都生效。
- 不加“忽略一次”按钮。要绕过只能手动改资产 target，这个摩擦是冷静期。
- QDII/出海后执行资产用 `status: "buffered"` 或 `buffered:*` 暂存到 `bufferDestinationId` 指向的资产。
- 出海后可在规则页点「我已出海·解锁暂存」，一键把 buffered 资产改回 available。

## 分配引擎不变量

- `targetSum > 0` 时用归一化权重：`asset.target / targetSum`。
- `targetSum = 0` 时建议金额为 0，并提示目标占比未设置。
- `cashflowAvailable = max(income - expense - reserve, 0)`。
- `investBase = round(min(cashflowAvailable, income * savingRate))`。
- `allocatedTotal` 是实际分配出去的金额；全部偏高或去向不可用时可小于 `investBase`。
- `actualRemainingCash = cashflowAvailable - allocatedTotal`。
- `plannedInvested = allocatedTotal`，不是 `investBase`。
- 暂存重定向正常可用时，应保持 `allocatedTotal === investBase`。
- `unbufferedCash` 只表示暂存去向不可用而留在现金里的金额，不能和 `actualRemainingCash` 双算。

## 重要函数

- `isBufferedStatus(status)`：判断 `buffered` 和 `buffered:*`，不要写死 `status === "buffered"`。
- `isAvailableAsset(asset)`：分配目的地可用性判断。
- `syncBufferDestinations(assets)`：兼容旧 name 暂存去向并同步到 `bufferDestinationId`。
- `computeEffectiveTargets(assets)`：计算含暂存汇入后的有效目标；资产页和分配页都依赖它。
- `calcAllocation(inputs)`：核心分配引擎。
- `calcFire(inputs)`：FIRE 测算纯函数，不读写 data；含达成日预测、灵敏度、目标线计算。
- `projectMonthsToTarget(...)`：月度复利滚动求达成月数；目标随通胀上移，80 年内不可达返回 `reachable:false`。
- `fireHistorySeries()` / `drawFireChart(...)`：从月度 `monthEndAssets` 取历史净值，纯 SVG 画历史实线 + 预测虚线 + 目标线。

## 当前主要功能

- 资产页：显示当前占比/归一化目标；暂存接收方额外显示「含暂存后」有效目标。
- 分配页：输入收入、支出、预留、储蓄率，生成本月建议；显示工资到账操作清单。
- 月度页：计划投资和实际投入分开显示；若计划含暂存，显示「含暂存」。
- 规则页：套用 v7 配置、出海解锁暂存、执行手册（行为铁律、QDII 溢价规则、推荐产品表、出国前清单、出国后路线、费率税收速查）。
- FIRE 页：按今天购买力和目标年龄名义金额分别展示 4%/3.5%/3% 三档线；并有「FIRE 仪表盘」——预计达成日（基于当前净值+每月定投+预期收益率滚动到 3.5% 名义目标）、灵敏度提示（每月多投 ¥1000 / 收益率 +1% 各提前多久）、净值增长曲线（历史实线 + 预测虚线 + 目标线，纯 SVG）。每月定投留空时按月度历史 `invested/plannedInvested` 平均值估算。

## 不要做

- 不引入构建工具、测试框架或前端框架。
- 不改 Supabase schema，除非用户明确要求。
- 不做短视频比例照搬，不改 v7 配置为 40/40/20。
- 不加虚拟币、杠杆、初创股权、买房建议相关逻辑。
- 不让 `phase/channel` 之类展示字段隐式影响 `calcAllocation`。
