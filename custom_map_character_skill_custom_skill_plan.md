# 功能完善方案：自定义地图、角色特定技能、自定义技能系统

## 1. 文档目标

本文档用于指导 Codex 在现有游戏整体逻辑已经完成的基础上，继续完善以下 3 个功能：

1. 增加 **自定义地图** 功能：支持自定义地图大小、形状、格子启用/禁用、初始部署区域、小怪与藏宝点配置。
2. 完善 **新增角色时配置角色特定技能** 的流程。
3. 完善 **技能列表**，并增加 **自定义技能** 功能。

本阶段的核心目标是：

> 让游戏从“固定规则的战斗 demo”升级为“可以自己创建地图、角色、技能的可扩展战棋沙盒”。

---

## 2. 总体设计原则

### 2.1 不破坏已有核心逻辑

本阶段不能重写已有的：

- 回合系统
- 行动点系统
- 速度排序
- 普攻逻辑
- Buff 机制
- 结盟系统
- 胜负判定
- 小怪反击
- 藏宝点收益
- 召唤物基础逻辑

本阶段应在现有架构上扩展：

- 地图数据来源从“固定地图”变为“可配置地图”。
- 角色数据从“固定技能字段”变为“可选择技能实例 / 技能模板”。
- 技能数据从“仅代码内置”扩展为“内置技能 + 配置型自定义技能”。

### 2.2 前端只做编辑与展示，规则校验仍由后端负责

前端可以做基础表单校验，但最终规则必须由后端校验。

例如：

- 地图是否合法
- 初始位置是否在有效格子上
- 技能配置是否合法
- 角色技能是否存在
- 自定义技能是否能被引擎识别
- 技能目标类型和效果组合是否合法

都应由后端最终判断。

### 2.3 技能系统必须继续保持 Effect Engine 思路

新增自定义技能后，不能让用户直接写任意代码。

应该采用：

```text
技能模板 SkillTemplate
  + 目标规则 TargetRule
  + 范围规则 RangeRule
  + 影响区域 AreaRule
  + 效果列表 Effect[]
```

复杂技能通过预设 Effect 类型组合实现。

只有极少数无法配置的特殊技能，才允许在代码中注册 `customHandler`。

---

# Part A：自定义地图功能方案

## 3. 自定义地图功能目标

玩家可以在网页端创建、编辑、删除地图。

地图支持：

1. 设置地图宽度和高度。
2. 通过启用 / 禁用格子来设置地图形状。
3. 一个格子可以是有效格子或无效格子。
4. 有效格子可以放置角色、小怪、藏宝点。
5. 无效格子不可移动、不可攻击、不可部署、不可作为技能目标。
6. 支持配置初始部署区域。
7. 支持配置小怪随机生成规则。
8. 支持配置藏宝点随机生成规则。
9. 支持手动放置小怪和藏宝点。

---

## 4. 地图数据模型设计

### 4.1 MapTemplate

建议新增地图模板模型：

```ts
interface MapTemplate {
  id: string;
  name: string;
  description?: string;

  width: number;
  height: number;

  cells: MapCell[];

  spawnZones: SpawnZone[];
  fixedEntities: MapFixedEntity[];
  randomRules: MapRandomRule[];

  backgroundImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 4.2 MapCell

```ts
interface MapCell {
  x: number;
  y: number;

  enabled: boolean;

  // 第一版暂时不做复杂地形，但保留字段
  terrainType?: "normal";

  // 前端展示用，可选
  tileImageUrl?: string;
}
```

说明：

- `enabled = true` 表示这个格子存在。
- `enabled = false` 表示这个格子不存在，相当于地图形状被挖掉。
- 移动、攻击、技能目标、小怪生成、藏宝点生成都必须基于 enabled 格子。

### 4.3 SpawnZone

```ts
interface SpawnZone {
  id: string;
  name: string;

  cells: Array<{ x: number; y: number }>;

