# Director 框架实战审计（2026-07-18）

方法：6 个并行审计 agent 通读了 2026-07-11 ~ 07-18 期间用过 director prompt 的 10+ 场会话（约 1.2 万条 transcript 消息，全部 100% 读取），加上 AiNote / photome 两仓 `.tasks/` 控制面、tmux socket、git worktree 的现场取证。本文件是完整存档；结论已同步给用户。

## 一、实战档案

| 会话 | 日期 | 仓库 | 内容 / 规模 |
|---|---|---|---|
| b72a8a81 | 07-12 | AiNote | UserLexicon 调研，v1 prompt 首战（Composer steward 文本） |
| 9b54c403 → f4a3504f | 07-12~13 | AiNote | UserLexicon 实施双场（v1→v2 过渡；T1–T5 + t6–t17；Fable 限额中断后续接） |
| 5d588077 谱系（4 个 fork 分支，含 0de6257b、b9721ced） | 07-12~15 | AiNote | 批量转录 + 配额/Paywall（t1–t10 两波；一次自动 compaction + 三次 fork） |
| afdfab5d | 07-16 | AiNote | 批量转写语言 + Soniox 兜底（t18–t27） |
| 70aeca49 | 07-13 | photome | 生成式 UI（框架三次粘贴均被打断，未启动；留 5 项清单给下一场） |
| 04ac311e | 07-14~17 | photome | App Store 上架 + 15 语言截图（T1–T12、t6 系列大规模返工） |
| 37d5393c | 07-16 | photome | 联程航班 UI（t20–t36b；结尾断头） |
| e01ec1f1 | 07-17~18 | AiNote | MOSS 主力迁移（t50/t51；含 28 小时框架失效段；审计时仍在跑） |
| d395db6b / bb87c4f0 / b1dd1a9a | 07-13/16/15 | — | 框架开发与复盘场（CC 变体设计、Lane C/ACP 落地、历史复盘） |

规模：主仓现存 141 个 brief（AiNote 46 / photome 95，另有约 10 个随 worktree 删除蒸发）；任务号推进到 t41 / t38f；9 个 tmux socket、60+ 个 done- 会话至今存活。

框架收益是实测真实的（修问题不是推翻方向）：上下文峰值 390–600K vs 亲自实现的 830–990K；交叉审查/证据门禁抓出 ≥8 个真 bug、两次识破 worker 伪造证据（假截图、假测试报告）；"哨兵在、报告缺 → 查 log → 定时重派"等兜底真实救过场；spawn_task 芯片一旦被用上，跨会话衔接立刻改善。

## 二、六大痛点判定

### 1. 任务追踪缺失 —— 证实，且是最多事故的共同根因

- AiNote `t32/t33-brief.md`（07-16 23:54 写）从未登记 STATE.md、从未派出、无 log——写完即被遗忘（磁盘实证）。
- MOSS 场口头任务"完成后去看一下隔壁 fastlane 修得怎么样，回来汇报"未登记、未执行。
- t6 发现的并发导入 UX 问题，director 问"要不要派个小任务修掉？"，用户回"retry"（答的是别的事），此事从此消失，跨两场无人再提。
- FCM_SERVICE_ACCOUNT_AMYNOTE secret、document-type 注册、OpenRouter 透传验证、watch.sh 阈值修复（两次"收工时确认"）全部蒸发。
- STATE.md 三宗罪：**过期**（photome t35/t36/t36c 磁盘 .done 已落、表里永远 running；MOSS 场脱节 30 小时；表头 socket 是旧的）；**膨胀**（29–59KB 多会话叠层日志，6 列表格装不下"起因/来龙去脉"，director 们自发发明 HANDOFF/DECISIONS/RISK_ACTION_PLAN/E2E_TEST_PLAN/.director-socket）；**易失**（阶段 A 整套台账随 worktree 删除蒸发；t 编号三次断裂/撞号）。
- 跨会话无"盘点遗留"步骤：上一场设计文档已写明的结论（Soniox 兜底方案）下一场重新调研一遍；"QA 服务端改动会被下次 wrangler deploy 静默带上生产"的警告被下一场部署无人知晓地消化。
- 真实断点上的恢复（compaction ×1、fork ×3、换账号 ×1、API 死 ×N）全靠用户人脑 + git log 考古 + Claude memory；STATE.md 恢复路径零出场——有一次系统甚至把 STATE.md 自动附进续接上下文，director 没读。

