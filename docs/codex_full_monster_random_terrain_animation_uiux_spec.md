# Codex 实现说明书：小怪、开局随机配置、地形升级与技能动画完善

## 0. 使用方式

本文档用于直接交给 Codex，实现以下功能：

1. 新增小怪系统。
2. 重构开局随机性设计。
3. 升级地图地形系统。
4. 完善技能动画与前端表现。

本次开发全部交给 **Codex** 完成。

前端界面实现时，要求 Codex 使用或参考项目中已安装的 **ui-ux-pro-max skill**，重点优化：

- 开局配置界面
- 地图编辑器
- 小怪管理界面
- 地形编辑工具
- 战斗界面动画与反馈
- 整体 UI 的一致性和游戏感

核心原则：

```text
地图固定，开局随机，战斗确定。
```

最终分层：

```text
MapTemplate：保存地图固定结构、固定小怪、固定藏宝点、地形。
StartGameConfig：保存本局开局配置，包括随机数量、随机池、奖励池、seed。
GameState：保存本局已经固化的角色、小怪、藏宝点、奖励池和局内地形变化。
BattleEvent：保存本次操作产生的表现事件。
Frontend：根据 GameState 和 BattleEvent 展示画面与动画。
```

---

# 1. 总体边界修正

## 1.1 地图模板不保存随机规则

地图模板只保存固定内容：

```text
地图大小
地图形状
格子 enabled / disabled
地形 terrainType
固定小怪
固定藏宝点
部署区域
```

地图模板不保存：

```text
随机小怪数量
随机藏宝点数量
小怪随机池
奖励技能池
随机 seed
```

这些全部属于开局配置。

---

## 1.2 随机性在一个开局配置界面内完成

开局流程不应该拆得太复杂。

推荐开局流程：

```text
进入开局配置页面
↓
在同一个界面内完成：
- 选择地图
- 选择角色
- 选择角色通用技能
- 设置角色初始位置
- 设置随机小怪数量
- 设置随机藏宝点数量
- 选择小怪种类池
- 选择奖励技能池
- 随机预览
↓
确认开始游戏
```

也就是说：

```text
所有随机性相关设置必须整合在同一个开局配置界面中。
```

不要做成多个分散页面。

---

## 1.3 开局随机，战斗确定

进入战斗后：

- 不再临时随机生成小怪。
- 不再临时随机生成藏宝点。
- 不再实时读取全局技能表作为奖励池。
- 只使用 `GameState` 中已经固化的随机结果和奖励池。

---

# 2. 阶段 1：新增小怪系统

## 2.1 小怪系统目标

小怪是地图实体的一种，与角色、召唤物一样占据一个格子。

小怪规则：

1. 小怪不会主动行动。
2. 小怪没有自己的主动回合。
3. 小怪暂时不携带技能。
4. 小怪受到普通攻击或直接伤害技能后，如果攻击者在小怪攻击范围内，小怪立即反击一次。
5. 小怪每次受到直接攻击都可以反击。
6. 小怪死亡后，击杀者从本局奖励技能池中随机获得一个通用技能。
7. 小怪与角色、召唤物、藏宝点一样参与占格判断。
8. 一个格子最多只能有一个占位实体。

---

## 2.2 MonsterTemplate 数据模型

新增 `MonsterTemplate`。

```ts
interface MonsterTemplate {
  id: string;
  name: string;
  description?: string;

  maxHp: number;
  baseAttack: number;
  baseDefense: number;
  attackRange: number;

  speed: number;
  critRate: number;
  luck: number;

  tokenImageUrl?: string;
  portraitImageUrl?: string;

  enabled: boolean;

  createdAt: string;
  updatedAt: string;
}
```

说明：

- `speed` 暂时只用于显示和以后扩展。
- 小怪第一版不主动行动，因此 `speed` 不进入行动队列。
- `luck` 暂时保留。
- 不需要 `skillTemplateIds`。
- 如果已有代码中已经有小怪技能字段，可以保留，但第一版不使用。

---

## 2.3 BattleMonsterEntity 数据模型

战斗开始时，根据 `MonsterTemplate` 生成小怪实体。