  // 用于区分部署用途
  type: "player" | "neutral" | "custom";
}
```

说明：

- 初始站位阶段，角色只能放到指定 SpawnZone 中。
- 由于游戏初始默认无队伍，`type` 主要用于 UI 分类，不影响联盟逻辑。
- 第一版可以默认只有一个 `player` 部署区。

### 4.4 MapFixedEntity

用于地图中固定生成的小怪或藏宝点。

```ts
interface MapFixedEntity {
  id: string;
  type: "monster" | "treasure";
  templateId?: string;
  x: number;
  y: number;
}
```

说明：

- `type = monster` 时，`templateId` 对应小怪模板。
- `type = treasure` 时，`templateId` 对应藏宝点模板，可选。

### 4.5 MapRandomRule

用于小怪和藏宝点的随机生成。

```ts
interface MapRandomRule {
  id: string;
  type: "monster" | "treasure";

  count: number;

  allowedCells?: Array<{ x: number; y: number }>;
  excludedCells?: Array<{ x: number; y: number }>;

  templatePool?: string[];
}
```

说明：

- 如果 `allowedCells` 为空，则默认从所有 enabled 且未被占用格子中随机。
- 如果设置了 `allowedCells`，则只能在这些格子中随机生成。
- `excludedCells` 用于排除部署区、核心区域等。

---

## 5. 自定义地图编辑器 UI 设计

### 5.1 地图列表页

功能：

- 查看已有地图
- 新建地图
- 编辑地图
- 复制地图
- 删除地图
- 设置默认地图

每张地图展示：

- 地图名称
- 尺寸，例如 `10 x 10`
- 有效格子数量
- 固定小怪数量
- 固定藏宝点数量
- 最近更新时间

### 5.2 地图编辑页

页面布局建议：

```text
左侧：工具栏
中间：地图网格编辑区域
右侧：地图属性 / 当前选中格属性
底部：保存、预览、校验按钮
```

### 5.3 工具栏模式

地图编辑器需要支持以下编辑模式：

1. **启用格子模式**
   - 点击格子切换 enabled / disabled。
2. **部署区模式**
   - 选择多个格子加入部署区。
3. **放置小怪模式**
   - 在有效空格上放置小怪。
4. **放置藏宝点模式**
   - 在有效空格上放置藏宝点。
5. **擦除实体模式**
   - 删除格子上的小怪或藏宝点。
6. **随机规则配置模式**
   - 设置小怪 / 藏宝点随机生成数量和范围。

### 5.4 地图大小和形状

用户新建地图时填写：

- 地图名称
- 宽度 width
- 高度 height

进入编辑器后，通过点击格子设置形状。

例如：

- `10 x 10` 的矩形地图中，可以禁用部分格子形成 L 形、十字形、环形地图。
- 地图逻辑上仍是 width x height 的坐标系，但只有 enabled 格子可用。

### 5.5 地图合法性校验

保存地图时，后端必须校验：

1. 宽度和高度必须大于 0。
2. 至少存在 1 个 enabled 格子。
3. 固定小怪和藏宝点必须在 enabled 格子上。
4. 固定实体不能重叠。
5. 部署区格子必须是 enabled。
6. 初始部署区至少要能放下玩家选择的角色数量。
7. 随机生成规则不能要求生成数量超过可用格子数量。

建议额外校验：

- enabled 格子是否连通。

第一版可以只做提示，不强制要求地图连通。

---

## 6. 地图与战斗初始化的关系

### 6.1 开局流程调整

原流程：

```text
选择地图
↓
选择角色
↓
选择通用技能
↓
选择初始位置
↓
开始战斗
```

现在地图支持自定义后，流程保持不变，但地图来源变成数据库中的 MapTemplate。

### 6.2 BattleMapSnapshot

开始游戏时，不应该直接修改 MapTemplate，而应该生成一份战斗快照。

```ts
interface BattleMapSnapshot {
  battleId: string;
  width: number;
  height: number;
  cells: MapCell[];
  entities: BattleEntity[];
}
```

说明：

- MapTemplate 是编辑器中的模板。
- BattleMapSnapshot 是某一局实际使用的地图副本。
- 小怪、藏宝点、角色、召唤物都放在 BattleMapSnapshot 里。

---

## 7. 地图相关 API 设计

### 7.1 地图模板 API

```text
GET    /api/maps
POST   /api/maps
GET    /api/maps/{mapId}
PUT    /api/maps/{mapId}
DELETE /api/maps/{mapId}
POST   /api/maps/{mapId}/duplicate
POST   /api/maps/{mapId}/validate
```

### 7.2 地图预览 API

```text
POST /api/maps/preview-random-generation
```

用途：

- 根据地图随机规则生成一次预览。
- 不真正开始战斗。
- 让玩家查看小怪和藏宝点大概会怎么分布。

---

# Part B：角色特定技能配置方案

## 8. 角色特定技能的定位

虽然当前设定中 **所有技能都是一次性技能**，但技能仍然分为两类：

1. **角色特定技能 character skills**
   - 代表角色身份特色。
   - 新建角色时配置。
   - 每局开始时默认携带。
   - 使用一次后消失。
2. **通用技能 common skills**
   - 开局前可选择。
   - 局内通过挖宝、击杀、小怪奖励等获得。
   - 使用一次后消失。

重要规则：

> 角色死亡后，击杀者只能从其未使用的通用技能中选择一个，不能继承角色特定技能。

---

## 9. 角色数据模型调整

### 9.1 CharacterTemplate

```ts
interface CharacterTemplate {
  id: string;
  name: string;
  description?: string;

