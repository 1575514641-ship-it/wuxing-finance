# 五行理财 App 交接说明

## 项目边界

- 项目类型：纯静态 PWA，部署到 Netlify，无构建步骤。
- 入口：`index.html`，主逻辑：`app.js`，样式：`styles.css`，Service Worker：`sw.js`，云同步封装：`sync.js`（原 supabase.js 已删除）。
- 线上地址：<https://www0706.netlify.app/>
- 仓库：`1575514641-ship-it/wuxing-finance`，当前主分支 `main`。
- 当前前端版本：v7.26（补齐带版本号脚本的离线预缓存；保留 v7.25 账本保护）。Worker 保存修复已准备，因本机 Wrangler 未登录 Cloudflare，尚未部署。

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

Service Worker 从缓存名派生 `SCRIPT_VERSION`，同时预缓存裸脚本地址和与 HTML 一致的 `app.js?v=7-x`、`sync.js?v=7-x`。不要仅缓存裸地址，也不要用全局忽略查询串掩盖版本错误。

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
- v7.22 已进入上班前收官版：v7.22 后只允许三类改动：修 bug、回填真实工资/税务/保险/资金路径、更新使用说明；不再新增投资逻辑，不重开资产配置。
- v7.19 已固化《半解锁与出海执行规则 v1》，冻结至 2026-09-12：只允许执行方案、入职后回填真实工资/税务/资金路径信息和修 bug，不再重开配置比例或规则框架。
- 自选个股/行业 ETF 保留 5% target，但默认 `status: "paused:manual"`；这是冻结，不是清零。入职第一年不主动买。
- QDII 国内阶段采用半解锁纪律：标普500最多先建到目标 12%，全球医疗最多 3%，纳指仍按投机层管理，USD货币工具继续 buffered；溢价 >3% 回 buffered，>5% 绝不买，窗口重开不补买错过月份。
- 应急金默认目标为 30000。出国前 3 万，海外稳定后可在月度页手动降到 2-2.5 万。
- 重载、导入和云端归一化必须保留已有正数应急金目标，不能把用户手动设置的 20000 当旧默认强行升级。
- 个人养老金暂缓：35 岁 FIRE 资金不放入个人养老金；边际税率低于 20% 时不启用，未来税率升高且现金流稳定再评估。

## 分配引擎不变量

- `targetSum > 0` 时用归一化权重：`asset.target / targetSum`。
- `targetSum = 0` 时建议金额为 0，并提示目标占比未设置。
- `cashflowAvailable = max(income - expense - reserve, 0)`。
- `investBase = round(min(cashflowAvailable, income * savingRate))`。
- `allocatedTotal` 是实际分配出去的金额；全部偏高或去向不可用时可小于 `investBase`。
- `actualRemainingCash = cashflowAvailable - allocatedTotal`。
- `plannedInvested = allocatedTotal`，不是 `investBase`。
- 无手动暂停、无其他跳过且暂存重定向正常可用时，应保持 `allocatedTotal === investBase`。
- `paused:manual` 建议金额必须为 0；其归一化目标份额计入 `manualPausedCash`，保留为未分配现金，不重分配给其他资产。它包含在 `actualRemainingCash` 中，不能重复相加。
- `unbufferedCash` 只表示暂存去向不可用而留在现金里的金额，不能和 `actualRemainingCash` 双算。

## 重要函数

- `drawLineChart(el, series, opts)`：通用 SVG 折线图，`renderSavingChart` 和 `drawFireChart` 都调它，不要再手写 SVG。
- `isBufferedStatus(status)`：判断 `buffered` 和 `buffered:*`，不要写死 `status === "buffered"`。
- `isAvailableAsset(asset)`：分配目的地可用性判断。
- `syncBufferDestinations(assets)`：兼容旧 name 暂存去向并同步到 `bufferDestinationId`。
- `validateLedgerData(input)`：JSON 导入和云端替换前校验三个集合、记录行及已知字段类型；拒绝错误数据后不得覆盖本地账本。缺失旧版可选字段仍可归一化。
- `dataRevision`：只在内存中计数本地保存；云端读取响应到达后重新检查，读取期间有本地保存或替换则保留本地。后台读取也须重新检查编辑弹窗和待发同步状态。
- 随手记分组用无原型对象；账本字符串不能拼进 CSS 选择器，显示内容须经 `esc()`。
- `computeEffectiveTargets(assets)`：计算含暂存汇入后的有效目标；资产页和分配页都依赖它。
- `calcOpportunityPlan(selectedTriggers)`：机会补仓检查器纯函数；弹药=现金层 available 市值 - 应急金目标，单次预算=min(弹药30%, 5000)，只显示建议，不写任何数据。矿股不在 `DRAWDOWN_RULES`，不做机会补仓对象。
- `calcAllocation(inputs)`：核心分配引擎。
- `calcFire(inputs)`：FIRE 测算读取 `totals()` 的当前资产，不写 data；含达成日预测、灵敏度、目标线计算，并支持国内/海外两段月存与首年安家支出。
- `projectMonthsToTarget(...)` / `projectMonthsToTargetPhased(...)`：月度复利滚动求达成月数；目标随通胀上移，80 年内不可达返回 `reachable:false`。
- `fireHistorySeries()` / `drawFireChart(...)`：从月度 `monthEndAssets` 取历史净值，纯 SVG 画历史实线 + 预测虚线 + 目标线。

