# 阶段 3：地图地形升级实现说明书  
## 后端交给 Codex，前端交给 Qoder

## 0. 文档用途

当前项目的前两个阶段已经完成：

1. 阶段 1：新增小怪功能。
2. 阶段 2：开局随机性设计。

本文档只描述 **阶段 3：地图地形升级** 的实现方案，并明确分工：

```text
后端 / game-core / 规则 / API / 测试：交给 Codex
前端 / 地图编辑器 UI / 地形贴图 / 交互展示：交给 Qoder
```

本阶段目标：

1. 在地图格子中加入地形系统。
2. 支持普通地形、障碍物、岩浆、沼泽、木桩、冰面、雷暴。
3. 修改移动消耗、地形触发、直线技能阻挡、部署和随机生成校验。
4. 支持技能在局内改变地形。
5. 在地图编辑器中支持设置不同地形。
6. 前后端边界清晰，不让 Qoder 修改 game-core。

---

## 1. 当前阶段边界

### 1.1 本阶段只做地形系统

本阶段不做：

```text
小怪系统重构
开局随机性重构
技能动画大改
全屏战斗界面重构
Motion / PixiJS 前端优化
音效系统
```

这些内容已经完成或留到后续阶段。

本阶段只做：

```text
地图格子的 terrainType
地形规则
地形对移动 / 部署 / 技能 / 随机生成的影响
地图编辑器中的地形设置
局内 change_terrain Effect
基础地形显示和提示
```

### 1.2 后端与前端职责

### Codex 负责

Codex 负责所有规则层内容：

```text
MapCell 数据结构
TerrainType 类型
TerrainDefinition 配置
移动消耗计算
地形触发
障碍物阻挡
木桩可破坏逻辑
雷暴概率结算
岩浆伤害
change_terrain Effect
后端 API 数据返回
后端校验
单元测试 / 集成测试
```

### Qoder 负责

Qoder 负责所有展示层和交互层内容：

```text
地图编辑器地形工具栏
地形刷子 UI
地形贴图 / 颜色显示
地形 tooltip
格子状态展示
木桩 HP 显示
危险地形提示
地形图例
调用后端保存地图
根据后端返回数据显示地图
```

### Qoder 禁止做的事

Qoder 不允许修改：

```text
game-core
伤害计算
移动规则
地形触发规则
技能结算
随机生成逻辑
后端地形校验
```

Qoder 只能消费后端数据并展示。

---

# 2. 地形类型总览

本阶段支持以下地形：

| terrainType | 中文名 | 是否可进入 | 是否可部署 | 是否阻挡直线技能 | 特殊效果 |
|---|---|---:|---:|---:|---|
| `normal` | 普通地形 | 是 | 是 | 否 | 无 |
| `obstacle` | 障碍物 | 否 | 否 | 是 | 阻挡移动和直线技能 |
| `lava` | 岩浆 | 是 | 是，但前端提示危险 | 否 | 回合开始受到 5 点真实伤害 |
| `swamp` | 沼泽 | 是 | 是 | 否 | 从该格离开需要 2 AP |
| `wood_stake` | 木桩 | 否 | 否 | 是 | 有 10 HP，可被攻击，归零变 normal |
| `ice` | 冰面 | 是 | 是 | 否 | 从该格离开消耗 0 AP |
| `thunderstorm` | 雷暴 | 是 | 是，但前端提示危险 | 否 | 回合开始按幸运判定，可能受到 30 点真实伤害 |

---

# 3. Codex 后端实现说明

## 3.1 MapCell 数据模型升级

后端需要将地图格子升级为：

```ts
interface MapCell {
  x: number;
  y: number;

  enabled: boolean;

  terrainType: TerrainType;

  tileImageUrl?: string;

  terrainState?: TerrainState;
}
```

```ts
type TerrainType =
  | "normal"
  | "obstacle"
  | "lava"
  | "swamp"
  | "wood_stake"
  | "ice"
  | "thunderstorm";
```

`terrainState` 用于局内临时地形、可破坏地形、技能生成地形等。

```ts
interface TerrainState {
  originalTerrainType?: TerrainType;

  duration?: number | "permanent";

  createdBySkillId?: string;
  createdByEntityId?: string;

  hp?: number;
  maxHp?: number;
  defense?: number;
}
```

说明：