  maxHp: number;
  baseAttack: number;
  baseDefense: number;
  speed: number;
  critRate: number;
  luck: number;
  temporaryApPerTurn: number;
  attackRange: number;

  mapSpriteUrl?: string;
  portraitUrl?: string;

  characterSkillIds: string[];

  createdAt: string;
  updatedAt: string;
}
```

### 9.2 BattleCharacter SkillInstance

开局时，根据角色模板生成战斗角色。

角色特定技能应转化为 SkillInstance：

```ts
interface SkillInstance {
  instanceId: string;
  templateId: string;
  sourceType: "character" | "common" | "reward" | "summon";
  ownerEntityId: string;
  used: boolean;
}
```

说明：

- `sourceType = character` 表示角色特定技能。
- `sourceType = common` 表示开局选择的通用技能。
- `sourceType = reward` 表示局内获得的技能。
- 使用后直接从角色技能列表移除，或标记 used 后隐藏。

建议：

> 使用后直接移除 SkillInstance，同时在战斗日志中记录。

---

## 10. 新增角色时如何增加特定技能

### 10.1 角色编辑器新增“角色特定技能”区域

在新增 / 编辑角色页面中增加：

```text
角色特定技能
[ 添加技能 ]
```

点击“添加技能”后打开技能选择弹窗。

弹窗中显示：

- 技能名称
- 技能图标
- 技能类型
- 行动点消耗
- 攻击距离
- 目标类型
- 简短描述
- 是否内置 / 自定义

支持：

- 搜索技能名称
- 按技能类型筛选
- 按目标类型筛选
- 按通用 / 角色可用筛选

### 10.2 技能可用范围字段

为了区分某个技能能否作为角色特定技能，需要在技能模板中加入：

```ts
usableAs: Array<"character" | "common" | "reward" | "summon">;
```

例如：

```json
{
  "id": "blood_sync",
  "name": "血量同步",
  "usableAs": ["character", "common"]
}
```

说明：

- 如果技能不允许作为角色特定技能，则不能在角色编辑器中被选择。
- 如果技能不允许作为通用技能，则不能被挖宝或击杀奖励随机获得。

### 10.3 角色特定技能数量限制

建议增加系统设置：

```ts
interface GameConfig {
  maxCharacterSkillsPerCharacter: number;
}
```

默认建议：

```text
每个角色最多 2 个角色特定技能。
```

如果你希望更自由，也可以设置为 3 或不限制。

### 10.4 角色保存校验

保存角色时，后端校验：

1. 所选技能必须存在。
2. 所选技能必须允许作为角色特定技能。
3. 技能数量不能超过限制。
4. 不能重复选择同一个角色特定技能。
5. 角色属性必须合法。

---

# Part C：技能列表与自定义技能功能方案

## 11. 技能系统总体目标

技能系统需要同时支持：

1. 查看已有技能列表。
2. 新建自定义技能。
3. 修改自定义技能。
4. 删除自定义技能。
5. 启用 / 禁用技能。
6. 设置技能能否作为角色特定技能 / 通用技能 / 奖励技能。
7. 设置技能图标。
8. 设置技能消耗、范围、目标、效果。
9. 保留代码内置技能能力。

---

## 12. 技能类型分层设计

建议技能分为两层：

### 12.1 Built-in Skill 内置技能

内置技能由代码定义。

适合：

- 很复杂的技能
- 需要特殊逻辑的技能
- 需要和回合队列、联盟、召唤深度交互的技能

内置技能可以在列表中展示，但不建议在前端直接编辑核心逻辑。

可以允许编辑：

- 名称
- 描述
- 图标
- 是否启用
- 可用范围 usableAs

不建议编辑：

- handler 逻辑
- 核心效果

### 12.2 Configurable Skill 配置型技能

配置型技能由数据库 / JSON 保存。

适合：

- 造成伤害
- 回复生命
- 添加 Buff
- 修改属性
- 延迟伤害
- 获得行动点
- 获得技能
- 直线伤害
- 范围伤害
- 召唤预设单位
- 临时结盟
- 解除结盟

配置型技能通过 Effect Engine 执行。

---

## 13. SkillTemplate 数据模型

```ts
interface SkillTemplate {
  id: string;
  name: string;
  description: string;