```ts
interface BattleMonsterEntity {
  id: string;
  entityType: "monster";
  templateId: string;

  name: string;
  maxHp: number;
  currentHp: number;
  baseAttack: number;
  baseDefense: number;
  attackRange: number;
  critRate: number;

  tokenImageUrl?: string;
  portraitImageUrl?: string;

  position: Position;
  alive: boolean;
}
```

小怪参与：

- 位置占用检查
- 普通攻击受击
- 技能伤害受击
- 反击
- 死亡
- 奖励发放
- 动画事件

不参与：

- 行动队列排序
- 主动行动
- 使用技能
- 挖宝

---

## 2.4 小怪模板 API

新增 API：

```text
GET    /api/monster-templates
POST   /api/monster-templates
GET    /api/monster-templates/{id}
PUT    /api/monster-templates/{id}
DELETE /api/monster-templates/{id}
POST   /api/monster-templates/{id}/duplicate
```

创建 / 更新小怪时，后端必须校验：

1. `name` 不能为空。
2. `maxHp > 0`。
3. `baseAttack >= 0`。
4. `baseDefense >= 0`。
5. `attackRange >= 1`。
6. `critRate` 在 0 到 100 之间。
7. 图片字段为空时使用默认占位图。
8. `enabled = false` 的小怪不能进入随机小怪池。

---

## 2.5 小怪管理页面

新增页面：

```text
小怪管理 / Monster Manager
```

使用 ui-ux-pro-max 优化 UI。

功能：

1. 查看小怪列表。
2. 新增小怪。
3. 编辑小怪。
4. 删除小怪。
5. 复制小怪。
6. 上传地图图标 `tokenImageUrl`。
7. 上传展示立绘 `portraitImageUrl`。
8. 启用 / 禁用小怪。

列表显示：

- 图标
- 名称
- 生命值
- 攻击力
- 防御力
- 攻击范围
- 暴击率
- 是否启用
- 操作按钮

---

## 2.6 地图固定小怪配置

地图中只保存固定小怪与固定藏宝点。

```ts
interface MapTemplate {
  id: string;
  name: string;
  description?: string;

  width: number;
  height: number;

  cells: MapCell[];

  fixedMonsters: MapFixedMonster[];
  fixedTreasures: MapFixedTreasure[];

  spawnZones?: SpawnZone[];

  createdAt: string;
  updatedAt: string;
}

interface MapFixedMonster {
  id: string;
  monsterTemplateId: string;
  position: Position;
}

interface MapFixedTreasure {
  id: string;
  position: Position;
}
```

固定小怪放置校验：

1. 必须放在 enabled cell 上。
2. 不能放在 `obstacle` 地形上。
3. 不能与固定藏宝点重叠。
4. 不能与其他固定小怪重叠。
5. `monsterTemplateId` 必须存在且启用。
6. 固定小怪不能放在部署区中已经被角色占用的位置。

---

## 2.7 小怪反击规则

当小怪受到普通攻击或直接伤害技能后：

```text
如果攻击者仍然存活，并且攻击者在小怪 attackRange 内，则小怪立即反击一次。
```

反击伤害：

```text
普通伤害 = max(1, 小怪 baseAttack - 攻击者 baseDefense)
```

小怪反击可以暴击，暴击规则沿用普通攻击。

边界：

1. 小怪死亡后不反击。
2. 小怪受到灼烧、C4 延迟爆炸、铁索连环同步伤害时不反击。
3. 小怪受到岩浆、雷暴等地形伤害时不反击。
4. 小怪受到当前施法者直接伤害技能时，可以反击。
5. 反击本身不消耗行动点。
6. 反击产生 `counter_attack` 战斗事件，用于动画。

---

# 3. 阶段 2：开局随机性设计

## 3.1 开局随机性目标

随机性只在游戏开始前配置和执行。

开局完成后：

- 本局随机小怪已经确定。
- 本局随机藏宝点已经确定。
- 本局奖励技能池已经确定。
- 战斗过程中只消费这些已经固化的数据。

核心原则：

```text
开局随机，战斗确定。
```

---

## 3.2 StartGameConfig 数据模型

新增或调整 `StartGameConfig`。

```ts
interface StartGameConfig {
  mapTemplateId: string;

  selectedCharacterIds: string[];
  characterPlacements: CharacterPlacement[];

  selectedCommonSkillIdsByCharacterId: Record<string, string[]>;

  randomMonsterCount: number;
  randomTreasureCount: number;

  monsterTemplatePoolIds: string[];
  rewardSkillPoolTemplateIds: string[];

  startSeed?: string;
}
```