## 当前主要功能

- 首页：资产总览下方新增「今日动作」驾驶舱，只显示 3-5 条当前该处理的事；含固定命盘纪律摘要，不保存完整出生隐私信息。
- 资产页：显示当前占比/归一化目标；偏低项直接显示建议补仓金额；暂存接收方显示「含暂存后」有效目标；无资产时显示空状态引导；冻结期提示只更新市值、不改比例。
- 分配页：输入收入、支出、预留、储蓄率，生成本月建议；显示工资到账操作清单；含“机会补仓检查：只在明显回撤时打开”（手动勾选回撤条件，只显示建议金额，不保存/不执行）；保存后显示确认块+手动跳转按钮（不再自动跳转）。
- 月度页：顶部应急金进度条（目标可编辑）+ 月度清单 + 储蓄率趋势折线；计划投资和实际投入分开显示；月度编辑器含储蓄率只读展示。
- 随手记：按年月分组折叠，每组显示收入/投资小计；页面文案强调这里只记录真实发生，不记录计划。
- 规则页：套用 v7 配置、出海解锁暂存、折叠式执行手册（本月执行、行为铁律、回撤补仓、QDII 半解锁、出海规则、推荐产品、税费速查、入职后回填）；支持展开全部/收起全部；入职后回填清单是静态可复制文本，不保存 checkbox。
- FIRE 页：三档线 + 进度条；FIRE 仪表盘（预计达成日、灵敏度、净值历史+预测曲线），按国内阶段月存/海外阶段月存/首年安家支出做两段式预测；顶部提示真实税后工资、房租、汇率、保险和派驻地确认后再作为正式路线图。

## 不要做

- 不引入构建工具、测试框架或前端框架。
- 不改云同步后端 schema（CF D1 `user_data` 表 / Worker 接口），除非用户明确要求。
- 不做短视频比例照搬，不改 v7 配置为 40/40/20。
- 不接行情 API，不自动判断回撤，不把机会补仓写入 `entries/invested/plannedInvested/value`。
- 不加虚拟币、杠杆、初创股权、买房建议相关逻辑。
- 不让 `phase/channel` 之类展示字段隐式影响 `calcAllocation`。

## 同步边界

- 客户端按时间比较并替换整份账本，没有逐笔合并不同设备的离线改动。2026-09-30 已在本机复现原 Worker 先查询后无条件 UPSERT 的保存竞态；仓库修复需另外部署 Worker，Netlify 前端发布不会使服务端补丁生效。
- Worker 待发布补丁用单条条件 UPSERT 同时约束相同身份 hash 和更新时间；空 hash 旧记录仍拒绝客户端认领。拒绝坏账本、无效时间或超前超过 5 分钟的时间，不自动重置已有云端时间。相同时间戳仍允许后写覆盖，不能当作离线合并。
- 官方 Wrangler 已安装在 `E:\Tools\wuxing-worker-cli`，部署前须检查登录；未登录时只能完成本地 `deploy --dry-run` 编译，不要报告已修复线上 D1。
- 导入同步码先用候选身份读取并校验目标账本，失败或目标不存在时保留原身份/账本；本机待发或在途保存时禁止切换，校验期间本地有改动则取消切换。
- 云端读取及保存响应须匹配发起时的同步码，且更新时间有效；旧身份的迟到响应不得更新当前账本或同步元数据。
- 同步码切换先准备并序列化候选账本和元数据，再与两个身份键一起写入；写异常时逆序回退已写键，全部成功后才更新内存。此保护不保证断电或进程终止时的多键原子性。
- 日常固定一台设备编辑；换设备前确认上一台同步完成，新设备拉取后再编辑。若两台都离线改过，先分别导出 JSON 留存，再决定使用哪份。