  iconUrl?: string;

  skillKind: "built_in" | "configurable";

  enabled: boolean;

  usableAs: Array<"character" | "common" | "reward" | "summon">;

  cost: number;
  range: number;

  targetType:
    | "self"
    | "single_entity"
    | "empty_cell"
    | "cell"
    | "direction"
    | "none";

  areaType:
    | "single"
    | "line_4dir"
    | "cross"
    | "square"
    | "circle_manhattan"
    | "all_entities"
    | "none";

  areaSize?: number;

  canTargetSelf: boolean;
  canTargetAlly: boolean;
  canTargetEnemy: boolean;
  canTargetMonster: boolean;
  canTargetSummon: boolean;
  canTargetTreasure: boolean;
  canTargetEmptyCell: boolean;

  affectSelfDamage: boolean;

  effects: EffectConfig[];

  customHandlerKey?: string;

  createdAt: string;
  updatedAt: string;
}
```

说明：

- `skillKind = built_in` 时，可使用 `customHandlerKey`。
- `skillKind = configurable` 时，必须使用 `effects`。
- `affectSelfDamage = false` 时，来源和目标相同的伤害不生效。默认 false，符合当前规则。

---

## 14. EffectConfig 数据模型

```ts
interface EffectConfig {
  id: string;
  type: EffectType;

  value?: number;
  duration?: number;
  delayTurns?: number;

  stat?: "attack" | "defense" | "speed" | "luck" | "temporaryApPerTurn" | "attackRange";

  buffType?: "stun" | "burn" | "stat_modifier" | "delayed_damage";

  summonTemplateId?: string;
  skillPoolId?: string;

  allianceDuration?: number | "permanent";

  targetSelector?: "selected_targets" | "caster" | "all_hit_entities" | "random_enemy" | "random_non_ally";
}
```

### 14.1 第一版必须支持的 EffectType

```ts
type EffectType =
  | "damage"
  | "heal"
  | "add_buff"
  | "remove_buff"
  | "modify_stat"
  | "delayed_damage"
  | "grant_permanent_ap"
  | "grant_temporary_ap"
  | "grant_random_common_skill"
  | "alliance"
  | "remove_alliance"
  | "extra_turn_next_round"
  | "summon"
  | "swap_base_attack"
  | "sync_hp";
