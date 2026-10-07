# 五行理财 App 交接说明

## 项目边界

- 项目类型：纯静态 PWA，部署到 Netlify，无构建步骤。
- 入口：`index.html`，主逻辑：`app.js`，样式：`styles.css`，Service Worker：`sw.js`，云同步封装：`sync.js`（原 supabase.js 已删除）。
- 线上地址：<https://www0706.netlify.app/>
- 仓库：`1575514641-ship-it/wuxing-finance`，当前主分支 `main`。
- 当前前端版本：v8.3（v8.0 定版内容：配置比例合计 100%；新增四个罐子；分配顺序改为应急罐优先；QDII 溢价输入与分级；外派阶段按币种分配；产品状态 / 费率列；再平衡修剪提醒；回撤检查器；FIRE 三种天气与存款增长率；首次使用引导；`schemaVersion=8` 自动迁移）。**v8.1 只做五件事**：修外派分配 bug（先用美元、人民币补剩下的，加资金守恒校验）、修剪提醒只在每年 1 月、黄金 10% 与投机层上限改为从数据读、QDII 溢价合并为四档、FIRE 参数落盘到 `settings.fire` 并删掉 6 个冗余输入。**v8.2 只做四件事**：手动暂停（`paused:manual`）的本月额度改入等候罐、和「暂停申购」走同一条逻辑（`waitingFromSuspended`），不再分给其他产品；「套用配置」只更新比例 / 层级 / 代码 / 费率 / 罐子归属，保留用户标的 `buyStatus` 和 `paused:manual`；删掉 `.gitignore` 里的「使用说明.md」一行（对已跟踪文件本来不生效）；CLAUDE.md 补记「同步是整份账本后写覆盖、不合并」与「使用说明.md 被 git 跟踪且含个人数字」两条。**v8.3 只做四件事**：每月投入改成「可投现金流全部进分配」（不再 `min(可投现金流, 收入 × 目标储蓄率)`），目标储蓄率降为检查项（`actualSavingRate = 可投现金流 ÷ 收入`，低于目标在分配结果上方给黄条，不卡金额）；「剩余现金」只算真正分不出去的部分；等候罐说明文字与规则页统一（买不进去的钱 + 手动暂停额度，不区分来源）；验收脚本合并到一个构建目录 + 统一入口 `node verify/run-all.mjs`。v7.28 的本机保存失败保护、投资联动、离线缓存与云同步快照逻辑沿用不变。Worker 保存修复**不部署**（2026-10-07 用户决定关闭该待办）。

## 运行与验证

- 本地预览：运行 `node preview.mjs`，打开终端输出的 `http://127.0.0.1:端口/`；停止时在同一终端按 Ctrl+C。仅绑定本机，端口每次分配，静态文件白名单不提供云同步接口或局域网访问。使用与恢复步骤统一见 [使用说明.md](使用说明.md)。
- 每次改动后至少执行：
  - `node --check app.js`
  - `node --check sw.js`
  - `node --check sync.js`
