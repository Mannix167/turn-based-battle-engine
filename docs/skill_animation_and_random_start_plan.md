# 技能动画与开局随机逻辑改造方案

## 1. 技能动画/特效的高性价比方案

最简单且效果比较好的方案是：后端只返回“战斗事件”，前端用 CSS 动画 + 少量配置表渲染特效。

推荐做法：
- 后端在 `GameStateRead` 中继续扩展事件列表，例如 `recentDamageEvents`、`recentSkillEvents`。
- 每个技能模板增加可选表现字段，例如 `visualKey`、`impactColor`、`trailType`、`soundKey`。
- 前端维护一个 `visualKey -> 动画组件/CSS class` 的映射表。
- 常见动画用 CSS 实现：受击抖动、治疗上浮、爆炸圆环、激光扫线、锁链连接、暴击闪白。
- 少数复杂特效再用 Canvas overlay，例如范围爆炸、轨迹粒子、连线光束。

性价比最高的第一阶段：
1. 给技能模板增加 `visualKey`，不影响规则。
2. 前端地图上加一个绝对定位的 `BattleEffectsLayer`。
3. 技能释放后，根据后端事件在格子坐标之间播放动画。
4. 所有动画 600ms 到 900ms 内结束，不阻塞 API 结算。

建议的 `visualKey`：
- `slash`：普通斩击
- `blast`：爆炸/炸弹
- `heal`：治疗
- `laser-line`：直线激光
- `chain-link`：铁索连环
- `buff-up`：属性提升
- `curse`：诅咒/处决

不建议一开始就做：
- 每个技能单独写复杂组件。
- 把规则等待动画播放完成后才结算。
- 用大量 GIF 或视频资源堆特效。

这样后端规则保持纯净，前端表现可迭代，新增技能只需要选择一个已有视觉 key。

## 2. 开局随机逻辑前置方案

目标：所有随机逻辑都移动到游戏开始前，由配置决定本局会出现什么。进入战斗后，规则只消费已经确定好的内容。

### 2.1 击杀奖励随机池

当前方向：
- 打死怪物或角色后随机获得技能。

建议改造：
- 在开局配置页增加“奖励技能池”。
- 默认选择所有 `usableAs` 包含 `reward` 或 `common` 的通用技能。
- 用户可以取消某些技能，让本局奖励只从指定技能池中抽取。
- 开始游戏时后端把奖励池固化到 `GameState`。

后端数据建议：
```ts
StartGameRequest {
  rewardSkillPoolTemplateIds: string[]
}

GameState {
  rewardSkillPoolTemplateIds: string[]
}
```

击杀时：
- 不再从全局技能表实时随机。
- 只从 `state.rewardSkillPoolTemplateIds` 里抽取。
- 如果池为空，返回无奖励或固定兜底技能。

### 2.2 自定义小怪

新增小怪模板系统：
```ts
MonsterTemplate {
  id: string
  name: string
  description: string
  portraitImageUrl?: string
  tokenImageUrl?: string
  maxHp: number
  baseAttack: number
  baseDefense: number
  attackRange: number
  tempApPerTurn: number
  speed: number
  critRate: number
  luck: number
  skillTemplateIds: string[]
}
```

需要新增：
- 后端表：`monster_templates`
- 后端 API：`/api/monsters/templates`
- 前端页面：小怪编辑器
- 地图编辑器固定小怪选择模板，而不是只填字符串

### 2.3 地图只保存固定内容和随机规则

地图中保存：
- 固定小怪
- 固定藏宝点
- 随机规则

随机规则建议：
```ts
MapRandomRule {
  id: string
  type: "monster" | "treasure"
  countMin: number
  countMax: number
  allowedCells: Position[]
  excludedCells: Position[]
  templatePool: string[]
  allowOverlapTreasure: boolean
}
```

开局时生成：
- 根据随机规则确定本局固定的小怪/藏宝点。
- 生成结果写入 `GameState.entities` 和 `GameState.treasures`。
- 战斗过程中不再随机生成新怪或新藏宝点。

### 2.4 开局预览

前端设置页增加“随机预览”：
- 显示本局奖励技能池。
- 显示根据规则生成的小怪/藏宝点预览。
- 用户可以点击“重新随机”换一版。
- 点击“开始游戏”时，将当前预览结果提交给后端，或者提交 seed 让后端复现。

推荐方式：
- 后端提供 `POST /api/game/preview-start`。
- 返回 `startSeed` 和预览实体。
- 真正开始时提交同一个 `startSeed`。

这样可以兼顾可预览、可复现、规则一致。

### 2.5 实施顺序

1. 新增小怪模板 CRUD。
2. 地图固定实体从字符串模板改为引用小怪模板。
3. StartGameRequest 增加奖励技能池和随机 seed。
4. 后端开局时展开随机规则，固化本局结果。
5. 前端设置页增加奖励池选择和随机预览。
6. 移除战斗中依赖全局随机池的奖励逻辑，改读 `GameState` 固化池。

这套方案的核心原则是：开局随机，战斗确定；配置可视化，结算可复现。