### 2. subagent 不稳定与任务遗忘 —— 证实

- v1 steward 时代：Haiku steward 提前收工（"monitor 在看着了"即结束）、抓 1.3KB 不全、全树 diff 冤枉 worker 报 CRITICAL DEVIATIONS；用户被迫下场纠偏："不要用 Haiku 这种模型，至少用一个 Sonnet 5 去盯着 session 吧"。
- v2 worker 侧：t6r 挂死 111 分钟；t20 首跑 70 分钟零输出；Codex 因用户本地 `~/.codex/hooks.json`（`unknown variant 'http'`）**启动挂死 5 次**，每次烧掉 45–70 分钟 watcher 窗口，后来发明"90 秒启动看护"止血；t21 启动瞬态卡 30 分钟，靠用户问进展才发现；Grok Lane C 405 崩跨场三例（t28、t50、t51）且不落 ERROR 哨兵、bridge 进程可能挂活；send-keys 首字符被 oh-my-zsh 升级提示吞掉 → t34 静默晚启动约 40 分钟。
- 结构性盲区：watch 只有"完成/超时/空闲"三态，没有"启动失败"探测；崩溃不保证哨兵；Lane B 重派会丢模型参数（实测落到默认模型）。

### 3. 主会话（规划）阻塞 —— 部分证实

- 纪律好的场次响应是秒级的（用户"什么进展了"，29 秒全景汇报）——机制本身可用。
- 三种真实阻塞形态：① MOSS 场 director 段是一个 25+ 分钟巨型前台 turn（派发→验证→405→重派→就绪轮询全在一个 turn 里，watch.sh 一次都没跑起来）；② compaction / prompt 失效后的 17–40 分钟前台亲做 turn；③ API stall 假死，靠用户"继续"人肉唤醒（≥5 次）。
- 根因：Lane B 启动就绪靠前台轮询；长门禁（xcodebuild、xcstrings 重序列化）设计上就在前台；纪律随上下文衰减。

### 4. Codex gpt-5.6-sol 高 effort 慢 —— 证实，且不止是慢

- 长静默是 watchdog 误报第一来源（冷编译/长推理静默数分钟）；t1 基准 105 分钟；图生成 ~1hr/locale；t6b2 跑约 2M token 后死于容量墙；"reproducibly stuck right after the hooks warning"（间歇性全局容量问题）；codex-acp 0.16.0 内核直接拒绝 sol；单场配额 75%→64%→17%。
- 换 GPT-5.3-Codex-Spark 的教训：独立配额池、便宜，但上下文小（两次首跑零产出）+ 质量低 → 一个 UI 细节 8 轮 ping-pong，brief 被迫写到"手把手/写死布局"，"编排开销逼近亲自实现"。用户点破："你作为 Fable 主模型，应该去 review 一下，然后去指导这些小模型"。
- 隐性缺口：框架从未记录任务耗时（dispatched/finished 时间戳），路由无法从数据学习。

### 5. 多模型协作未用好 —— 证实；"全面禁 subagent"应改为角色政策

- prompt 失效期的实践反证了价值：Explore 摸底、7-agent 研究 Workflow（99 万 subagent token）、278K token 实现 agent 都真实有效；也有翻车——director 照抄 subagent 错误结论被用户抓包（"和事实有很大的出入"），故需"核实后采纳"纪律。
- "no subagents at all"的原始理由（Cursor token 经济学 + 廉价 steward 失职）在 Claude Code 语境只对一半：**实现**继续走 CLI 订阅（结构性省 token 是实测结论），但**侦察/判读/摘要/台账对账**用 Claude 侧分层模型（Sonnet 体力、Opus/Fable 关键审查）是合理的。
- worker 侧同理需要分层表：sol high=难题、sol medium=常规、spark=机械大批量（配手把手 brief）、grok-build=并行吞吐；terra/luna 待实测入表。