```

### 14.2 后续可扩展 EffectType

```ts
type FutureEffectType =
  | "push"
  | "pull"
  | "teleport"
  | "silence"
  | "taunt"
  | "copy_skill"
  | "steal_skill"
  | "create_trap"
  | "create_obstacle";
```

---

## 15. 自定义技能编辑器 UI 设计

### 15.1 技能列表页

技能列表页展示所有技能。

字段：

- 技能图标
- 技能名称
- 类型：内置 / 自定义
- 行动点消耗
- 释放距离
- 目标类型
- 影响范围
- 可用范围：角色特定 / 通用 / 奖励 / 召唤物
- 是否启用
- 操作：查看、编辑、复制、禁用、删除

### 15.2 新建 / 编辑技能页面

页面分区：

1. 基础信息
2. 使用范围
3. 释放规则
4. 目标规则
5. 影响范围
6. 效果列表
7. 图标设置
8. 预览与校验

### 15.3 基础信息区域

字段：

- 技能名称
- 技能描述
- 技能图标
- 是否启用
- 技能类型：配置型 / 内置

注意：

- 普通用户新增时只能创建配置型技能。
- 内置技能由代码注册。

### 15.4 使用范围区域

复选框：

- 可作为角色特定技能
- 可作为通用技能
- 可作为局内奖励技能
- 可作为召唤物技能

### 15.5 释放规则区域

字段：

- 行动点消耗 cost
- 释放距离 range
- 目标类型 targetType
- 影响范围 areaType
- 范围大小 areaSize

### 15.6 目标规则区域

复选框：

- 可以选择自己
- 可以选择盟友
- 可以选择非盟友角色
- 可以选择小怪
- 可以选择召唤物
- 可以选择藏宝点
- 可以选择空地

### 15.7 效果列表区域

技能可以包含多个效果。

UI 上提供：

```text
[ 添加效果 ]
```

每个效果提供类型选择。

根据类型显示不同字段。

例如：

#### damage

- 伤害值 value

#### heal

- 回复值 value

#### add_buff

- Buff 类型
- 持续回合
- 数值

#### delayed_damage

- 延迟回合 delayTurns
- 伤害值 value

#### modify_stat

- 修改属性 stat
- 修改值 value
- 持续回合 duration

#### alliance

- 持续时间：永久 / 指定回合

#### summon

- 召唤物模板
- 召唤位置规则

---

## 16. 自定义技能合法性校验

保存技能时，后端必须校验：

1. 技能名称不能为空。
2. cost 必须大于等于 0。
3. range 必须大于等于 0。
4. targetType 和 areaType 组合必须合法。
5. 至少有一个 Effect。
6. 每个 Effect 的必要字段必须填写。
7. 技能不能产生无法解析的目标。
8. 不能创建会导致系统死循环的效果。
9. 如果包含 summon，则 summonTemplateId 必须存在。
10. 如果包含 buff，则 buffType 必须被系统支持。
11. 如果启用为 common / reward，则该技能必须可以被普通角色合理使用。

### 16.1 targetType 与 areaType 合法组合示例

```text
self + single：合法
single_entity + single：合法
cell + square：合法
cell + circle_manhattan：合法
direction + line_4dir：合法
none + all_entities：合法
empty_cell + single：合法
```

不合法示例：

```text
self + line_4dir：不合法
none + single：不合法
direction + square：不合法
```

---

## 17. 典型技能配置示例

### 17.1 基础伤害技能

```json
{
  "name": "重击",
  "cost": 1,
  "range": 1,
  "targetType": "single_entity",
  "areaType": "single",
  "canTargetEnemy": true,
  "canTargetMonster": true,
  "effects": [
    {
      "type": "damage",
      "value": 25
    }
  ]
}
```

### 17.2 治疗技能

```json
{
  "name": "治疗术",
  "cost": 1,
  "range": 3,
  "targetType": "single_entity",
  "areaType": "single",
  "canTargetSelf": true,
  "canTargetAlly": true,
  "effects": [
    {
      "type": "heal",
      "value": 20
    }
  ]
}
```

### 17.3 直线伤害技能

```json
{
  "name": "贯穿射线",
  "cost": 2,
  "range": 5,
  "targetType": "direction",
  "areaType": "line_4dir",
  "canTargetEnemy": true,
  "canTargetMonster": true,
  "canTargetSummon": true,
  "effects": [
    {
      "type": "damage",
      "value": 18
    }
  ]
}
```

### 17.4 灼烧技能

```json
{
  "name": "燃烧诅咒",
  "cost": 2,
  "range": 3,
  "targetType": "single_entity",
  "areaType": "single",
  "effects": [
    {
      "type": "damage",
      "value": 10
    },
    {
      "type": "add_buff",
      "buffType": "burn",
      "duration": 2,
      "value": 5
    }
  ]
}
```

### 17.5 召唤技能

```json
{
  "name": "召唤仆从",
  "cost": 2,
  "range": 2,
  "targetType": "empty_cell",
  "areaType": "single",
  "canTargetEmptyCell": true,
  "effects": [
    {
      "type": "summon",
      "summonTemplateId": "basic_servant"
    }
  ]
}
```

---

## 18. 技能与已有系统的关系

### 18.1 与行动点系统

释放技能时：

1. 检查角色是否持有该 SkillInstance。
2. 检查 SkillInstance 未被使用。
3. 检查角色是否有足够行动点。
4. 默认先消耗临时行动点，再消耗永久行动点。
5. 技能结算完成后移除 SkillInstance。

### 18.2 与 Buff 系统

自定义技能可以通过 `add_buff` 添加 Buff。

第一版支持：

- stun
- burn
- stat_modifier
- delayed_damage

### 18.3 与联盟系统

技能可以通过：

- `alliance`
- `remove_alliance`

影响联盟关系。

注意：

- 结盟具有传递性。
- 结盟后不能互相攻击。
- 结盟后胜负条件共享。

### 18.4 与死亡奖励系统

技能使用后消失。

角色死亡时：

- 只检查死亡者未使用的通用技能。
- 不检查角色特定技能。
- 击杀者可选择一个未使用通用技能。
- 如果没有，则随机获得一个通用技能。

---

## 19. 开发阶段拆分建议

### 阶段 A：自定义地图基础数据与 API

适合 Codex：

- MapTemplate 数据模型
- MapCell 数据模型
- 地图保存 / 校验 API
- BattleMapSnapshot 生成逻辑
- 地图 enabled cell 对移动、攻击、技能范围的影响

适合 Qoder / CC+国产模型：

- 地图列表页
- 地图编辑器基础 UI
- 点击格子启用 / 禁用
- 地图预览样式

### 阶段 B：地图编辑器高级配置

适合 Codex：

- 随机生成规则校验
- 固定小怪 / 藏宝点生成逻辑
- 开局战斗地图快照生成

适合 Qoder / CC+国产模型：

- 小怪放置 UI
- 藏宝点放置 UI
- 部署区选择 UI
- 随机规则表单

### 阶段 C：角色特定技能配置

适合 Codex：

- CharacterTemplate skillIds 字段
- SkillInstance 生成逻辑
- 角色保存校验
- 角色技能与通用技能的来源区分
- 死亡奖励只继承通用技能

适合 Qoder / CC+国产模型：

- 角色编辑器技能选择弹窗
- 技能搜索 / 筛选 UI
- 已选技能展示 UI

### 阶段 D：技能列表与自定义技能数据模型

适合 Codex：

- SkillTemplate 数据模型
- EffectConfig 数据模型
- 内置技能与配置型技能统一读取
- 技能合法性校验
- Effect Engine 扩展

适合 Qoder / CC+国产模型：

- 技能列表页
- 技能详情页
- 技能图标上传 / 预览
- 技能基础信息表单

### 阶段 E：自定义技能编辑器

适合 Codex：

- targetType / areaType 合法组合校验
- effects 动态配置校验
- 技能保存与执行一致性
- 技能预览 / 测试接口

适合 Qoder / CC+国产模型：

- 技能编辑器 UI
- 添加 / 删除效果 UI
- 不同 effect 的动态表单
- 技能描述预览

### 阶段 F：测试与验收

适合 Codex：

- 地图合法性测试
- 技能合法性测试
- 自定义技能执行测试
- 角色技能生成测试
- 战斗初始化测试

适合 Qoder / CC+国产模型：

- UI 交互测试
- 表单校验测试
- 页面样式修复

---

## 20. 验收标准

### 20.1 自定义地图

必须满足：

- 可以创建地图。
- 可以设置宽高。
- 可以启用 / 禁用格子形成自定义形状。
- 禁用格子不可移动、不可攻击、不可部署。
- 可以设置部署区域。
- 可以手动放置小怪和藏宝点。
- 可以设置随机生成小怪和藏宝点。
- 开始游戏时能正确生成战斗地图快照。

### 20.2 角色特定技能

必须满足：

- 新增角色时可以选择角色特定技能。
- 编辑角色时可以修改角色特定技能。
- 开局时角色默认携带其特定技能。
- 角色特定技能使用后消失。
- 角色死亡后，其角色特定技能不能被继承。
- 击杀奖励只针对通用技能。

### 20.3 技能列表

必须满足：

- 可以查看全部技能。
- 可以区分内置技能和自定义技能。
- 可以启用 / 禁用技能。
- 可以设置技能是否可作为角色特定技能 / 通用技能 / 奖励技能。
- 可以上传或设置技能图标。

### 20.4 自定义技能

必须满足：

- 可以创建配置型技能。
- 可以设置技能消耗、距离、目标类型、范围类型。
- 可以添加多个效果。
- 可以保存并在战斗中使用。
- 使用后消失。
- 非法技能无法保存。
- 自定义技能不应破坏已有核心逻辑。

---

## 21. 给 Codex 的总提示词

```text
请阅读本功能完善方案，在现有游戏项目基础上实现三个功能：自定义地图、角色特定技能配置、自定义技能系统。