- `MapTemplate.cells[].terrainType` 表示地图模板中的默认地形。
- `GameState.map.cells[].terrainType` 表示本局实际地形。
- 技能改变地形只修改 `GameState`，不能修改 `MapTemplate`。
- 木桩需要在 `terrainState` 中记录 `hp = 10`、`maxHp = 10`、`defense = 0`。

---

## 3.2 TerrainDefinition 配置

后端新增统一地形定义表。

```ts
interface TerrainDefinition {
  type: TerrainType;
  name: string;
  description: string;

  walkable: boolean;
  blocksLineOfEffect: boolean;
  blocksPlacement: boolean;
  blocksRandomSpawn: boolean;

  enterCost: number;
  leaveCost: number;

  onTurnStartEffect?: TerrainEffectConfig;
  destructible?: DestructibleTerrainConfig;

  tileImageUrl?: string;
}
```

```ts
interface TerrainEffectConfig {
  type: "terrain_damage" | "luck_based_damage";
  value: number;
  damageType: "true";
}
```

```ts
interface DestructibleTerrainConfig {
  hp: number;
  defense: number;
  afterDestroyedTerrainType: TerrainType;
}
```

推荐默认配置：

```ts
const TERRAIN_DEFINITIONS: Record<TerrainType, TerrainDefinition> = {
  normal: {
    type: "normal",
    name: "普通地形",
    description: "普通可行走地形。",
    walkable: true,
    blocksLineOfEffect: false,
    blocksPlacement: false,
    blocksRandomSpawn: false,
    enterCost: 1,
    leaveCost: 1
  },

  obstacle: {
    type: "obstacle",
    name: "障碍物",
    description: "不可进入，阻挡直线技能。",
    walkable: false,
    blocksLineOfEffect: true,
    blocksPlacement: true,
    blocksRandomSpawn: true,
    enterCost: Infinity,
    leaveCost: Infinity
  },

  lava: {
    type: "lava",
    name: "岩浆",
    description: "回合开始时受到 5 点真实伤害。",
    walkable: true,
    blocksLineOfEffect: false,
    blocksPlacement: false,
    blocksRandomSpawn: false,
    enterCost: 1,
    leaveCost: 1,
    onTurnStartEffect: {
      type: "terrain_damage",
      value: 5,
      damageType: "true"
    }
  },

  swamp: {
    type: "swamp",
    name: "沼泽",
    description: "从沼泽离开需要 2 行动点。",
    walkable: true,
    blocksLineOfEffect: false,
    blocksPlacement: false,
    blocksRandomSpawn: false,
    enterCost: 1,
    leaveCost: 2
  },

  wood_stake: {
    type: "wood_stake",
    name: "木桩",
    description: "不可进入，可被攻击，拥有 10 点生命值，摧毁后变为普通地形。",
    walkable: false,
    blocksLineOfEffect: true,
    blocksPlacement: true,
    blocksRandomSpawn: true,
    enterCost: Infinity,
    leaveCost: Infinity,
    destructible: {
      hp: 10,
      defense: 0,
      afterDestroyedTerrainType: "normal"
    }
  },

  ice: {
    type: "ice",
    name: "冰面",
    description: "从冰面离开不消耗行动点。",
    walkable: true,
    blocksLineOfEffect: false,
    blocksPlacement: false,
    blocksRandomSpawn: false,
    enterCost: 0,
    leaveCost: 0
  },

  thunderstorm: {
    type: "thunderstorm",
    name: "雷暴",
    description: "回合开始时，根据幸运值概率受到 30 点真实伤害。",
    walkable: true,
    blocksLineOfEffect: false,
    blocksPlacement: false,
    blocksRandomSpawn: false,
    enterCost: 1,
    leaveCost: 1,
    onTurnStartEffect: {
      type: "luck_based_damage",
      value: 30,
      damageType: "true"
    }
  }
};
```

---

# 4. Codex 后端规则细节

## 4.1 normal 普通地形

规则：

```text
可站立
可移动进入
可部署
可随机生成小怪 / 藏宝点
离开消耗 1 AP
无特殊效果
```

---

## 4.2 obstacle 障碍物

规则：

```text
不可站立
不可移动进入
不可部署角色 / 小怪 / 藏宝点
不可随机生成小怪 / 藏宝点
阻挡直线技能
不能被攻击
不能被挖掘
```

直线技能，例如激光：

```text
遇到 obstacle 时停止继续延伸。
```

---