默认值规则：

```text
如果 monsterTemplatePoolIds 为空：
默认使用全部 enabled 的 MonsterTemplate，且等概率随机。

如果 rewardSkillPoolTemplateIds 为空：
默认使用全部 enabled 且 usableAs 包含 common 或 reward 的通用技能。

如果 startSeed 为空：
后端生成一个新的随机 seed。
```

数量规则：

```text
第一版使用固定数量：
randomMonsterCount
randomTreasureCount
```

暂时不做 countMin / countMax。

---

## 3.3 开局配置界面

新增或重构为一个统一页面：

```text
Start Game Config Page / 开局配置页面
```

这个页面必须在一个界面内完成以下内容：

### 左侧：地图与角色

1. 选择地图。
2. 展示地图预览。
3. 选择出战角色。
4. 为每个角色选择通用技能。
5. 在地图上拖拽 / 点击设置角色初始位置。

### 右侧：随机性设置

1. 设置随机小怪数量。
2. 设置随机藏宝点数量。
3. 选择小怪种类池。
4. 选择奖励技能池。
5. 显示当前 seed。
6. 按钮：随机预览。
7. 按钮：重新随机。
8. 按钮：开始游戏。

### 底部：预览结果与警告

1. 显示预览的小怪位置。
2. 显示预览的藏宝点位置。
3. 显示奖励池技能数量。
4. 显示可用格子不足等错误。
5. 显示 warning，例如小怪池为空、奖励池为空。

UI 要求：

- 使用 ui-ux-pro-max 优化布局。
- 避免把流程拆成太多步骤。
- 让玩家在一个页面里完成所有开局设置。
- 预览结果要直观显示在地图上。
- 固定实体、角色、随机实体用不同图标或边框区分。

---

## 3.4 随机实体生成顺序

正式开始游戏时，后端按以下顺序生成 `GameState`：

1. 读取 `MapTemplate`。
2. 验证地图 enabled cells。
3. 验证角色初始位置。
4. 创建角色实体并占用角色格子。
5. 创建固定小怪并占用固定小怪格子。
6. 创建固定藏宝点并占用固定藏宝点格子。
7. 基于当前已占用格子，随机生成小怪。
8. 基于当前已占用格子，随机生成藏宝点。
9. 固化 `rewardSkillPoolTemplateIds`。
10. 写入 `GameState`。

伪代码：

```ts
const occupied = new Set<string>();

placeCharacters();
markOccupied(characterPositions);

placeFixedMonsters();
markOccupied(fixedMonsterPositions);

placeFixedTreasures();
markOccupied(fixedTreasurePositions);

const randomMonsters = sampleFreeCells(randomMonsterCount, occupied);
markOccupied(randomMonsterPositions);

const randomTreasures = sampleFreeCells(randomTreasureCount, occupied);
markOccupied(randomTreasurePositions);
```

---

## 3.5 随机格子候选池规则

可随机放置的格子必须满足：

1. `cell.enabled = true`。
2. 地形允许站立 / 放置实体。
3. 不是 `obstacle`。
4. 不是已占用格子。
5. 不在角色初始位置上。
6. 不在固定小怪位置上。
7. 不在固定藏宝点位置上。
8. 不在已经生成的随机小怪位置上。
9. 不在已经生成的随机藏宝点位置上。

第一版不允许：

```text
小怪和藏宝点重叠。
小怪和角色重叠。
藏宝点和角色重叠。
随机实体和固定实体重叠。
```

---

## 3.6 随机生成失败处理

如果可用格子数量不足，应返回明确错误，不要静默少生成。

```json
{
  "error": "NOT_ENOUGH_FREE_CELLS",
  "message": "可用格子不足，无法生成指定数量的小怪和藏宝点。",
  "freeCellCount": 2,
  "requiredCellCount": 5
}
```

前端提示用户：

```text
请减少随机小怪 / 藏宝点数量，或调整角色初始位置 / 地图固定实体。
```

---

## 3.7 小怪种类随机规则

第一版使用等概率随机：

```text
从 monsterTemplatePoolIds 中等概率选择一个小怪模板。
```

如果池为空：