- 本地全套验收（唯一入口）：`node E:\DP\_wuxing-build\verify\run-all.mjs` —— 一次跑完 verify-v8 / verify-v81 / verify-v82 / verify-v83 / lead-extra / edge-checks / 375px 浏览器套件并打印汇总；`--online` 追加线上套件（push 后才跑），`--no-browser` 跳过浏览器套件。验收脚本、基线代码、报告都在 `E:\DP\_wuxing-build\`（v8.3 起合并为一个构建目录）。
- 前端改动需用 375px 移动视口检查无横向滚动。

## 发布收尾

**部署节流**：攒够一批改动再 push，多个小改动合并到一次提交/一次上线。仅文档和开发辅助工具变更时，确认运行中的前端、缓存和 Worker 文件均未改动，再在提交说明加 `[skip netlify]` 同步仓库；涉及运行文件时不能跳过部署。规则依据见 [Netlify 跳过部署说明](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#skip-a-deploy)。

每个版本发布前必须同步三处缓存/版本：

- `index.html` 顶部 `<small>v8.x</small>`（v8.3 这一版写 `v8.3`）
- `index.html` 里的 `sync.js?v=8-x` 和 `app.js?v=8-x`（v8.3 这一版写 `?v=8-3`）
- `sw.js` 第一行 `CACHE_NAME = "wuxing-finance-app-v8-x"`（v8.3 这一版写 `wuxing-finance-app-v8-3`）

Service Worker 从缓存名派生 `SCRIPT_VERSION`，同时预缓存裸脚本地址和与 HTML 一致的 `app.js?v=8-x`、`sync.js?v=8-x`。不要仅缓存裸地址，也不要用全局忽略查询串掩盖版本错误。

提交链路：

```powershell
git add app.js index.html styles.css sw.js sync.js _redirects CLAUDE.md
git commit -m "v8.x: ..."
git -c http.version=HTTP/1.1 -c http.lowSpeedLimit=1 -c http.lowSpeedTime=120 push origin main
```

GitHub 网络偶尔 reset，优先用上面的 HTTP/1.1 push 参数重试。

## 核心产品定位

- 这是「工资到账决策器」，不是记账工具。
- 计划与执行严格分开：分配页保存 `plannedInvested` 和 `allocationPlan`，不能覆盖月度 `invested`，不能写入 `entries`。
- 随手记记录真实发生的收入、投资、大额消费。v7.13 起「投资」类记一笔是执行端真相源：新记录按去向名匹配资产，自动累加该资产 `cost`(累计投入)和当月 `monthly.invested`(实际投入)。已有联动只改备注或渠道时保留 `linkedAssetId/linkedMonth/linkedAmount`，不冲销重加；改金额或日期且去向未变时保留原资产 ID，避免资产改名后丢失投入。明确改去向才重新按名称匹配；原 ID 已被删除时，不把历史投入迁到同名新资产。记账字段编辑、删除和改类型仍按已存 linked 字段冲销，不改市值或计划投资。联动可由 `settings.linkInvestEntry`(默认 true)关闭。
- 市值(`asset.value`)是会波动的外部快照，不跟买入事件走：记一笔投资不改市值，只给 toast 轻提示。市值更新走资产页「更新市值」按钮(`openMarketValueEditor`/`saveMarketValues`)——批量列出所有资产、预填当前值、对照券商一次性改完。设计理由：确定的钱(投入)跟事件自动记，波动的钱(市值)跟「每月看一次账户」的仪式批量填。v7.15 起，已删除 v7.13~v7.14 的「记一笔后单只市值预填弹窗」。
- 注意区分：分配页(计划)绝不碰 `invested/entries`；随手记(执行)才联动 `invested/cost`。两者不可混。

## 资产配置与罐子（v8.3）

- **唯一配置源**：`app.js` 顶部 `V8_LAYERS`（层 / 五行 / 目标 / 上限）与 `V8_PRODUCTS`（id / 层级 / 五行 / 名称 / 类型 / 目标 / 代码 / 费率 / 渠道 / 能不能买 / jar），默认值集中在 `V8_DEFAULTS`。资产页、分配页、规则页五行对照表、FIRE 测算都从这里取数，**改比例只改这一处，不要在别处写死百分比**。比例合计 100%：现金 5% / 防御 35% / 生财 25% / 成长 30% / 投机 5%（上限 10%）/ 规避层 0%。
- 产品表（2026-10-06 定版；id 沿用 v7 既有 id，保证随手记历史联动不丢）：货币基金 5%（000198/003474，场外，同时是弹药罐）；黄金ETF 10%（518850，默认，产品表保留可切换 159937）；7-10 年国开债 12.5%（003376，场外）；1-3 年政金债 12.5%（007364，场外）；中证A500ETF 12%（159338）；红利低波ETF 8%（512890，归入生财层 / 土）；中证500ETF 5%（510500）；标普500 QDII 30%（513500 / 003718，看溢价）；纳斯达克100ETF 5%（159632，看溢价）。黄金 10% 是硬上限（`gold-etf` 行上的 `cap: 0.10`）：黄金占投资组合 ≥ 10% 时分配页跳过它，原因写「达到 10% 上限」。
- 已从产品表移除，不要再加回来：沪深300 510300、华安黄金 518880、标普医疗 QDII 161126、黄金矿股、自选个股（原「5% 冻结占位」）。黄金 518850/159937、红利低波 512890/563020 这类可切换代码写在产品表里，但代码不要写死在逻辑里。
- **四个罐子**（`asset.jar`，取值 `emergency | study | waiting | investment`）：应急罐 / 读书基金（默认关闭）/ 等候罐 / 投资组合。**只有投资组合参与比例与偏离度计算**；另外三个罐子的钱不进归一化，也不算股票类占比。
- **应急罐目标 1.5 万**（`settings.emergencyGoal`，默认 15000），应急罐不计入投资组合；存满之前不做投资。应急罐目标不随出海阶段变化，原来的分阶段口径已作废。
- **读书基金默认关闭**（`settings.studyFundEnabled: false`）：分配页的 `allocStudyToggle` 是启用开关（默认关闭）；关闭时不显示卡片、不参与分配。启用后默认 25%（`studyFundRatio`，可改 0～50）从本月计划投资里先扣，达到目标（`studyFundGoal`）自动停止。只放短债、货币基金、美元存款或美元货币基金，不买股票；支持人民币 + 美元两币种（`studyFundUsd`，按用户手填汇率折算显示）。
- **等候罐（2026-10-07 起不区分来源）**：QDII 溢价太高 / 限购买不进去的钱、以及「手动暂停」产品的本月额度都落这里，显示「已等待 N 个月」（`waitingSince`）。窗口重开时用 12 个月平均补回，单月不超过该资产目标仓位的 1/4，禁止一次性报复性买入——两种来源同一节奏。资产卡片（`V8_JARS` 与 `renderJars`）说明文字已与规则页统一：「买不进去的钱、以及手动暂停产品的本月额度，不区分来源」（v8.3 起）。
- 投机层市值占总资产达到 `V8_LAYERS` 里投机层的 `cap`（0.10）时，分配页自动暂停给投机层新增资金；标准模式和修正模式都生效。黄金达到产品表里 `gold-etf` 的 `cap`（0.10）时，本月跳过黄金。两个上限都从数据读。
- 不加“忽略一次”按钮。要绕过只能手动改资产 target，这个摩擦是冷静期。
- 修正模式：某只产品的实际占比超过其目标 **3 个百分点**时，暂停新增，资金转去缺口最大的产品。层的实际占比偏离目标超过 **±5 个百分点**才触发首页修剪提醒，两个阈值不要混用。
- 产品「能不能买」= `asset.buyStatus`（正常 / 限购 / 暂停申购 / 溢价过高），用户手动选择并记录 `buyStatusChecked`（上次检查日期）；状态为「暂停申购」的产品在分配页不被推荐并灰显。`feePct` 年费率按《说明书》任务 4 预填，用户可改。
- **QDII 溢价分级（v8.1 四档）**（`settings.premiumInputs`，按本月溢价 %，`PREMIUM_TIERS`）：<2% 正常按月买、场内全额；2～3% 半额，另一半进等候罐；3～5% 暂停场内，改「场外每日定投」或进等候罐；>5% 绝不买场内，全部改场外定投（场外限购或暂停就进等候罐）。原来的「1～2% 小额」和 <1% 实际行为一样，已合并；代码侧 `PREMIUM_TIERS` / `premiumSplit` / `channelAdvice` 三处文案也都是四档。持有的场内 QDII 溢价 >10% 时可卖出换场外同指数基金，先确认场外能买、额度够。
- **外派阶段开关**（`settings.expatMode`，默认关）：打开后分配页分别输入人民币收入与美元收入（`allocUsdIncome` + `allocFxRate`，汇率默认 6.78，用户手动更新）。v8.1 起按「先用美元、人民币补剩下的」切币种池：`usdPool = min(美元收入折人民币, investBudget)`、`rmbPool = investBudget − usdPool`；美元买美股部分（成长层 + 投机层，QDII 美元现汇份额），人民币买国内部分（现金、防御、生财）；美元超过美股目标、或美股没缺口吃不下时，多出的先补弹药罐（美元货币基金），其余提示「建议结汇」（每季度结汇一次，在每年 5 万美元便利额度内）。读书基金按比例从本月可投金额里先扣（启用时），未启用按 0。固定提示：不要把国内美元汇出去开海外券商买股票。
- **最低 5 元开关**（`settings.minCommission5`，默认开）：开启时每月只推荐缺口最大的 1～2 只，并提示单笔尽量不少于 3000 元；关闭时按缺口比例分给所有产品。
- **v8.1 起 `buffered` 暂存重定向已删除**：迁移和归一化时把 `buffered` / `buffered:*` 转成 `buyStatus = "暂停申购"` + `status = "available"`，`paused:manual`（用户主动暂停）保留；`syncBufferDestinations` / `resolveBufferDestination` 与 `computeEffectiveTargets` 里的汇入逻辑都已删除。旧账本里的 `bufferDestinationId` / `bufferDestination` 字段仍能通过导入校验，但不再生效；资产编辑弹窗的「状态」只剩 available / paused:manual。QDII 买不进的钱按等候罐口径处理。**v8.2 起手动暂停也进等候罐**：`paused:manual` 的产品本月额度按缺口占比并入 `waitingFromSuspended`，不再分给其他产品；`manualPausedCash` 字段保留，含义改为「手动暂停对应的等候罐金额」。
- 《半解锁与出海执行规则 v1》里的国内阶段临时期口径（标普500 建仓上限、医疗 QDII 子目标、溢价回暂存）随 v8.0 配置一起作废；对应产品已从产品表移除。
- **v8.1 收官边界**：v8.1 后只修 bug、回填真实工资/税务/保险/资金路径信息和更新使用说明（v8.2 属此类小修）；规则每年 1 月最多修改一次，其余时间只执行。不重开配置比例（唯一配置源见上），不再新增投资逻辑。
- 重载、导入和云端归一化必须保留已有正数应急罐目标（例如用户手动设的 20000），不能把它当旧默认强行改回 15000。
- 个人养老金暂缓：35 岁 FIRE 资金不放入个人养老金；边际税率低于 20% 时不启用，未来税率升高且现金流稳定再评估。

## 页面行为（v8.3）

- **配置比例自动检查**：各层目标合计 ≠ 100% 时，页面顶部显示黄色提醒（`#targetWarning`，`class="target-warning"`），计算仍按归一化继续；层内子目标合计不等于该层目标时也要提示。
- **四罐卡片**（资产页 `#jarCards`）：应急罐 / 读书基金（关闭时不显示）/ 等候罐 / 投资组合，各显示当前金额、目标、进度条；读书基金可显示人民币 + 美元两币种。
- **分配页新输入**（`#jarAllocation` 及新增控件）：读书基金开关 `allocStudyToggle`（默认关闭）与比例 `allocStudyRatio`（默认 25）、「券商收最低 5 元」开关 `allocMinCommToggle`（默认勾选）、外派阶段开关 `allocExpatToggle` 与美元收入 `allocUsdIncome` / 汇率 `allocFxRate`（默认 6.78）、每只 QDII 的「本月溢价 %」输入框；产品行显示「在哪买」（场内 / 场外 / 看溢价）与「能不能买」。
- **分配顺序（v8.3）**：本月投入 = 可投现金流（收入 − 固定支出 − 机动预留；外派时收入含美元折算）**全部**，不再按目标储蓄率截断。应急罐未满（< 15000）→ 100% 进应急罐，其余步骤跳过；已满 → 启用读书基金时先按比例扣给读书基金，剩余进投资组合；投资组合内部按缺口分配（缺口 = 目标金额 − 当前金额），开启最低 5 元时只推荐缺口最大的 1～2 只。目标储蓄率只作检查：实际储蓄率低于目标时 `#savingRateWarning`（在 `#jarAllocation` 与 `#allocResult` 之间，复用 `.target-warning` 样式，`hidden` 控制显隐）显示实际值 / 目标 / 缺口，金额照分。
- **再平衡（修剪）提醒（v8.1）**：进「今日动作」。只有每年 1 月做年度修剪：显示「年度复盘：修剪 + 按汇率重算 FIRE」，并对偏离目标超过 ±5 个百分点的层给「卖多买少」的金额。**其余月份不出任何卖出建议**；某层偏低超过 5 个百分点时最多提示一句「下次发薪按分配页补这一层」，不给金额。投机层超过上限的「卖回」提醒任何月份都保留（硬上限）。**建仓期**（`buildingPhase()`：投资组合市值 < 12 个月的计划投入，或开始记账不到 6 个月）不提示层偏离。
- **回撤检查器**（`settings.drawdownInputs` / `drawdownDone`）：对宽基填「52 周最高收盘价」和「当前价格」，自动算跌幅、到第几档、转几份；1 份 = 弹药罐（现金层货币基金）当前余额 / 3。档位：标普500 -8/-15/-25% 各 1 份；A500 -10/-20/-30% 各 1 份；中证500 -15/-25/-35% 各 1 份；纳指100 -15/-25/-35% 各 0.5 份（投机层已达 10% 时不买）。执行过的档位可打勾，同一档不重复提示。
- **FIRE（v8.1）**：页面只留 13 个输入（目标年支出 90000、当前年龄 22、目标年龄 35、通胀 3%、预期名义收益 5.5%、半 FIRE 收入 0、国内月存 5000、国内月数 12、海外月存 **11000**（全年平均、已含美元补贴）、首年安家 12000、存款增长率 3%、提前回国开关 + 年数）。**参数落盘在 `settings.fire`**（`pickFireSettings` 解析、`syncFireInputs` 渲染回填、change 时 `saveFireSettings` 写回），随同步走；旧账本的 `fire*` / `usdSubsidy` / `daysAbroad` 键读到即丢弃。三条线固定 4% / 3.5% / 3%（不再有「最低线实际收益率」输入，第 1 张卡和第 3 张卡不再重复），进度条与预计达成日期统一按 3.5% 稳健线。已删除：`#fireRealReturn`、`#fireMonthlyContribution`（含 `estimateMonthlyContribution()` 与 `fallbackMonthly` 分支）、`#fireUsdSubsidy` / `#fireFxRate` / `#fireDaysAbroad`（含 `#fireSubsidyNote`）、`#fireStudyRatio`（改用分配页的启用开关与比例）。结果区给三种天气（乐观 7% / 普通 5.5% / 悲观 4%）的预计达成年龄，保留 4% / 3.5% / 3% 三条线与「今天购买力 / 目标年龄名义金额」分开显示，并加一行社保提示；`#fireRateNote` 写明实际收益率 =（1+名义）÷（1+通胀）−1。
- **首次使用引导**：所有资产都是 0 时，「今日动作」显示三步（在「资产」页的应急罐里填入已有金额 → 分配页填本月收入和支出 → 每月发薪日回来按分配结果执行）；有任何资产后自动消失。
- **规则页**：结构改三层可折叠（日常纪律默认展开 / 出海清单默认折叠，打勾状态存 `settings.tripChecklist` / 参考资料默认折叠）；顶部五行对照表 `#elementTable`；新增「更新说明」折叠块；出海清单 7 项（工资结构 / 保险条款 / 给家人的信封 / App 海外可用 / 手机号 / 银行卡 / 税务确认）。`#applyHalfFireBtn` 文案为「套用 v8.3 配置」，`#unlockBufferedBtn` 已删除。套用只更新比例 / 层级 / 代码 / 费率 / 罐子归属，**保留每只产品现有的 `buyStatus` 和 `paused:manual` 状态**（v8.2 起；此前会重置为「正常」/`available`），确认弹窗已同步文案。
- **数据迁移**：`settings.schemaVersion` 保持 8（v8.1 不加结构版本号）；打开旧账本时自动升级（v7 的 buffered 状态、旧目标比例、旧应急金默认值、旧产品表都在处理范围），迁移只执行一次，金额 / 流水 / 月度 / 联动 / 同步码一条不丢；旧版导出的 JSON 仍可导入，新版导出再导入一致。**v8.1 补一条**：启动时若本机账本缺 `settings.fire`（v8.0 账本）也会立刻落盘一次，页面提示升级到 v8.1；`checkPeerVersion` 除了 `schemaVersion < 8`，还把「云端账本缺 `settings.fire`」（= 另一台设备还是 v8.0）当作旧版，常驻黄条提示「请把另一台设备也升级到 v8.1 再同步」。**v8.2 无结构变化**：`schemaVersion` 仍为 8，账本字段一个字不动，打开即用。**v8.3 同样无结构变化**：`schemaVersion` 仍为 8；只是分配口径变了（投入金额会比以前大），历史月度记录和已保存计划不被改写。**FIRE 参数不做云端合并**（2026-10-07 用户决定关闭该待办）：另一台设备打开一次即升级到 v8.2，云端缺 `settings.fire` 只靠常驻黄条提示。
- **版本号**：页面标题 `五行理财 v8.3`；规则页「更新说明」按《说明书》任务 11 写：配置比例改 100%、四个罐子、分配顺序（应急金先行、读书基金默认关闭）、外派按币种分配、产品换低费率版本、规则量化、年度修剪、溢价输入、回撤检查器、FIRE 三种天气。