## 4.3 lava 岩浆

规则：

```text
可站立
可移动进入
可部署，但前端应提示危险
可随机生成小怪 / 藏宝点，但前端可提示危险
离开消耗 1 AP
角色 / 召唤物回合开始时受到 5 点真实伤害
```

伤害规则：

```text
damage = 5
damageType = true
source = terrain
不触发小怪反击
不触发铁索连环
不触发暴击
不发放击杀奖励
```

小怪说明：

```text
小怪没有主动回合，因此第一版小怪不主动触发岩浆伤害。
```

---

## 4.4 swamp 沼泽

规则：

```text
可站立
可移动进入
可部署
可随机生成
进入沼泽本身不额外加费
从沼泽离开需要 2 AP
```

移动消耗统一使用：

```text
moveCost = currentCell.terrain.leaveCost
```

例子：

```text
normal -> swamp：消耗 1 AP
swamp -> normal：消耗 2 AP
swamp -> swamp：消耗 2 AP
```

---

## 4.5 wood_stake 木桩

木桩是 **可破坏地形 / 可破坏障碍物**，不是进入触发陷阱。

统一规则：

```text
木桩不可站立
木桩不可移动进入
木桩不可部署角色、小怪、藏宝点
木桩不可随机生成小怪或藏宝点
木桩阻挡直线技能
木桩可以被普通攻击和部分伤害技能选中
木桩有 10 HP
木桩防御为 0
木桩 HP 归 0 后，地形变为 normal
```

木桩受伤规则：

```text
普通攻击或允许攻击地形的技能可以伤害木桩
木桩受到的伤害不触发小怪反击
木桩被摧毁不发放击杀奖励
木桩被摧毁产生 terrain_destroyed / terrain_changed 事件
```

建议后端表示：

```ts
interface DestructibleTerrainRuntimeState {
  terrainType: "wood_stake";
  hp: number;      // 10
  maxHp: number;   // 10
  defense: number; // 0
}
```

木桩作为目标时，不建议创建完整 BattleEntity，可以把它作为 `terrain_target` 处理：

```ts
type TargetType =
  | "entity"
  | "cell"
  | "terrain";
```

攻击木桩请求示例：

```ts
interface AttackTerrainRequest {
  gameId: string;
  actorId: string;
  targetPosition: Position;
}
```

后端判断：

```text
target cell terrainType == wood_stake
actor 与 targetPosition 距离 <= actor.attackRange
actor AP 足够
扣除 AP
计算伤害
扣除 wood_stake hp
hp <= 0 时 terrainType = normal
```

---

## 4.6 ice 冰面

规则：

```text
可站立
可移动进入
可部署
可随机生成
从冰面离开消耗 0 AP
不自动滑行
```

移动例子：

```text
normal -> ice：消耗 normal.leaveCost，通常为 1 AP
ice -> normal：消耗 ice.leaveCost，即 0 AP
ice -> ice：消耗 0 AP
```

注意：

```text
冰面只改变 AP 消耗，不做“滑到尽头”的自动移动。
```

行动点为 0 时，如果当前格是冰面，允许移动到相邻可走格。

---

## 4.7 thunderstorm 雷暴

规则：

```text
可站立
可移动进入
可部署，但前端应提示危险
可随机生成，但前端可提示危险
离开消耗 1 AP
角色 / 召唤物回合开始时进行雷击判定
```

概率定义：

```text
luck 范围：0 到 100
受到雷击概率 = max(0, min(100, 100 - luck)) / 100
```

例子：

```text
luck = 0   -> 100% 受到雷击
luck = 30  -> 70% 受到雷击
luck = 70  -> 30% 受到雷击
luck = 100 -> 0% 受到雷击
```

雷击伤害：

```text
damage = 30
damageType = true
source = terrain
不触发小怪反击
不触发铁索连环
不触发暴击
不发放击杀奖励
```

小怪说明：

```text
小怪没有主动回合，因此第一版小怪不主动触发雷暴判定。
```

---

# 5. Codex：移动系统修改

原规则：

```text
移动一格消耗 1 AP
```

新规则：

```text
移动一格消耗当前所在格子的 terrain.leaveCost
```

移动校验：