```text
使用全部 enabled 小怪模板。
```

如果没有任何 enabled 小怪模板，但 `randomMonsterCount > 0`，返回错误：

```text
NO_AVAILABLE_MONSTER_TEMPLATE
```

暂时不做权重。

以后可以扩展：

```ts
monsterTemplateWeights: Record<string, number>;
```

---

## 3.8 奖励技能池规则

奖励技能池适用于：

1. 击杀小怪奖励。
2. 挖掘藏宝点奖励。
3. 击杀角色且死亡角色没有可继承通用技能时的随机奖励。

第一版使用一个统一奖励池：

```ts
rewardSkillPoolTemplateIds: string[];
```

默认：

```text
全部 enabled 且 usableAs 包含 common 或 reward 的通用技能。
```

如果池为空：

- 击杀小怪：不给奖励，并写入日志。
- 挖掘藏宝点：不给奖励，并写入日志。
- 击杀角色无可继承通用技能：不给随机补偿奖励。

战斗中必须从：

```ts
GameState.rewardSkillPoolTemplateIds
```

中抽取，不允许实时读取全局技能表重新随机。

---

## 3.9 开局预览 API

新增：

```text
POST /api/game/preview-start
```

请求：

```ts
interface PreviewStartRequest extends StartGameConfig {}
```

返回：

```ts
interface PreviewStartResponse {
  startSeed: string;
  previewMonsters: PreviewMonster[];
  previewTreasures: PreviewTreasure[];
  rewardSkillPoolTemplateIds: string[];
  warnings: string[];
}
```

说明：

- 预览不创建正式 `GameState`。
- 预览只生成随机小怪和藏宝点位置。
- 用户点击“重新随机”时，后端返回新的 `startSeed` 和新结果。
- 用户点击“开始游戏”时提交同一个 `startSeed`，后端复现同样的随机结果。

---

## 3.10 正式开始游戏 API

修改或新增：

```text
POST /api/game/start
```

请求：

```ts
interface StartGameRequest extends StartGameConfig {}
```

返回：

```ts
interface StartGameResponse {
  gameState: GameStateRead;
}
```

要求：

1. 如果传入 `startSeed`，必须使用它。
2. 如果未传入 `startSeed`，后端生成新 seed。
3. 预览和正式开始必须使用同一套随机算法。
4. 同一个 seed + 同一个配置必须得到同样的随机结果。

---

# 4. 阶段 3：地图地形升级

## 4.1 地形系统目标

在原有 enabled / disabled 格子的基础上，引入地形类型。

本阶段地形：

1. 普通地形 `normal`
2. 障碍物 `obstacle`
3. 岩浆 `lava`
4. 沼泽 `swamp`
5. 木桩 `wood_stake`
6. 冰面 `ice`
7. 雷暴 `thunderstorm`

地形会影响：

- 能否站立
- 能否通过
- 移动消耗
- 回合开始效果
- 进入格子效果
- 直线技能阻挡
- 贴图显示
- 技能改变地形

---

## 4.2 MapCell 数据模型升级

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

`terrainState` 用于局内临时地形、可消失地形等：

```ts
interface TerrainState {
  originalTerrainType?: TerrainType;
  duration?: number | "permanent";
  createdBySkillId?: string;
  createdByEntityId?: string;
}
```

---

## 4.3 TerrainDefinition

新增地形配置表：

```ts
interface TerrainDefinition {
  type: TerrainType;
  name: string;
  description: string;

  walkable: boolean;
  blocksLineOfEffect: boolean;
  blocksPlacement: boolean;

  enterCost: number;
  leaveCost: number;

  onEnterEffect?: TerrainEffectConfig;
  onTurnStartEffect?: TerrainEffectConfig;
  onDamagedEffect?: TerrainEffectConfig;

  tileImageUrl?: string;
}
```

默认配置：