### 6. API 报错导致 director 中断 —— 证实：几乎每场都有

- "API Error: Connection closed mid-response" 出现在所有 director 会话；另有 "Response stalled mid-stream"、529。
- 额度硬切断吃掉 3 次会话收尾（一次停在"派吗？"，任务悬空靠次日续场兜住）；一次触发"换账号续接"，director 手工发明 HANDOFF 文档交接。
- 连环死实录（MOSS 场）：审计 subagent 被 API error 打死 → director 重派 turn 又被同一错误截断 → **重派静默没发生**，直到用户"好，继续"。
- Fable 工具调用格式劣化：`<invoke>` 碎片泄漏 10+ 次、用户投诉 ≥6 次，直接堵住派发与 review（"150 个 blog 文件没逐一 review——几次想看都被格式错误打断"）。
- 好消息：磁盘事件（.done/report/log）不随 director 死亡丢失——自愈原料一直在，缺"醒来先对账"仪式。

## 三、审计额外发现（按严重度）

1. **Lane A 完成信号 bug**：`… | tee log; echo EXIT=$? >> .done` 记录的是 tee 的退出码。两场独立复现（t16 启动失败 .done 仍 EXIT=0；photome 凭假 EXIT=0 把 broken build 提交进 main）。修复：PIPESTATUS / pipefail。
2. **watch.sh 经济学破产**：exit 2 误报 ≥12 次、真阳性≈0；三类场景系统性失效（Codex 长推理静默、grok headless 全缓冲不流式、长图生任务）。实战已自发收敛为"哨兵-only + log 体积停滞 + 启动看护 + 双信号"，从未回流协议。阈值 4→10 的建议从 07-13 挂到现在仍是注释。
3. **交叉审查纪律**：只有用户点名才稳定执行；"另一家 CLI 配额耗尽怎么办"无条款 → 整场静默降级自审（其中一次自审放行了 broken commit）。t39 案例暴露审查缺"部署路径核验"维度：gate 全绿 + 交叉审通过，但改动写进错误副本从未部署，一天后生产事故才发现。
4. **配额语义从未钉死**：Grok "Weekly limit: N%" 两场得出**相反**解读——一场按"剩 19%"整周雪藏其实空闲的 Grok（单 CLI 成为瓶颈、交叉审死亡），另一场"我把百分比读反了……Grok 只剩 9%"把任务灌给见底的 Grok。quota.json 应存原始字符串 + 显式语义 + 验证方式。另：probe 被 brew 自动升级劫持过（→UNKNOWN）；5h 滚动窗只在波次开头查、中段撞墙（t8，靠定时重派兜底——该模式值得固化）。
5. **纪律不持久（最大结构性问题）**：prompt 只活在被贴入的上下文里。同一会话 28 小时框架失效（亲自实现 + 大量被禁的 subagent），用户手动重贴才恢复；compaction 摘要里带着 HARD RULE 原文，压缩后第一个动作仍是亲自改生产代码，其后 26 小时 11 次提交/部署全部亲做。协议需要落盘（.tasks/PROTOCOL.md + CLAUDE.md 引导行："存在 .tasks/STATE.md 即按协议行事"）。
6. **生命周期卫生从未执行**：审计时刻仍存活 9 个 socket（最老 07-11）、60+ done- 会话、上周日启动至今的 grok TUI worker 进程（累计 CPU 14:45）、photome 3 个残留 worktree（其一还开了分支，违反 no-branches）、MB 级日志堆积（t41.log 4.8MB、t36.log 9.7MB）。"Wrap up: kill-server" 在全部场次均未执行。
7. **HARD RULE 缺高危例外**：DECISIONS.md D9 记录了一次理性违规（生产镜像 cutover 亲自驱动，理由充分）。应正式化：不可逆/生产操作允许 director 亲驱，条件=事先声明 + 逐步自验（或用户点头）。
8. **并行 director 互相踩**：专用模拟器被隔壁会话删除（两例）、任务号撞名需人肉查"隔壁 director"、并行 QA 提交弄坏真机构建、patch 交接竞态漏掉源会话最后一笔（靠临场谨慎救回）。
9. **秘密卫生**：HANDOFF 文件内躺着明文 Docker PAT；谱系内 key 明文进 chat ≥3 次。brief/handoff 应引用 secret 路径（如 API/.secrets/），永不内联值；wrap-up 加密钥扫描。
10. **杂项腐烂**：prompt 仍写已下线的 grok-4.5（07-15 实测只剩 grok-build）；claude -p 需 Node ≥20 每场重踩；brief 相对路径在 worktree 隔离下二义（t18 报告写错位置）。