要求：
1. 不重写已有 game-core，只在现有架构上扩展。
2. 自定义地图采用 MapTemplate + BattleMapSnapshot 设计。地图形状通过 enabled cells 表示。
3. 禁用格子不可移动、不可攻击、不可部署、不可作为技能目标。
4. 新增角色时支持选择角色特定技能。角色特定技能每局默认携带，使用后消失，死亡后不能被继承。
5. 技能系统支持 built_in 与 configurable 两类。自定义技能只能通过 EffectConfig 配置，不允许用户写任意代码。
6. 技能必须支持多效果 effects[]。
7. 后端必须校验地图、角色技能、技能配置的合法性。
8. 前端只做展示和基础表单交互，核心规则判断必须在后端完成。
9. 按阶段逐步实现，优先完成数据模型、API、规则校验和测试，再完善 UI。
```

---

## 22. 给 Qoder / CC+国产模型的提示词

```text
请根据功能完善方案协助实现展示层和表单层功能。

你主要负责：
1. 地图列表页和地图编辑器 UI。
2. 点击格子启用/禁用、选择部署区、放置小怪和藏宝点的交互。
3. 角色编辑器中的技能选择弹窗。
4. 技能列表页、技能详情页、自定义技能编辑表单。
5. 技能效果 effects[] 的动态表单展示。
6. 技能图标上传、预览、缺省显示。

禁止：
1. 不要重构 game-core。
2. 不要自行改动技能结算逻辑。
3. 不要在前端实现最终规则判断。
4. 不要把技能效果写死成大量 if-else。
```

---

## 23. 结语

本阶段完成后，项目将从固定规则小游戏升级为可编辑的战棋沙盒：

- 地图可以自定义。
- 角色可以自由配置特定技能。
- 技能可以通过列表管理。
- 常规技能可以通过配置创建。
- 复杂技能仍然可以由代码内置扩展。

最重要的原则是：

> 地图、角色、技能都可以配置，但核心规则仍必须稳定、统一、可测试。