```ts
const TERRAIN_DEFINITIONS = {
  normal: {
    walkable: true,
    blocksLineOfEffect: false,
    blocksPlacement: false,
    enterCost: 1,
    leaveCost: 1
  },

  obstacle: {
    walkable: false,
    blocksLineOfEffect: true,
    blocksPlacement: true,
    enterCost: Infinity,
    leaveCost: Infinity
  },

  lava: {
    walkable: true,
    blocksLineOfEffect: false,
    blocksPlacement: false,
    enterCost: 1,
    leaveCost: 1,
    onTurnStartEffect: {
      type: "terrain_damage",
      value: 5,
      damageType: "true"
    }
  },

  swamp: {
    walkable: true,
    blocksLineOfEffect: false,
    blocksPlacement: false,
    enterCost: 1,
    leaveCost: 2
  },

  wood_stake: {
    walkable: true,
    blocksLineOfEffect: false,
    blocksPlacement: false,
    enterCost: 1,
    leaveCost: 1,
    onEnterEffect: {
      type: "terrain_damage_then_disappear",
      value: 10,
      damageType: "true",
      afterTriggerTerrainType: "normal"
    }
  },

  ice: {
    walkable: true,
    blocksLineOfEffect: false,
    blocksPlacement: false,
    enterCost: 0,
    leaveCost: 0
  },

  thunderstorm: {
    walkable: true,
    blocksLineOfEffect: false,
    blocksPlacement: false,
    enterCost: 1,
    leaveCost: 1,
    onTurnStartEffect: {
      type: "luck_based_damage",
      value: 30,
      damageType: "true",
      probabilityFormula: "1 - luck"
    }
  }
};
```

---

## 4.4 地形规则：normal

普通地形：

- 可站立。
- 可移动进入。
- 可部署。
- 离开消耗 1 行动点。
- 无特殊效果。

---

## 4.5 地形规则：obstacle

障碍物：

- 不可站立。
- 不可移动进入。
- 不可部署角色、小怪、藏宝点。
- 阻挡直线技能。
- 不能作为随机小怪或藏宝点生成位置。
- 不能被选为普通移动目标。

直线技能，例如激光：

```text
遇到 obstacle 时停止继续延伸。
```

---

## 4.6 地形规则：lava

岩浆：

- 可站立。
- 可移动进入。
- 可部署，但建议地图编辑器给出危险提示。
- 每次角色 / 召唤物回合开始时受到 5 点真实伤害。
- 岩浆伤害不触发小怪反击。
- 岩浆伤害 source 为 `terrain`。
- 如果因岩浆死亡，不发放击杀奖励。

小怪第一版没有主动回合，因此小怪不主动触发岩浆回合开始伤害。

---

## 4.7 地形规则：swamp

沼泽：

- 可站立。
- 可移动进入。
- 可部署。
- 进入沼泽消耗 1 行动点。
- 从沼泽移动出去需要 2 行动点。

实现方式：

```text
移动一格消耗当前所在格子的 terrain.leaveCost。
```

因此：

```text
普通 -> 沼泽：消耗 1
沼泽 -> 普通：消耗 2
沼泽 -> 沼泽：消耗 2
```

---

## 4.8 地形规则：wood_stake

木桩：

```text
木桩格等同于障碍，但是有10点血量，可以被选为攻击目标，血量归0后格子变回 normal。
```

规则：

1. 木桩不可站立。
2. 木桩不可移动进入。
3. 木桩不可部署。
4. 木桩防御值为0.
5. 木桩伤害不触发小怪反击。

---

## 4.9 地形规则：ice

冰面：

```text
在冰面上移动消耗 0 行动点。
```

规则：

1. 冰面可站立。
2. 冰面可移动进入。
3. 冰面可部署。
4. 从冰面移动到任意相邻格，消耗 0 行动点。
5. 从普通地形进入冰面，消耗取决于当前格子的 `leaveCost`，通常为 1。
6. 从冰面到冰面，消耗 0。
7. 从冰面到普通地形，消耗 0。

注意：

```text
冰面只改变行动点消耗，不自动滑行。
```

第一版不要做“滑到尽头”的复杂冰面机制。

---

## 4.10 地形规则：thunderstorm

雷暴：

```text
回合开始时，若单位位于雷暴格上，以 1 - 幸运值 的概率受到 30 点真实伤害。
```

为避免概率歧义，统一定义：

```text
luck 的范围是 0 到 100。
受到雷击概率 = max(0, min(100, 100 - luck)) / 100。
```

例子：

```text
luck = 0   -> 100% 受到雷击
luck = 30  -> 70% 受到雷击
luck = 70  -> 30% 受到雷击
luck = 100 -> 0% 受到雷击
```

规则：