## 四、修正优先级

### P0 — 小改动，立即生效

1. Lane A wrapper 用 `${PIPESTATUS[0]}` 取真实退出码。
2. 重写 watch.sh：`.done` 哨兵 + log 体积停滞检测（主信号）+ pane-hash（辅助，阈值 10）+ 启动看护（派发后 90 秒 log/pane 双无变化 → exit 3 "启动失败"）。
3. Lane C 崩溃 SOP：bridge 加心跳/trap 保证 ERROR 哨兵必落；"transport error → Lane B 重派"标准步骤（带完整模型参数 + brief 标注已完成进度防重复 commit）。
4. 清除 grok-4.5 残留；Quota 段写死各 CLI 读数语义，quota.json 存原始字符串；长任务派发前复查 5h 窗；配额死亡 → 定时重派模式入协议。
5. 交叉审查退路条款：另一家不可用 → 明示降级并记入台账（禁止静默自审）；review brief 模板加"部署路径/入口核验"。
6. HARD RULE 增补：高危不可逆操作例外（声明 + 逐步自验）；"侦察/判读/摘要类只读 subagent 允许"例外。

### P1 — 结构性改造

7. 台账三件套取代单一 STATE.md：**TASKS.md**（机器可查表：id | origin 原话 | goal | agent/lane | status 枚举 | evidence 路径 | dispatched/finished 时间）+ **JOURNAL.md**（append-only 决策与事件）+ **HANDOFF.md**（标准化断点交接，额度 ≥80%/换账号/长会话必写）。`.tasks/` 永远在主仓，绝不进 worktree。
8. 三个仪式：**Intake**（任何用户请求或新发现问题，当 turn 登记台账行——包括口头小事，不派也要有 queued/blocked 状态）、**Reconcile**（每次醒来/开场第一动作：diff 台账 vs .done/report/tmux，纠 drift、认领孤儿事件）、**Wrap-up**（遗留清单落台账 + kill-server + worktree/日志/密钥清理 checklist）。
9. 协议落盘：init 时写 `.tasks/PROTOCOL.md`，目标仓库 CLAUDE.md 加一行引导——解决 compaction/续接/换账号后的纪律失效。
10. subagent 角色政策 + 模型分层表（见痛点 5）；任务耗时入台账供路由学习。
11. 非阻塞硬化：Lane B 启动脚本化（后台等 TUI ready 再送 brief）；前台 shell 预计 >60s 一律转 tmux 后台；派发后必须 END turn。

### P2 — 可选基建（"prompt 工程 vs 软件项目"边界，用户拍板）

12. cron/scheduled-task 外部看门狗：检测"在飞任务超期无人认领 / director 无活动" → 系统通知（补上"director 死了很久才被发现"的最后一环）。
13. 并行 director 登记（占用 sim/worktree/仓库的声明文件）。
14. 日志轮转 + wrap-up 密钥扫描。

## 五、本仓库眼前家务

- 工作区 4 文件未提交改动 = 07-16 Lane C/配额路由会话的产物，原话"你过目后要提交我再来"，仍在等。
- `a8e8ab9` 当时被顺带 push，无人追认。
- 9 socket / 3 worktree / 上周的 worker 进程仍活着，清理需用户批准。