## 分配引擎不变量

- `targetSum > 0` 时用归一化权重：`asset.target / targetSum`。
- `targetSum = 0` 时建议金额为 0，并提示目标占比未设置。
- `cashflowAvailable = max(income - expense - reserve, 0)`。
- `investBase = round(cashflowAvailable)`（**v8.3 起**：可投现金流全部进分配；v8.0～v8.2 是 `round(min(cashflowAvailable, totalIncome × savingRate))`）。
- `allocatedTotal` 是实际分配出去的金额；全部偏高或去向不可用时可小于 `investBase`。
- `actualRemainingCash = max(cashflowAvailable − allocatedTotal − designatedTotal, 0)`（**v8.3 起**），其中 `designatedTotal = 等候罐(溢价 + 暂停/手动暂停) + 外派弹药罐 + 建议结汇`——这些钱都已指定去向，不算剩余现金。v8.0～v8.2 是 `cashflowAvailable − allocatedTotal`。
- `plannedInvested = allocatedTotal`，不是 `investBase`。
- 目标储蓄率只作检查（v8.3）：`actualSavingRate = totalIncome > 0 ? cashflowAvailable / totalIncome : 0`；`savingBelowTarget = actualSavingRate < savingRatePct`（带 1e-9 容差）；`savingShortfall = max(targetSaving − cashflowAvailable, 0)`，仅在低于目标时非 0。`targetSaving` 保留为参考值，不参与金额截断。
- 无手动暂停、无其他跳过、所有产品都有缺口时，应保持 `allocatedTotal === investBase`；外派模式下没买掉的美元进弹药罐 / 建议结汇，`allocatedTotal` 会小于 `investBase`，差额用 `result.balance` 核对。
- `paused:manual` 建议金额必须为 0，本月额度按缺口占比进等候罐：`suspended` 桶同时收「暂停申购」和「手动暂停」，`waitingFromSuspended = round(portfolioBudget × suspendedGap / (poolGap + suspendedGap))` 里已含手动暂停的份额，`investBudget` 相应扣减（**v8.2 起**；v7～v8.1 是分给其他产品的）。`manualPausedCash` 字段保留，含义改为「手动暂停对应的等候罐金额」（从 `waitingFromSuspended` 里按缺口占比单列）。这块钱不算进 `allocatedTotal`；**v8.3 起也不再算进 `actualRemainingCash`**（等候罐属于已指定去向，见 `designatedTotal`），不能重复相加。
- 只有 `jar: "investment"` 的产品进入 `targetSum` 与归一化；应急罐 / 读书基金 / 等候罐（`target = 0`）不参与投资组合的比例与偏离度计算。
- 目标合计 ≠ 100% 时按归一化继续计算，同时在页面顶部显示黄色提醒（`#targetWarning`，`class="target-warning"`）：「配置比例合计为 X%，系统已按合计归一化；建议调整为 100%」。层内子目标合计不等于该层目标时也要提示。
- 分配顺序：应急罐未满 → 本月可投金额 100% 进应急罐，其余步骤跳过；应急罐已满 → 启用读书基金时先按比例扣给读书基金，剩余进投资组合。
- 投资组合内部按缺口分配：缺口 = 目标金额 − 当前金额。
- 状态为「暂停申购」的产品不推荐；`buyStatus` 只影响推荐与否，不改变归一化口径。资产「状态」= `paused:manual`（手动暂停）走同一口径：建议金额 0、额度进等候罐。
- 溢价分级决定场内 / 场外 / 等候罐（见「资产配置与罐子（v8.3）」）。
- 外派阶段（v8.1）：`usdPool = min(美元收入折人民币, investBudget)`、`rmbPool = investBudget − usdPool`；美元先买美股（成长层 + 投机层），人民币给国内部分，没买掉的美元先补弹药罐再建议结汇。
- **资金守恒（v8.1，`result.balance`）**：外派模式下 `应急罐 + 读书基金 + 美股 + 国内 + 等候罐 + 弹药罐 + 建议结汇 + balance.unallocatedRmb = investBase`（±1 元取整误差）。只有「人民币池全部投出去」时七项才恰好等于 investBase；国内产品全部超目标、没有缺口时，人民币池分不掉的那部分会保留现金，单列在 `balance.unallocatedRmb`（**不是丢钱**，它留在 `actualRemainingCash` 里）。