1. 雷暴可站立。
2. 雷暴可移动进入。
3. 雷暴可部署，但 UI 应提示危险。
4. 每次角色 / 召唤物回合开始时判定一次。
5. 如果判定失败，受到 30 点真实伤害。
6. 雷暴伤害不触发小怪反击。
7. 雷暴伤害 source 为 `terrain`。
8. 如果因雷暴死亡，不发放击杀奖励。
9. 小怪没有主动回合，因此第一版小怪不主动触发雷暴回合开始判定。
10. 雷暴判定结果要进入战斗日志和 `BattleEvent`。

---

## 4.11 移动系统修改

原规则：

```text
移动一格消耗 1 行动点。
```

新规则：

```text
移动一格消耗当前所在格子的 terrain.leaveCost。
```

校验：

1. 目标格必须 enabled。
2. 目标格必须 walkable。
3. 目标格不能已有角色、小怪、召唤物、藏宝点等占位实体。
4. 当前角色不能处于禁走 root 状态。
5. 当前角色行动点必须大于等于移动消耗。
6. 如果移动消耗为 0，允许在没有行动点时移动。
7. 为防止冰面导致无限移动，第一版仍然保留“每次移动只能移动一格”的规则，但不额外限制 0AP 移动次数。
8. 如果后续发现冰面太强，再增加每回合最大移动次数限制。

行动点消耗仍然：

```text
优先消耗 temporaryAP，再消耗 permanentAP。
```

---

## 4.12 地形触发时机

### onEnterEffect

进入格子后立即触发。

适用：

```text
wood_stake
```

流程：

```text
移动成功
↓
角色位置更新
↓
触发目标格 onEnterEffect
↓
产生伤害 / 地形变化 / 事件
```

### onTurnStartEffect

角色 / 召唤物每次行动开始时触发。

适用：

```text
lava
thunderstorm
```

流程：

```text
行动开始
↓
检查所在格地形
↓
触发 onTurnStartEffect
↓
如果因此死亡，则本次行动结束
↓
如果存活，再处理 Buff、眩晕、临时行动点等
```

建议顺序：

```text
1. 地形回合开始效果
2. Buff 回合开始效果
3. 死亡检查
4. 眩晕检查
5. 获得 temporaryAP
```

---

## 4.13 技能范围与地形

第一版规则：

1. 单体技能：只要求目标格 enabled，目标存在，距离满足。
2. 范围技能：范围内 disabled cell 自动跳过。
3. 直线技能：遇到 disabled cell 或 obstacle cell 时停止。
4. 箭雨、C4 等范围技能可以越过障碍物影响范围内目标。
5. 如果以后需要，可以增加 `respectLineOfSight` 字段。

默认：

```text
激光受障碍物阻挡。
箭雨和 C4 不受障碍物阻挡。
```

---

## 4.14 地图编辑器地形功能

地图编辑器新增工具：

1. 设置普通地形。
2. 设置障碍物。
3. 设置岩浆。
4. 设置沼泽。
5. 设置木桩。
6. 设置冰面。
7. 设置雷暴。
8. 批量刷地形。
9. 地形橡皮擦 / 恢复普通地形。

UI 要求：

- 使用 ui-ux-pro-max 优化工具栏。
- 左侧工具栏显示地形类型。
- 每个地形有图标、名称、简短说明。
- 鼠标悬停显示地形说明。
- 地图格子根据 `terrainType` 显示不同贴图或颜色。
- 暂时没有贴图时使用颜色占位。
- 保存地图时校验固定实体不能位于 obstacle 上。

建议颜色占位：

```text
normal：浅色
obstacle：深灰 / 石块
lava：红橙
swamp：深绿
wood_stake：棕色
ice：浅蓝
thunderstorm：紫蓝
```

---

## 4.15 技能改变地形

为后续技能扩展增加 Effect：

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

1. 可以把普通地形改成 lava、swamp、wood_stake、ice、thunderstorm。
2. 不允许把有占位实体的格子改成 obstacle，除非后续明确设计挤出或击杀规则。
3. 临时地形到期后恢复原 terrainType。
4. 地形改变要记录在 `GameState`，而不是修改 `MapTemplate`。
5. 地形改变产生 `terrain_changed` 事件，用于动画。

---

# 5. 阶段 4：完善技能动画

