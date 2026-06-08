# 五行理财 App 交接说明

## 项目边界

- 项目类型：纯静态 PWA，部署到 Netlify，无构建步骤。
- 入口：`index.html`，主逻辑：`app.js`，样式：`styles.css`，Service Worker：`sw.js`，云同步封装：`sync.js`（原 supabase.js 已删除）。
- 线上地址：<https://www0706.netlify.app/>
- 仓库：`1575514641-ship-it/wuxing-finance`，当前主分支 `main`。
- 当前版本：v7.15。

## 运行与验证

- 本地启动：运行 `启动App.ps1`，访问 `http://127.0.0.1:8765`。
- 本地停止：运行 `停止App.ps1`。
- 每次改动后至少执行：
  - `node --check app.js`
  - `node --check sw.js`
  - `node --check sync.js`
- 前端改动需用 375px 移动视口检查无横向滚动。

## 发布收尾

⚠️ **部署节流（2026-06-08 起，重要）**：Netlify 新计费按 credits 计量"生产部署次数"，高频 push 会触顶导致生产部署被暂停（线上网站仍运行，但新 push 不上线，周期重置才恢复）。2026-06 我们 v7.11→v7.15 短期连续 push 把额度打爆过一次。规则：**攒够一批改动再 push 部署，不要改一行推一次**；多个小改动合并到一次提交/一次上线。线上版本不是越新越好，够用即可。若以后仍频繁触顶，再考虑迁 Cloudflare Pages（前端与 Worker+D1 归一家，每月 500 次构建，且 `/api/sync` 可同源免反代）。

每个版本发布前必须同步三处缓存/版本：

- `index.html` 顶部 `<small>v7.x</small>`
- `index.html` 里的 `sync.js?v=7-x` 和 `app.js?v=7-x`
- `sw.js` 第一行 `CACHE_NAME = "wuxing-finance-app-v7-x"`

提交链路：

```powershell
git add app.js index.html styles.css sw.js sync.js _redirects CLAUDE.md
git commit -m "v7.x: ..."
git -c http.version=HTTP/1.1 -c http.lowSpeedLimit=1 -c http.lowSpeedTime=120 push origin main
```

GitHub 网络偶尔 reset，优先用上面的 HTTP/1.1 push 参数重试。

## 核心产品定位

- 这是「工资到账决策器」，不是记账工具。
- 计划与执行严格分开：分配页保存 `plannedInvested` 和 `allocationPlan`，不能覆盖月度 `invested`，不能写入 `entries`。
- 随手记记录真实发生的收入、投资、大额消费。v7.13 起「投资」类记一笔是执行端真相源：保存时按去向名匹配资产，自动累加该资产 `cost`(累计投入)和当月 `monthly.invested`(实际投入)；编辑/删除/改类型会先冲销旧联动再应用新的(靠 entry 上的 `linkedAssetId/linkedMonth/linkedAmount`)，不会重复计数。联动可由 `settings.linkInvestEntry`(默认 true)关闭。
- 市值(`asset.value`)是会波动的外部快照，不跟买入事件走：记一笔投资不改市值，只给 toast 轻提示。市值更新走资产页「更新市值」按钮(`openMarketValueEditor`/`saveMarketValues`)——批量列出所有资产、预填当前值、对照券商一次性改完。设计理由：确定的钱(投入)跟事件自动记，波动的钱(市值)跟「每月看一次账户」的仪式批量填。v7.15 起，已删除 v7.13~v7.14 的「记一笔后单只市值预填弹窗」。
- 注意区分：分配页(计划)绝不碰 `invested/entries`；随手记(执行)才联动 `invested/cost`。两者不可混。

## 资产配置与硬规则

- 不要改 v7 目标占比（2026-06-07 已更新）：现金 13%（RMB货基8%+USD货基5%buffered）、防御 22%（黄金7%+红利低波7%+纯债8%）、生财 24%（沪深300/A500 17%+中证500 7%）、成长 36%（标普25%+医疗7%+矿股4%）、投机 10%（纳指5%+自选5%）。美元货基和成长/投机层均为 buffered，出海前暂存到 RMB 货基。
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

- `drawLineChart(el, series, opts)`：通用 SVG 折线图，`renderSavingChart` 和 `drawFireChart` 都调它，不要再手写 SVG。
- `isBufferedStatus(status)`：判断 `buffered` 和 `buffered:*`，不要写死 `status === "buffered"`。
- `isAvailableAsset(asset)`：分配目的地可用性判断。
- `syncBufferDestinations(assets)`：兼容旧 name 暂存去向并同步到 `bufferDestinationId`。
- `computeEffectiveTargets(assets)`：计算含暂存汇入后的有效目标；资产页和分配页都依赖它。
- `calcAllocation(inputs)`：核心分配引擎。
- `calcFire(inputs)`：FIRE 测算纯函数，不读写 data；含达成日预测、灵敏度、目标线计算。
- `projectMonthsToTarget(...)`：月度复利滚动求达成月数；目标随通胀上移，80 年内不可达返回 `reachable:false`。
- `fireHistorySeries()` / `drawFireChart(...)`：从月度 `monthEndAssets` 取历史净值，纯 SVG 画历史实线 + 预测虚线 + 目标线。

## 当前主要功能

- 资产页：显示当前占比/归一化目标；偏低项直接显示建议补仓金额；暂存接收方显示「含暂存后」有效目标；无资产时显示空状态引导。
- 分配页：输入收入、支出、预留、储蓄率，生成本月建议；显示工资到账操作清单；保存后显示确认块+手动跳转按钮（不再自动跳转）。
- 月度页：顶部应急金进度条（目标可编辑）+ 储蓄率趋势折线；计划投资和实际投入分开显示；月度编辑器含储蓄率只读展示。
- 随手记：按年月分组折叠，每组显示收入/投资小计。
- 规则页：套用 v7 配置、出海解锁暂存、执行手册（行为铁律、QDII 溢价规则、推荐产品表、出国前清单、出国后路线、费率税收速查）。
- FIRE 页：三档线 + 进度条；FIRE 仪表盘（预计达成日、灵敏度、净值历史+预测曲线）。

## 不要做

- 不引入构建工具、测试框架或前端框架。
- 不改云同步后端 schema（CF D1 `user_data` 表 / Worker 接口），除非用户明确要求。
- 不做短视频比例照搬，不改 v7 配置为 40/40/20。
- 不加虚拟币、杠杆、初创股权、买房建议相关逻辑。
- 不让 `phase/channel` 之类展示字段隐式影响 `calcAllocation`。