## 重要函数

- `drawLineChart(el, series, opts)`：通用 SVG 折线图，`renderSavingChart` 和 `drawFireChart` 都调它，不要再手写 SVG。
- `isBufferedStatus(status)`：判断 `buffered` 和 `buffered:*`，不要写死 `status === "buffered"`。
- `isAvailableAsset(asset)`：分配目的地可用性判断。
- `layerCap(name)` / `speculativeCap()` / `productCap(asset)`：上限统一从数据读（`V8_LAYERS` 的 cap、产品行的 cap），不要在逻辑里写死百分比。注意 `asset.cap: 0` 表示"未设置"（会回落到产品表的 cap），目前没有编辑 cap 的入口。
- `buildingPhase()`：建仓期判断（组合市值 < 12 个月计划投入，或开始记账不到 6 个月），供 `rebalanceAdvice()` 用。
- `fireSettings()` / `pickFireSettings()` / `syncFireInputs()` / `saveFireSettings()`：FIRE 参数读写 `settings.fire`。
- `validateLedgerData(input)`：JSON 导入和云端替换前校验三个集合、记录行及已知字段类型；拒绝错误数据后不得覆盖本地账本。缺失旧版可选字段仍可归一化。
- `dataRevision`：只在内存中计数本地保存；云端读取响应到达后重新检查，读取期间有本地保存或替换则保留本地。后台读取也须重新检查编辑弹窗和待发同步状态。
- 随手记分组用无原型对象；账本字符串不能拼进 CSS 选择器，显示内容须经 `esc()`。
- `computeEffectiveTargets(assets)`：归一化后的有效目标（v8.1 起没有暂存汇入，等于 `target / targetSum`）；资产页和分配页都依赖它。
- `calcDrawdownPlan()`：回撤检查器纯函数；弹药罐 = 投资组合里的现金层（货币基金）可用市值，1 份 = 弹药罐余额 / 3；读 `settings.drawdownInputs[assetId] = { high, price }`，返回每只宽基的跌幅、第几档、份数与金额；`settings.drawdownDone[assetId_pct]` 记录已执行档位，只显示建议，不写任何数据。`DRAWDOWN_RULES` 只含标普500 / A500 / 中证500 / 纳指100 四只宽基。v8.0 已没有「机会补仓检查」，它被回撤检查器取代。
- `calcAllocation(inputs)`：核心分配引擎。
- `calcFire(inputs)`：FIRE 测算读取 `totals()` 的当前资产，不写 data；含达成日预测、灵敏度、三条固定提款线（4% / 3.5% / 3%）、国内/海外两段月存与首年安家支出、三种天气（乐观 7% / 普通 5.5% / 悲观 4%）、每年存款增长率、读书基金比例扣除（`inputs.studyRatioPct`，由 `getFireInputs` 从分配页设置换算）和「外派 N 年后回国」情景。
- `projectMonthsToTarget(...)` / `projectMonthsToTargetPhased(...)`：月度复利滚动求达成月数；v8.0 用**实际购买力口径**——目标固定为今天的购买力，月存按每年存款增长率（扣除通胀后）抬升，不再让目标随通胀上移；80 年内不可达返回 `reachable:false`。
- `fireHistorySeries()` / `drawFireChart(...)`：从月度 `monthEndAssets` 取历史净值，纯 SVG 画历史实线 + 预测虚线 + 目标线。