1. 目标格必须存在。
2. 目标格必须 `enabled = true`。
3. 目标格地形必须 `walkable = true`。
4. 目标格不能已有角色、小怪、召唤物、藏宝点等占位实体。
5. 当前角色不能处于 `root / 禁走` 状态。
6. 当前角色 AP 必须大于等于移动消耗。
7. 如果移动消耗为 0，允许没有 AP 时移动。
8. AP 消耗仍然优先消耗 `temporaryAP`，不足时消耗 `permanentAP`。

注意：

```text
冰面 0 AP 移动第一版不限制次数。
如果后续发现太强，再另行增加每回合最大移动次数限制。
```

---

# 6. Codex：地形触发时机

## 6.1 回合开始地形效果

适用地形：

```text
lava
thunderstorm
```

角色 / 召唤物每次行动开始时触发。

推荐顺序：

```text
1. 地形回合开始效果
2. Buff 回合开始效果
3. 死亡检查
4. 眩晕检查
5. 获得 temporaryAP
```

如果角色因地形伤害死亡：

```text
本次行动直接结束
不获得 temporaryAP
不触发普通行动
不发放击杀奖励
```

## 6.2 木桩不使用 onEnterEffect

木桩规则已经改为：

```text
不可进入的可破坏地形
```

因此木桩不应使用：

```text
onEnterEffect
```

不要实现“进入木桩受到 10 伤害后木桩消失”的旧规则。

统一实现为：

```text
攻击木桩 / 技能伤害木桩 -> 木桩 HP 下降 -> HP 归 0 后变 normal
```

---

# 7. Codex：技能范围与地形

第一版规则：

1. 单体技能：要求目标格 enabled，目标存在，距离满足。
2. 范围技能：范围内 disabled cell 自动跳过。
3. 直线技能：遇到 disabled cell、obstacle、wood_stake 时停止。
4. 箭雨、C4 等范围技能可以越过障碍物影响范围内目标。
5. 后续可增加 `respectLineOfSight` 字段。

默认：

```text
激光受 obstacle 和 wood_stake 阻挡。
箭雨和 C4 不受障碍物阻挡。
```

木桩作为目标：

```text
普通攻击可以攻击 wood_stake。
允许攻击地形的技能可以攻击 wood_stake。
默认大多数单体伤害技能可配置 canTargetTerrain = true / false。
第一版至少普通攻击必须能打木桩。
```

建议扩展技能目标配置：

```ts
interface SkillTemplate {
  canTargetTerrain?: boolean;
  allowedTerrainTargets?: TerrainType[];
}
```

---

# 8. Codex：随机生成与部署校验

随机小怪 / 藏宝点不能生成在：

```text
enabled = false 的格子
obstacle
wood_stake
已占用格子
固定实体格子
角色初始位置
```

可以生成在：

```text
normal
lava
swamp
ice
thunderstorm
```

但前端应对 lava / thunderstorm 给出危险提示。

部署角色不能部署在：

```text
obstacle
wood_stake
enabled = false
已有实体格
```

可部署在：

```text
normal
lava
swamp
ice
thunderstorm
```

前端对 lava / thunderstorm 显示危险提示。

---

# 9. Codex：change_terrain Effect

新增或完善 Effect：

```ts
type EffectType = "change_terrain";
```

```ts
interface ChangeTerrainEffect {
  type: "change_terrain";
  terrainType: TerrainType;
  duration?: number | "permanent";
  areaType: "single" | "square" | "line_4dir";
  areaSize?: number;
}
```

规则：

1. 可以把格子改为：
   - normal
   - lava
   - swamp
   - wood_stake
   - ice
   - thunderstorm
2. 不允许把有占位实体的格子改成：
   - obstacle
   - wood_stake
3. 改为 wood_stake 时，需要初始化：
   - hp = 10
   - maxHp = 10
   - defense = 0
4. 临时地形到期后恢复 `originalTerrainType`。
5. 地形改变只写入 `GameState`，不能修改 `MapTemplate`。
6. 地形改变产生 `terrain_changed` 事件。
7. 木桩被摧毁也产生 `terrain_changed` 事件。

---

# 10. Codex：后端 API 与返回数据

## 10.1 地图保存 API

地图保存接口需要支持每个 cell 的 `terrainType`。

示例：

```ts
interface SaveMapRequest {
  id?: string;
  name: string;
  width: number;
  height: number;
  cells: MapCell[];
  fixedMonsters: MapFixedMonster[];
  fixedTreasures: MapFixedTreasure[];
  spawnZones?: SpawnZone[];
}
```