## 5.1 技能动画目标

技能动画只负责表现，不影响规则结算。

原则：

```text
后端先结算规则并返回事件。
前端根据事件播放动画。
动画不阻塞 API 结算。
```

---

## 5.2 SkillTemplate 表现字段

为 `SkillTemplate` 增加：

```ts
interface SkillVisualConfig {
  visualKey?: string;
  impactColor?: string;
  trailType?: string;
  soundKey?: string;
}
```

`SkillTemplate` 增加字段：

```ts
visual?: SkillVisualConfig;
```

推荐 `visualKey`：

```text
slash
blast
heal
laser-line
chain-link
buff-up
curse
burn
stun
arrow-rain
execute
swap
terrain-lava
terrain-wood-stake
terrain-ice
terrain-thunderstorm
```

---

## 5.3 BattleEvent 模型

后端返回标准化事件：

```ts
interface BattleEvent {
  id: string;
  type: BattleEventType;
  timestamp: number;

  actorId?: string;
  targetIds?: string[];

  sourcePosition?: Position;
  targetPositions?: Position[];

  skillTemplateId?: string;
  visualKey?: string;

  value?: number;
  metadata?: Record<string, any>;
}
```

```ts
type BattleEventType =
  | "skill_cast"
  | "damage"
  | "heal"
  | "buff_applied"
  | "buff_removed"
  | "move"
  | "death"
  | "counter_attack"
  | "treasure_dig_success"
  | "treasure_dig_fail"
  | "terrain_triggered"
  | "terrain_changed";
```

`GameStateRead` 中增加：

```ts
recentEvents: BattleEvent[];
```

注意：

```text
recentEvents 不能无限累积。
```

可以只返回最近一次操作产生的事件，或设置最大长度。

---

## 5.4 BattleEffectsLayer

前端新增：

```text
BattleEffectsLayer
```

职责：

1. 接收 `recentEvents`。
2. 根据 `event.visualKey` 和 `event.type` 查找动画组件。
3. 在地图格子坐标上播放动画。
4. 动画结束后自动移除。

动画时间：

```text
600ms 到 900ms。
```

不要为了动画等待后端结算。

---

## 5.5 第一版必须实现的动画

必须实现：

1. 普通攻击 / `slash`：短线斩击。
2. 炸弹 / `blast`：目标格爆炸圆环。
3. 治疗 / `heal`：绿色数字上浮。
4. 激光 / `laser-line`：直线光束。
5. 铁索连环 / `chain-link`：两个目标间锁链线。
6. Buff 提升 / `buff-up`：向上箭头光效。
7. 诅咒 / `curse`：紫色闪烁。
8. 灼烧 / `burn`：火焰小特效。
9. 眩晕 / `stun`：星星或旋转图标。
10. 死亡 / `death`：淡出变灰。
11. 反击 / `counter_attack`：反向斩击提示。
12. 地形改变 / `terrain_changed`：格子闪光后切换贴图。
13. 木桩触发 / `terrain-wood-stake`：棕色破裂或尖刺消失效果。
14. 冰面移动 / `terrain-ice`：浅蓝滑动残影。
15. 雷暴触发 / `terrain-thunderstorm`：紫蓝闪电落下。

---

## 5.6 动画实现边界

禁止：

1. 不要让动画控制战斗结算。
2. 不要每个技能写一套完全独立逻辑。
3. 不要使用大量 GIF 或视频。
4. 不要让后端等待动画完成。
5. 不要在前端重新计算技能伤害或命中。

允许：

1. CSS 动画。
2. SVG 连线。
3. 少量 Canvas overlay。
4. 根据 `visualKey` 做统一动画映射。

---

# 6. 测试清单

## 6.1 小怪测试

- 创建小怪模板。
- 编辑小怪模板。
- 删除未使用小怪模板。
- 固定小怪进入战斗。
- 小怪受到攻击反击。
- 小怪死亡发奖励。
- 小怪不进入行动队列。

---

## 6.2 随机性测试

- 默认小怪池为全部 enabled 小怪。
- 默认奖励池为全部通用技能。
- 用户选择小怪池后，只从该池生成。
- 用户选择奖励池后，只从该池奖励。
- 角色格子不会生成随机小怪。
- 角色格子不会生成随机藏宝点。
- 固定实体和随机实体不重叠。
- 随机实体之间不重叠。
- 可用格子不足时报错。
- 同 seed 复现同结果。
- 开局配置界面内可以一次性完成全部随机性设置。