## 功能与恢复说明

各页面用途、FIRE 假设、数据备份、月度记录保留策略（v8.0 起不再裁剪最老月份，只补未来空白月）和换设备顺序统一见 [使用说明.md](使用说明.md)。规则层不再重复页面操作清单。

## 不要做

- 不引入构建工具、测试框架或前端框架。
- `使用说明.md` **被 git 跟踪**（`git ls-files` 能看到），文件里有用户的收入 / 储蓄数字。v8.2 已删掉 `.gitignore` 里那一行（那行对已跟踪文件本来就不生效，`git check-ignore` 也不认），所以忽略规则不再掩盖这个事实。**保持跟踪，不做 `git rm --cached`**（2026-10-07 用户决定关闭该待办）；仓库可见性由用户自己控制（改成私有）。
- 不改云同步后端 schema（CF D1 `user_data` 表 / Worker 接口），除非用户明确要求。
- 不做短视频比例照搬，不改 v8.0 配置为 40/40/20。
- 不接行情 API，不自动判断回撤（回撤检查器只用用户手填的 52 周高点与现价），不把回撤/机会补仓建议写入 `entries/invested/plannedInvested/value`。
- 不加虚拟币、杠杆、初创股权、买房建议相关逻辑。
- 不让 `phase/channel` 之类展示字段隐式影响 `calcAllocation`。