后端保存时校验：

1. 每个 cell 的 `terrainType` 必须合法。
2. 固定小怪不能位于 obstacle 或 wood_stake。
3. 固定藏宝点不能位于 obstacle 或 wood_stake。
4. 部署区不能包含 obstacle 或 wood_stake。
5. disabled cell 不应放置固定实体。
6. wood_stake 初始化时应有默认 hp 信息，或者由 GameState 初始化时补全。

## 10.2 GameStateRead 返回

`GameStateRead` 中地图数据需要包含：

```ts
interface GameStateRead {
  map: {
    width: number;
    height: number;
    cells: MapCell[];
  };

  entities: BattleEntity[];
  treasures: TreasureState[];
  recentEvents: BattleEvent[];
}
```

每个 `MapCell` 至少返回：

```ts
interface MapCellRead {
  x: number;
  y: number;
  enabled: boolean;
  terrainType: TerrainType;
  tileImageUrl?: string;
  terrainState?: TerrainState;
}
```

木桩格必须返回：

```ts
terrainState: {
  hp: number;
  maxHp: 10;
  defense: 0;
}
```

---

# 11. Codex：BattleEvent

地形相关事件：

```ts
type BattleEventType =
  | "terrain_triggered"
  | "terrain_changed"
  | "terrain_damaged"
  | "terrain_destroyed";
```

事件示例：

```ts
interface BattleEvent {
  id: string;
  type: BattleEventType;
  timestamp: number;

  actorId?: string;
  targetPosition?: Position;
  targetPositions?: Position[];

  terrainType?: TerrainType;
  oldTerrainType?: TerrainType;
  newTerrainType?: TerrainType;

  value?: number;

  visualKey?: string;
  metadata?: Record<string, any>;
}
```

示例：

```ts
{
  type: "terrain_triggered",
  targetPosition: { x: 3, y: 4 },
  terrainType: "lava",
  value: 5,
  visualKey: "terrain-lava"
}
```

```ts
{
  type: "terrain_damaged",
  targetPosition: { x: 5, y: 2 },
  terrainType: "wood_stake",
  value: 7,
  metadata: {
    hpAfter: 3
  },
  visualKey: "terrain-wood-stake"
}
```

```ts
{
  type: "terrain_destroyed",
  targetPosition: { x: 5, y: 2 },
  oldTerrainType: "wood_stake",
  newTerrainType: "normal",
  visualKey: "terrain-destroyed"
}
```

---

# 12. Codex：测试清单

## 12.1 数据模型测试

- 所有合法 terrainType 可以保存。
- 非法 terrainType 被拒绝。
- MapCell 默认 terrainType 为 normal。
- wood_stake 初始化时拥有 hp = 10。

## 12.2 移动测试

- normal 离开消耗 1 AP。
- swamp 离开消耗 2 AP。
- ice 离开消耗 0 AP。
- obstacle 不可进入。
- wood_stake 不可进入。
- AP 不足时不能从 swamp 离开。
- AP 为 0 时可以从 ice 离开。
- root 状态下不能移动。

## 12.3 地形伤害测试

- lava 在角色回合开始造成 5 点真实伤害。
- lava 伤害不触发小怪反击。
- lava 击杀不发放奖励。
- thunderstorm 按 `100 - luck` 概率造成 30 点真实伤害。
- thunderstorm 伤害不触发小怪反击。
- thunderstorm 击杀不发放奖励。

## 12.4 木桩测试

- wood_stake 不可进入。
- wood_stake 不可部署。
- wood_stake 阻挡激光。
- 普通攻击可以攻击 wood_stake。
- wood_stake 初始 HP 为 10。
- wood_stake 防御为 0。
- wood_stake HP 归 0 后变为 normal。
- wood_stake 被摧毁不发放击杀奖励。
- wood_stake 受伤不触发小怪反击。

## 12.5 技能与地形测试

- 激光遇到 obstacle 停止。
- 激光遇到 wood_stake 停止。
- 箭雨可以越过 obstacle。
- C4 可以越过 obstacle。
- change_terrain 可以生成 lava。
- change_terrain 可以生成 swamp。
- change_terrain 可以生成 ice。
- change_terrain 可以生成 thunderstorm。
- change_terrain 可以生成 wood_stake 并初始化 hp。
- change_terrain 不修改 MapTemplate，只修改 GameState。

## 12.6 随机与部署测试