---

## 6.3 地形测试

- 地图编辑器能设置 normal、obstacle、lava、swamp、wood_stake、ice、thunderstorm。
- 障碍物不可进入。
- 障碍物不可部署。
- 障碍物阻挡激光。
- 岩浆回合开始扣血。
- 岩浆导致死亡时不发击杀奖励。
- 沼泽离开消耗 2 行动点。
- 行动点不足时不能离开沼泽。
- 木桩受到10 点真实伤害后变为 normal。
- 木桩不可进入，不可部署，但可以收到伤害。
- 冰面离开消耗 0 行动点。
- 雷暴按 `100 - luck` 的概率造成 30 点真实伤害。
- 雷暴伤害不发击杀奖励。
- `change_terrain` 不修改 `MapTemplate`，只修改 `GameState`。

---

## 6.4 动画测试

- 每种 `visualKey` 都有降级动画。
- 缺少 `visualKey` 时使用默认动画。
- 连续技能事件不会导致动画层崩溃。
- 动画结束后自动清理。
- `recentEvents` 不会无限累积。
- 地形触发和地形改变有清晰动画反馈。

---

# 7. UI 要求：使用 ui-ux-pro-max

前端实现要求：

```text
在实现前端界面时，请使用或参考 ui-ux-pro-max skill。
```

重点优化：

1. 开局配置界面。
2. 小怪管理页面。
3. 地图编辑器。
4. 地形工具栏。
5. 战斗界面。
6. 技能动画层。
7. 战斗日志。
8. 错误提示和 warning 提示。

UI 风格要求：

- 看起来像完整游戏，而不是调试工具。
- 布局清晰。
- 操作路径短。
- 地图区域始终是视觉中心。
- 随机预览必须直观。
- 地形、角色、小怪、藏宝点必须容易区分。
- 动画轻量但有反馈。

---

# 8. 给 Codex 的总提示词

```text
请根据本文档实现新增小怪、开局随机性、地图地形升级和技能动画完善。

本次开发全部交给 Codex 完成。前端界面实现时请使用或参考 ui-ux-pro-max skill，提高界面质量和游戏感。

关键要求：
1. MapTemplate 只保存固定小怪、固定藏宝点、地图格子、部署区域和地形，不保存随机规则。
2. 所有随机性设置整合到一个开局配置界面内，不要拆成复杂多步骤流程。
3. 开局配置界面内完成：地图选择、角色选择、通用技能选择、初始站位、随机小怪数量、随机藏宝点数量、小怪种类池、奖励技能池、随机预览、开始游戏。
4. 随机结果必须在开局时固化到 GameState，战斗过程中不再临时生成随机小怪或藏宝点。
5. 开局随机必须在角色初始位置确定后执行，确保小怪、藏宝点、角色、固定实体不会处于同一格子。
6. 使用 startSeed 支持随机预览和正式开局复现。
7. 新增 MonsterTemplate、小怪 CRUD、小怪固定放置、小怪反击和死亡奖励逻辑。
8. 增加地形系统：normal、obstacle、lava、swamp、wood_stake、ice、thunderstorm。
9. 移动消耗改为由当前格子的 terrain.leaveCost 决定。
10. 沼泽离开需要 2 行动点。
11. 冰面离开需要 0 行动点，但不做自动滑行。
12. 岩浆在角色 / 召唤物回合开始时造成 5 点真实伤害。
13. 木桩在单位进入时造成 10 点真实伤害，然后变为 normal。
14. 雷暴在角色 / 召唤物回合开始时，以 max(0, min(100, 100 - luck)) / 100 的概率造成 30 点真实伤害。
15. 障碍物阻挡移动、部署和激光等直线技能。
16. 支持 change_terrain Effect，使技能可以在局内改变地形，但只能修改 GameState，不能修改 MapTemplate。
17. 技能动画采用后端 BattleEvent + 前端 BattleEffectsLayer，不要让动画影响规则结算。
18. 优先实现后端数据模型、规则校验和测试，再实现 UI。
19. 不要重写已有 game-core，只做兼容式扩展。
```