## 同步边界

- **两条铁律（2026-10-07 线上实测）**：① 云同步是**整份账本**按时间比较后替换，**后写覆盖先写、不合并**——两台设备各自离线改过的内容，最后只留下最后一次保存的那份；② 因此**同一时间只在一台设备上记账**，换设备前确认上一台同步完成、新设备拉取后再编辑。下面各条都是这条的实现细节。
- 客户端按时间比较并替换整份账本，没有逐笔合并不同设备的离线改动。2026-09-30 已在本机复现原 Worker 先查询后无条件 UPSERT 的保存竞态；仓库里的补丁**不部署**（见下条），靠「同一时间只在一台设备记账」规避。
- Worker 待发布补丁用单条条件 UPSERT 同时约束相同身份 hash 和更新时间；空 hash 旧记录仍拒绝客户端认领。拒绝坏账本、无效时间或超前超过 5 分钟的时间，不自动重置已有云端时间。相同时间戳仍允许后写覆盖，不能当作离线合并。
- **Worker 补丁部署已关闭**（2026-10-07 用户决定）：不要再尝试部署，也不要报告「已修复线上 D1」；同步竞态靠「同一时间只在一台设备记账」规避。官方 Wrangler 仍在 `E:\Tools\wuxing-worker-cli`，仅作历史留档。
- 导入同步码先用候选身份读取并校验目标账本，失败或目标不存在时保留原身份/账本；本机待发或在途保存时禁止切换，校验期间本地有改动则取消切换。
- 云端读取及保存响应须匹配发起时的同步码，且更新时间有效；旧身份的迟到响应不得更新当前账本或同步元数据。
- 同步码切换先准备并序列化候选账本和元数据，再与两个身份键一起写入；写异常时逆序回退已写键，全部成功后才更新内存。此保护不保证断电或进程终止时的多键原子性。
- 本机账本与对应元数据都写入成功后才更新已提交快照；普通保存失败须恢复内存与已写键，回退失败则暂停写入和云同步。防抖、切走刷新和立即同步只发送已提交快照。非关键的上次记账类型偏好不得阻断账本保存。
- 记账默认日期和月度归属均按设备本地日期生成；云同步元数据仍使用 UTC ISO 时间戳，不能混用两种口径。
- 读取本机账本或元数据异常时明确提示并停止写入及自动同步，不把失败读取当作首次使用，也不允许导出默认空账本作为备份。保存失败不得关闭编辑弹窗或显示已保存。
- 日常固定一台设备编辑；换设备前确认上一台同步完成，新设备拉取后再编辑。若两台都离线改过，先分别导出 JSON 留存，再决定使用哪份。
- 2026-10-07 线上双设备回环实测（脚本 `E:\DP\_wuxing-build\sync\two-device.py`，结果 `two-device.json`，v8.3 起构建目录合并到这里）：v8.0 站 13 项全过、v8.1 站 14 项全过（含「B 拉到的账本带 `settings.fire`」，即 v8.1 的 FIRE 参数确实随账本同步）。A→B、B→A 都能拉到；两边离线各改一笔后联网**不自动合并**——云端保持冲突前版本，两台各自保留本地值，重新保存时后写覆盖先写、先保存的那份丢失；离线保存失败会写 `meta.lastSyncError`，恢复网络后需再保存一次才上推。