- 随机小怪不会生成在 obstacle。
- 随机小怪不会生成在 wood_stake。
- 随机藏宝点不会生成在 obstacle。
- 随机藏宝点不会生成在 wood_stake。
- 角色不能部署在 obstacle。
- 角色不能部署在 wood_stake。
- 角色可以部署在 lava，但前端提示危险。
- 角色可以部署在 thunderstorm，但前端提示危险。

---

# 13. Qoder 前端实现说明

## 13.1 前端目标

Qoder 只负责展示和交互，不负责规则。

需要实现：

1. 地图编辑器地形刷子。
2. 地形贴图 / 颜色显示。
3. 地形说明 tooltip。
4. 木桩 HP 显示。
5. 危险地形提示。
6. 保存地图时把 terrainType 提交给后端。
7. 根据后端返回的 GameState 显示实际地形。
8. 不在前端自行判断最终规则。

---

## 13.2 地图编辑器地形工具栏

地图编辑器新增地形工具：

```text
普通地形
障碍物
岩浆
沼泽
木桩
冰面
雷暴
橡皮擦 / 恢复普通
```

交互要求：

1. 点击选择地形刷子。
2. 点击格子应用地形。
3. 支持拖动连续刷地形。
4. 右键可恢复普通地形。
5. 当前选中刷子高亮。
6. 鼠标悬停工具显示地形说明。
7. 保存地图时提交每个格子的 terrainType。

---

## 13.3 地形显示样式

如果没有正式贴图，先使用颜色占位：

| 地形 | 颜色 / 样式建议 |
|---|---|
| normal | 浅绿色 / 浅灰 |
| obstacle | 深灰石块感 |
| lava | 红橙色，有轻微发光 |
| swamp | 深绿色，有泥沼感 |
| wood_stake | 棕色木桩图案，可显示 HP |
| ice | 浅蓝色，有高光 |
| thunderstorm | 紫蓝色，有电弧感 |

要求：

1. 不同地形必须一眼可区分。
2. 不要让颜色过于刺眼。
3. 地图整体保持统一风格。
4. 支持后续替换为正式贴图。

---

## 13.4 地形 tooltip

鼠标悬停格子时显示：

```text
地形名称
地形效果
移动消耗
是否可进入
是否阻挡直线技能
是否危险
```

示例：

```text
沼泽
可进入
离开消耗：2 AP
效果：从该格移动出去需要更多行动点
```

```text
木桩
不可进入
HP：6 / 10
可被攻击
摧毁后变为普通地形
```

```text
雷暴
可进入
回合开始判定：受到雷击概率 = 100 - 幸运值
伤害：30 真实伤害
```

---

## 13.5 地图编辑器保存前提示

Qoder 可以做前端轻量提示，但最终以后端校验为准。

前端提示：

1. 固定小怪不能放在障碍物或木桩上。
2. 固定藏宝点不能放在障碍物或木桩上。
3. 部署区不建议包含岩浆或雷暴。
4. 部署区不能包含障碍物或木桩。
5. 木桩是可破坏障碍，不是可进入格。

注意：

```text
这些只是前端提示，后端仍必须做最终校验。
```

---

## 13.6 战斗地图显示

战斗中根据 `GameState.map.cells` 显示实际地形。

要求：

1. 使用 GameState，而不是 MapTemplate。
2. 因为技能可能改变地形，所以战斗地图必须响应 GameState 变化。
3. 木桩 HP 变化时显示最新 HP。
4. 木桩被摧毁后显示为 normal。
5. 雷暴、岩浆等危险地形有轻微视觉提示。
6. 0 AP 冰面移动时，移动提示格显示 `0 AP`。
7. 沼泽离开时，移动提示格显示 `2 AP`。

---

## 13.7 Qoder 禁止事项

Qoder 不允许：

1. 不要在前端计算地形伤害。
2. 不要在前端决定雷暴是否命中。
3. 不要在前端决定木桩是否被摧毁。
4. 不要在前端判断技能最终命中。
5. 不要在前端写死后端规则。
6. 不要修改 game-core。
7. 不要修改后端地形规则。

---

# 14. Qoder 前端测试清单

