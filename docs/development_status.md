# Development Status

## 当前阶段与下一阶段

2026-10-04：第 11 阶段“美术资源接入与视觉优化”的必做项及基础反馈已核对、补齐并验证。正式美术精修和更丰富的表现继续迭代。

- [第 11 阶段实施计划与下一阶段行动方案](art_implementation_plan_stage11.md)
- [逐项验收和修复记录](stage11_art_audit.md)
- [美术资源接入与替换流程](art_pipeline.md)
- [资源来源登记](art_credits.md)

下一阶段为 **第 12 阶段：前端 UI 界面优化与技能动画完善**。当前仅明确这两项目标，具体视觉、交互、技能范围与验收要求等待用户后续提供。


## Completed

- Phase 1: project skeleton, data schemas, API contracts, SQLite character table, seed characters, seed maps and skills.
- Phase 2: map legality, occupied cells, orthogonal movement, AP spending, basic attacks, damage and critical hits.
- Phase 3: speed-based turn queues, join-order ties, temporary AP lifecycle, extra next-round turns, summon next-round eligibility, dead entity exclusion.
- Phase 4: `SkillTemplate`, one-use `SkillInstance`, effect dispatch engine, single-target validation, directional line targeting, and the temporary MVP `bomb` skill that deals 10 fixed damage.
- Phase 5: action-start status engine for stun, burn, delayed damage, and temporary stat modifiers.
- Phase 6: alliance links, temporary alliance ticking, transitive alliance grouping, ally attack prevention, and victory detection when one alliance group remains.
- Phase 7: treasure digging, luck-based success, one-use treasure points, failure damage, monster counterattacks, monster kill rewards, character kill reward choices.
- Phase 8: summon effect, legal empty-cell summon validation, owner alliance through `ownerId`, next-round queue participation, summon death handled by normal defeat flow.

## Rule Boundary

Frontend and CRUD code may call API routes, but must not duplicate core rules. The authoritative modules are under:

- `backend/app/game`
- later effect engine modules under `backend/app/game/skills`
- later status modules under `backend/app/game/status`