- 地图编辑器可以设置 7 种地形。
- 地图编辑器可以连续刷地形。
- 地形颜色 / 贴图显示正确。
- tooltip 内容正确。
- 木桩显示 HP。
- 战斗中木桩 HP 变化能更新。
- 木桩摧毁后变 normal。
- 岩浆 / 雷暴显示危险提示。
- 冰面移动提示显示 0 AP。
- 沼泽移动提示显示 2 AP。
- 保存地图时 terrainType 正确提交。
- 读取地图时 terrainType 正确显示。
- 不修改 game-core。

---

# 15. Codex 提示词

```text
当前项目阶段 1 和阶段 2 已完成。现在只实现阶段 3：地图地形升级。请你只负责后端 / game-core / API / 测试，不做前端 UI。

要求：
1. 新增 TerrainType：normal、obstacle、lava、swamp、wood_stake、ice、thunderstorm。
2. 升级 MapCell，增加 terrainType 和 terrainState。
3. 新增 TerrainDefinition 配置。
4. 移动消耗改为当前格子的 terrain.leaveCost。
5. obstacle 不可进入、不可部署、阻挡直线技能。
6. lava 在角色 / 召唤物回合开始时造成 5 点真实伤害。
7. swamp 离开需要 2 AP。
8. ice 离开需要 0 AP，不做自动滑行。
9. thunderstorm 在角色 / 召唤物回合开始时按 max(0, min(100, 100 - luck)) / 100 概率造成 30 点真实伤害。
10. wood_stake 是不可进入的可破坏地形，有 10 HP、防御 0，可被普通攻击，HP 归 0 后变 normal。
11. wood_stake 不是进入触发陷阱，不要实现进入木桩造成伤害。
12. 激光等直线技能遇到 obstacle 或 wood_stake 停止。
13. 箭雨、C4 这类范围技能不受障碍物阻挡。
14. 支持 change_terrain Effect，可以把格子改成 lava、swamp、wood_stake、ice、thunderstorm。
15. 地形改变只写入 GameState，不能修改 MapTemplate。
16. 随机生成和部署不能选择 obstacle 或 wood_stake。
17. 地形伤害不触发小怪反击，不发放击杀奖励。
18. 增加完整测试，尤其是移动消耗、木桩、雷暴、change_terrain。
19. 不要重写已完成的小怪系统和开局随机系统，只做兼容式扩展。
```

---

# 16. Qoder 提示词

```text
当前项目阶段 1 和阶段 2 已完成。现在只实现阶段 3 的前端部分：地图地形编辑和地形展示。后端 / game-core 由 Codex 负责，你不要修改。

你负责：
1. 地图编辑器新增地形工具栏。
2. 支持设置 normal、obstacle、lava、swamp、wood_stake、ice、thunderstorm。
3. 支持点击格子刷地形。
4. 支持拖动连续刷地形。
5. 支持右键恢复普通地形。
6. 为不同地形提供颜色或贴图占位。
7. 为地形增加 tooltip，显示地形说明、移动消耗、是否可进入、是否危险。
8. 显示木桩 HP。
9. 战斗地图中根据 GameState 显示实际地形，而不是只读 MapTemplate。
10. 显示岩浆、雷暴危险提示。
11. 显示冰面 0 AP 移动提示。
12. 显示沼泽 2 AP 移动提示。
13. 保存地图时提交每个格子的 terrainType。
14. 不要在前端计算地形伤害、雷暴概率、木桩摧毁、技能命中。
15. 不要修改 game-core。
16. 前端可以做轻量提示，但最终校验以后端为准。
```

---

# 17. 最终验收标准

## 后端 Codex 验收

- TerrainType 完整支持 7 种地形。
- MapCell 保存 terrainType。
- GameState 保存局内地形变化。
- 移动消耗正确。
- obstacle / wood_stake 不可进入。
- lava 回合开始造成 5 点真实伤害。
- swamp 离开消耗 2 AP。
- ice 离开消耗 0 AP。
- thunderstorm 按幸运值概率造成 30 点真实伤害。
- wood_stake 有 10 HP，能被攻击，摧毁后变 normal。
- change_terrain 可用。
- 地形改变不污染 MapTemplate。
- 随机生成和部署避开 obstacle / wood_stake。
- 测试覆盖关键规则。

## 前端 Qoder 验收

- 地图编辑器能刷 7 种地形。
- 地形显示清晰。
- tooltip 完整。
- 木桩 HP 可见。
- 地形保存和读取正确。
- 战斗地图响应 GameState 地形变化。
- 危险地形有视觉提示。
- 不修改 game-core。
