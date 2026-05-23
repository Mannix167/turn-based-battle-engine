# 战棋小游戏项目总需求说明与代码核对清单

## 0. 文档用途

本文档用于让 LLM / Codex / Qoder 对当前项目进行整体核对：

1. 检查代码是否完整实现了项目需求。
2. 检查不同阶段之间是否存在实现冲突。
3. 检查前后端职责是否混乱。
4. 检查 game-core 是否被错误重构。
5. 检查 UI 是否遗漏关键交互。
6. 检查规则、数据模型、API、测试是否覆盖完整。

建议给 LLM 的使用方式：

```text
请阅读这份项目总需求说明与代码核对清单，对当前代码仓库进行全面检查：
1. 找出未实现的需求。
2. 找出实现不完整或与需求冲突的地方。
3. 找出潜在 bug。
4. 给出按优先级排序的修复建议。
5. 不要重写项目，只做兼容式修复。
```

---

# 1. 项目总体定位

## 1.1 项目类型

本项目是一个本地运行的网页端战棋小游戏。

基本形态：

```text
本地后端服务 + React 前端 + 浏览器访问
```

当前不要求打包为桌面 App。后续可考虑浏览器全屏、PWA、Electron / Tauri，但不是当前必须项。

## 1.2 游戏类型

游戏是一个回合制、方格制、技能驱动的战棋沙盒。

核心玩法：

1. 玩家在地图上操控多个角色。
2. 每个角色有属性、行动点、技能。
3. 每回合按速度排序行动。
4. 玩家可以移动、攻击、释放技能、挖宝、结束行动。
5. 地图中存在生物 / 怪物 / 召唤物 / 藏宝点 / 地形。
6. 技能是游戏核心，可造成伤害、治疗、控制、结盟、召唤、改变地形等。
7. 游戏支持自定义角色、技能、地图、生物。
8. 当前所有单位都由玩家手动控制，后续可加入 AI 控制。

## 1.3 分层原则

```text
Frontend：
- UI 展示
- 地图交互
- 表单编辑
- 动画特效
- 音效播放
- 用户操作发起 API 请求

Backend / game-core：
- 回合规则
- 行动点规则
- 技能结算
- 伤害计算
- Buff 结算
- 地形结算
- 随机生成
- 胜负判断
- 数据校验

Database / Local Storage：
- 角色模板
- 技能模板
- 生物模板
- 地图模板
- 图片路径
- 配置数据
```

关键原则：

```text
前端不能重新计算最终规则。
后端必须是规则真相来源。
```

---

# 2. 核心对象与数据模型

## 2.1 CharacterTemplate

角色模板应支持：

```ts
interface CharacterTemplate {
  id: string;
  name: string;
  description?: string;

  rarity: Rarity;
  skillPointCapacity: number;

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

角色规则：

1. 角色是主要参赛单位。
2. 角色有 HP、攻击、防御、速度、暴击率、幸运值、攻击距离。
3. 角色每局开始默认拥有 3 点永久行动点。
4. 角色每次行动开始获得临时行动点，数量取决于 `temporaryApPerTurn`。
5. 临时行动点不能保存到下一次行动。
6. 永久行动点可以保存。
7. 角色可以携带角色特定技能和通用技能。
8. 角色特定技能默认每局携带，不占技能点。
9. 通用技能可在开局选择，也可局内获得。
10. 角色死亡后，击杀者可以获得其未使用的通用技能；如果没有，则从本局奖励池随机获得一个。

## 2.2 SkillTemplate

技能模板应支持：

```ts
interface SkillTemplate {
  id: string;
  name: string;
  description: string;

  iconUrl?: string;

  skillKind: "built_in" | "configurable";
  enabled: boolean;

  rarity: Rarity;
  skillPointCost: number;
  categories: SkillCategory[];

  usableAs: Array<"character" | "common" | "reward" | "summon">;

  cost: number;
  range?: number;
  rangeMode?: "fixed" | "caster_attack_range";

  targetType:
    | "self"
    | "single_entity"
    | "two_entities"
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
  canTargetTerrain?: boolean;
  allowedTerrainTargets?: TerrainType[];

  affectSelfDamage: boolean;

  effects: EffectConfig[];
  customHandlerKey?: string;

  visual?: SkillVisualConfig;

  isSystemSkill: boolean;
  editable: boolean;

  createdAt: string;
  updatedAt: string;
}
```

技能基础规则：

1. 所有技能都是一次性消耗。
2. 同一技能可以有数量堆叠。
3. 使用一次技能后数量 -1。
4. 同一角色同一技能最大数量为 3。
5. 技能释放成功后才消耗 AP 和技能数量。
6. 目标非法、行动点不足、沉默状态等情况下不消耗技能。
7. 除 self 类型技能外，默认施法距离使用施法者当前 `attackRange`，除非技能指定固定 range。
8. 技能分为内置技能和配置型技能。
9. 配置型技能通过 `effects[]` 组合执行。
10. 特别复杂技能可使用 `customHandlerKey`。
11. 系统自带技能可以直接编辑可编辑属性，不需要复制为自定义技能。

## 2.3 SkillStack

角色 / 召唤物持有技能建议使用堆叠结构：

```ts
interface SkillStack {
  templateId: string;
  ownerEntityId: string;

  quantity: number;
  maxQuantity: number; // 默认 3

  sourceTypes: SkillSourceType[];

  acquiredAt?: string;
}

type SkillSourceType =
  | "character"
  | "common"
  | "reward"
  | "summon";
```

堆叠规则：

1. 新获得技能时，如果没有该技能，新增堆叠，数量为 1。
2. 如果已有且数量小于 3，则数量 +1。
3. 如果已有且数量达到 3，第一版丢弃奖励并写入日志。
4. 使用技能后数量 -1。
5. 数量为 0 后从技能栏移除。
6. 开局选择通用技能时允许选择同一技能多份，但最多 3 份。

## 2.4 CreatureTemplate

“小怪管理”最终应升级为“生物管理”。

```ts
interface CreatureTemplate {
  id: string;
  name: string;
  description?: string;

  rarity?: Rarity;

  maxHp: number;
  baseAttack: number;
  baseDefense: number;
  attackRange: number;

  speed: number;
  critRate: number;
  luck: number;
  temporaryApPerTurn: number;

  tokenImageUrl?: string;
  portraitImageUrl?: string;

  enabled: boolean;

  canSpawnAsMonster: boolean;
  canBeSummoned: boolean;

  summonSkillTemplateIds: string[];

  createdAt: string;
  updatedAt: string;
}
```

生物可以以两种形式进入战斗：

```text
monster：怪物
summon：召唤物
```

## 2.5 Monster 怪物

怪物规则：

1. 由地图固定生成或开局随机生成。
2. 没有主动回合。
3. 不进入行动队列。
4. 不主动攻击。
5. 不携带技能。
6. 受到普通攻击或直接伤害技能后，若攻击者在攻击范围内，立即反击一次。
7. 每次受到直接攻击都可以反击。
8. 死亡后，击杀者从本局奖励技能池中随机获得一个通用技能。
9. 占据一个格子。
10. 不触发主动回合开始地形效果，因为没有主动回合。

怪物反击不应由以下伤害触发：

```text
灼烧持续伤害
C4 延迟爆炸
铁索连环同步伤害
地形伤害
木桩 / 雷暴 / 岩浆等环境伤害
```

## 2.6 Summon 召唤物

召唤物规则：

1. 由技能在局内召唤。
2. 有自己的回合。
3. 进入行动队列。
4. 有自己的属性和行动点。
5. 类似角色，可以移动、攻击、释放技能。
6. 默认与主人永久结盟。
7. 继承主人的阵营。
8. 可以获得技能。
9. 可以使用技能。
10. 可以使用技能召唤召唤物。
11. 主人死亡后，召唤物立即死亡。
12. 召唤链应递归清理。
13. 召唤物死亡默认不发放击杀角色奖励。
14. 被召唤后从下一轮开始加入速度排序，不立即行动。

## 2.7 MapTemplate

地图模板：

```ts
interface MapTemplate {
  id: string;
  name: string;
  description?: string;

  width: number;
  height: number;

  cells: MapCell[];

  fixedMonsters?: MapFixedMonster[];
  fixedCreatures?: MapFixedCreature[];
  fixedTreasures: MapFixedTreasure[];

  spawnZones?: SpawnZone[];

  createdAt: string;
  updatedAt: string;
}
```

地图规则：

1. 方格制。
2. 地图有 width、height。
3. 地图形状通过 `cell.enabled` 控制。
4. enabled=false 的格子不可移动、不可攻击、不可部署、不可随机生成。
5. 一个格子最多只能有一个占位实体。
6. 地图模板只保存固定内容。
7. 地图模板不保存随机规则。
8. 开局时由 MapTemplate 生成 GameState 中的地图快照。
9. 战斗中地形变化只修改 GameState，不修改 MapTemplate。

## 2.8 Terrain 地形

当前地形应支持：

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

地形规则：

| 地形              | 可进入 | 可部署     | 阻挡直线技能 | 特殊效果                    |
| --------------- | ---:| -------:| ------:| ----------------------- |
| normal 普通       | 是   | 是       | 否      | 无                       |
| obstacle 障碍物    | 否   | 否       | 是      | 阻挡移动和直线技能               |
| lava 岩浆         | 是   | 是，但提示危险 | 否      | 回合开始受到 5 点真实伤害          |
| swamp 沼泽        | 是   | 是       | 否      | 从该格离开需要 2 AP            |
| wood_stake 木桩   | 否   | 否       | 是      | 有 10 HP，可被攻击，归零变 normal |
| ice 冰面          | 是   | 是       | 否      | 从该格离开消耗 0 AP，不自动滑行      |
| thunderstorm 雷暴 | 是   | 是，但提示危险 | 否      | 回合开始按幸运判定，可能受到 30 点真实伤害 |

木桩统一规则：

```text
木桩是不可进入的可破坏地形。
木桩不是“进入后受到伤害再消失”的陷阱。
木桩有 10 HP、防御 0。
木桩可被普通攻击。
木桩 HP 归 0 后变为 normal。
木桩被摧毁不发放击杀奖励。
```

雷暴概率：

```text
luck 范围为 0 到 100。
受到雷击概率 = max(0, min(100, 100 - luck)) / 100。
雷暴伤害 = 30 点真实伤害。
```

## 2.9 Treasure 藏宝点

藏宝点规则：

1. 占据格子。
2. 只能挖掘一次。
3. 挖宝范围使用角色攻击距离。
4. 挖宝消耗 1 AP。
5. 挖宝成功率由角色幸运值决定。
6. 幸运值 70 表示 70% 成功率。
7. 挖宝失败时：
   - 50% 无事发生
   - 50% 扣除固定血量，默认 10 HP
8. 挖宝成功后，从本局奖励技能池获得通用技能。
9. 藏宝点不能与角色、小怪、召唤物、固定实体、随机实体重叠。
10. 藏宝点不能生成在 obstacle 或 wood_stake 上。

---

# 3. 行动点与回合系统

## 3.1 行动点类型

角色 / 召唤物拥有两种行动点：

```text
permanentAP：永久行动点
temporaryAP：临时行动点
```

规则：

1. 永久行动点开局默认 3 点。
2. 永久行动点可以保留到下回合。
3. 永久行动点只能通过技能等特殊方式增加。
4. 临时行动点每次行动开始获得。
5. 临时行动点数量由 `temporaryApPerTurn` 决定。
6. 临时行动点不能保存到下一次行动。
7. 消耗行动点时优先消耗临时行动点，再消耗永久行动点。

## 3.2 行动消耗

| 行动   | 消耗                    |
| ---- | ---------------------:|
| 移动一格 | 由当前格地形 `leaveCost` 决定 |
| 普通攻击 | 1 AP                  |
| 挖宝   | 1 AP                  |
| 技能   | 使用技能自身 cost           |
| 结束行动 | 0 AP                  |

地形移动消耗：

```text
normal 离开：1 AP
swamp 离开：2 AP
ice 离开：0 AP
lava 离开：1 AP
thunderstorm 离开：1 AP
```

## 3.3 回合顺序

1. 每轮开始时，根据速度排序。
2. 速度高者先行动。
3. 速度相同按加入战斗顺序。
4. 召唤物被召唤后，从下一轮开始参与排序。
5. 额外行动技能使目标下一轮额外出现一次。
6. 额外行动建议每个目标下一轮最多额外 1 次，避免无限行动。

## 3.4 行动开始触发顺序

```text
1. 检查是否存活
2. 触发回合开始地形效果，例如 lava、thunderstorm
3. 触发回合开始 Buff，例如 burn
4. 如果因伤害死亡，行动结束
5. 判断是否眩晕
6. 如果眩晕，跳过本次行动机会
7. 如果未眩晕，获得 temporaryAP
8. 玩家操作
```

---

# 4. 伤害、治疗与死亡规则

## 4.1 普通伤害

```text
最终伤害 = max(1, 伤害值 - 目标当前防御)
```

普通伤害可以暴击。暴击时，伤害值先乘以暴击倍率，再减防御。默认暴击倍率可为 1.5。

## 4.2 真实伤害

```text
无视防御
不触发暴击
直接扣除生命值
```

## 4.3 百分比伤害

```text
伤害 = ceil(目标 maxHp * 百分比)
无视防御
不触发暴击
```

## 4.4 自己免疫自己的伤害

默认规则：

```text
角色所有伤害默认对自己不扣血。
```

明确设计的副作用除外：

```text
肾上腺素到期自伤
地形伤害
失败挖宝惩罚
```

## 4.5 盟友不能相互伤害

如果两个实体互为盟友：

```text
不能普通攻击
不能被伤害技能命中
范围伤害自动跳过盟友
可以治疗 / 增益盟友
```

盟友判断应同时考虑：

```text
阵营 faction
结盟系统 allianceSystem
```

## 4.6 死亡奖励

1. 角色死亡后，击杀者可以从其未使用的通用技能中选择一个。
2. 如果死亡角色没有可继承通用技能，则击杀者从奖励技能池随机获得一个。
3. monster 死亡后，击杀者从奖励技能池随机获得一个通用技能。
4. summon 死亡默认不发放击杀角色奖励。
5. 地形伤害导致死亡不发放击杀奖励。
6. 木桩被摧毁不发放击杀奖励。
7. C4、灼烧等间接伤害如果记录了 sourceEntityId，可将奖励归给来源实体；如果来源实体不存在或已死亡，可不发放奖励。

---

# 5. Buff 与状态系统

## 5.1 应支持 Buff

```text
stun 眩晕
burn 灼烧
silence 沉默
root 禁走
stat_modifier 属性修改
next_damage_multiplier 下一次伤害倍率
damage_sync_link 伤害同步
adrenaline 肾上腺素
alliance 结盟状态 / 临时联盟
```

## 5.2 持续时间口径

统一采用：

```text
持续 N 回合 = 目标的 N 次行动机会
```

例子：

```text
眩晕 1 回合：跳过目标下一次行动机会。
灼烧 3 回合：目标接下来 3 次行动开始时扣血。
沉默 3 回合：目标接下来 3 次行动机会内不能使用技能。
禁走 3 回合：目标接下来 3 次行动机会内不能移动。
```

如果目标因为额外行动在一轮中出现两次行动机会，每次行动机会都应计算持续时间。

## 5.3 关键状态效果

### stun 眩晕

```text
跳过下一次行动机会。
```

### burn 灼烧

```text
行动开始时受到真实伤害。
不触发小怪反击。
可记录 sourceEntityId。
```

### silence 沉默

```text
不能使用技能。
仍可移动、普通攻击、挖宝、结束行动。
```

### root 禁走

```text
不能移动。
仍可普通攻击、使用技能、挖宝、结束行动。
```

### next_damage_multiplier 临界爆发

```text
下一次由该角色主动造成的直接伤害翻倍。
不增强灼烧、C4、同步伤害、地形伤害、副作用伤害。
如果一次技能命中多个目标，该次技能全部直接伤害可统一翻倍，然后消耗 Buff。
```

---

# 6. 技能系统总览

## 6.1 技能类型

技能分为：

```text
角色特定技能 character skill
通用技能 common skill
奖励技能 reward skill
召唤物技能 summon skill
```

规则：

1. 角色特定技能每局默认携带。
2. 角色特定技能不占技能点。
3. 通用技能可以开局选择。
4. 通用技能可以局内通过挖宝、击杀怪物、击杀角色奖励获得。
5. 召唤物可以拥有和使用技能。
6. 所有技能使用后数量 -1。

## 6.2 技能稀有度

```text
普通 common：白
稀有 rare：绿
罕见 uncommon：蓝
史诗 epic：紫
传说 legendary：金
```

稀有度影响：

1. 开局选择通用技能时的技能点消耗。
2. 局内随机获得技能时的抽取概率。

默认技能点消耗：

| 稀有度 | 消耗  |
| --- | ---:|
| 普通  | 1   |
| 稀有  | 2   |
| 罕见  | 3   |
| 史诗  | 4   |
| 传说  | 5   |

默认随机权重：

| 稀有度 | 权重  |
| --- | ---:|
| 普通  | 50  |
| 稀有  | 25  |
| 罕见  | 15  |
| 史诗  | 8   |
| 传说  | 2   |

## 6.3 技能分类

```ts
type SkillCategory =
  | "damage"
  | "heal"
  | "buff"
  | "debuff"
  | "control"
  | "movement"
  | "summon"
  | "terrain"
  | "alliance"
  | "resource"
  | "special";
```

技能管理和开局技能选择都应支持搜索与分类筛选。

## 6.4 系统技能可编辑

系统自带技能允许直接编辑：

```text
名称
描述
图标
稀有度
技能点消耗
分类
是否启用
usableAs
visualKey
soundKey
数值参数
AP 消耗
范围
持续时间
```

不建议直接编辑：

```text
customHandlerKey
复杂技能底层逻辑
防递归逻辑
特殊事件监听器
```

要求：

1. 系统技能应 seed 到数据库。
2. 用户修改后不应在每次启动时被 seed 覆盖。
3. 技能用 `isSystemSkill` 标记来源。
4. 技能用 `editable` 控制是否可编辑。
5. 可预留“恢复默认值”功能。

---

# 7. 第一版技能需求总览

第一版通用技能包括：

```text
炸弹
医疗包
攻击力提升
强身健体
迅捷如风
幸运四叶草
早有准备
C4炸弹
铁索连环
结盟
肾上腺素
铜墙铁壁
乾坤大挪移
人品爆发
激光
临界爆发
正中靶心
牢狱之灾
灼烧
箭雨
身轻如燕
肌无力
破甲
霉运当头
再来一次
诅咒
重击
咒死
沉默
禁走
随机一击
```

## 7.1 复杂技能关键规则

### C4 炸弹

```text
选择一个格子。
释放后第 3 轮开始时爆炸。
爆炸时命中当时 3x3 范围内的非盟友活体单位。
不触发小怪反击。
```

### 铁索连环

```text
选择两个目标。
持续期间一方受到直接伤害，另一方受到等量真实伤害。
同步伤害不暴击、不减防、不触发反击、不再次触发同步。
必须防递归。
```

### 临界爆发

```text
给自己添加下一次主动直接伤害翻倍 Buff。
不增强灼烧、C4、同步伤害、地形伤害、副作用伤害。
```

### 乾坤大挪移

```text
交换两个目标当前 HP。
不视为伤害或治疗。
不触发反击、同步、暴击。
```

### 咒死

```text
若目标 currentHp < maxHp * 0.15，则直接死亡。
不视为伤害。
条件不满足时技能仍然消耗。
```

### 沉默

```text
目标持续 3 次行动机会不能使用技能。
```

### 禁走

```text
目标持续 3 次行动机会不能移动。
```

---

# 8. 开局配置与随机性

## 8.1 开局配置原则

开局配置应在一个界面中完成，而不是拆成复杂多步。

开局配置页面应包含：

```text
选择地图
选择角色
选择角色通用技能
设置角色初始位置
设置随机怪物数量
设置随机藏宝点数量
选择怪物种类池
选择奖励技能池
设置角色阵营
随机预览
开始游戏
```

## 8.2 StartGameConfig

```ts
interface StartGameConfig {
  mapTemplateId: string;

  selectedCharacterIds: string[];
  characterPlacements: CharacterPlacement[];

  selectedCommonSkillIdsByCharacterId?: Record<string, string[]>;
  selectedCommonSkillStacksByCharacterId?: Record<string, SkillStackSelection[]>;

  randomMonsterCount: number;
  randomTreasureCount: number;

  monsterTemplatePoolIds?: string[];
  creatureMonsterPoolIds?: string[];

  rewardSkillPoolTemplateIds: string[];

  factions?: Faction[];
  characterFactionAssignments?: Record<string, string>;

  startSeed?: string;
}
```

## 8.3 随机生成规则

随机性只在游戏开始前配置和执行。

地图模板只保存固定内容：

```text
固定怪物 / 小怪
固定藏宝点
地形
部署区
地图格子
```

地图模板不保存：

```text
随机怪物数量
随机藏宝点数量
怪物随机池
奖励技能池
随机 seed
```

随机生成顺序：

```text
读取 MapTemplate
验证角色初始位置
放置角色并占格
放置固定怪物并占格
放置固定藏宝点并占格
随机生成怪物
随机生成藏宝点
固化奖励技能池
写入 GameState
```

随机实体不能生成在：

```text
enabled = false 的格子
obstacle
wood_stake
已有角色
已有固定怪物
已有固定藏宝点
已有随机怪物
已有随机藏宝点
```

可生成在：

```text
normal
lava
swamp
ice
thunderstorm
```

但 lava / thunderstorm 应给危险提示。

## 8.4 startSeed

要求：

1. preview-start 和 start 使用同一随机算法。
2. 同一 `startSeed + 同一配置` 必须得到同一随机结果。
3. 预览不创建正式 GameState。
4. 正式开始游戏时才写入 GameState。

API：

```text
POST /api/game/preview-start
POST /api/game/start
```

---

# 9. 阵营与结盟系统

## 9.1 Faction 阵营

```ts
interface Faction {
  id: string;
  name: string;
  color: string;
  iconUrl?: string;
}
```

默认：

```text
每个角色一个独立阵营。
```

如果玩家在开局前把多个角色放入同一阵营：

```text
这些角色开局互为盟友。
```

## 9.2 BattleEntity 阵营字段

```ts
interface BattleEntity {
  factionId: string;
}
```

规则：

```text
角色：由开局配置决定 factionId。
召唤物：继承 owner.factionId。
怪物：统一属于 monster faction。
```

## 9.3 盟友判断

盟友判断必须同时考虑：

```text
阵营 faction
结盟系统 allianceSystem
```

建议：

```ts
function areAllied(a, b) {
  return a.factionId === b.factionId
    || allianceSystem.hasAlliance(a.id, b.id);
}
```

解除结盟技能：

```text
只能解除技能创建的 alliance。
不能解除同阵营的基础盟友关系。
```

## 9.4 胜负判断

建议胜负判断只看角色，不看召唤物和怪物。

规则：

```text
如果所有存活角色都属于同一 faction 或同一联盟集团，则游戏结束。
```

## 9.5 阵营 UI

局内应清晰显示阵营：

1. 角色头像边框颜色 = 阵营颜色。
2. 角色脚下光圈颜色 = 阵营颜色。
3. 属性面板显示阵营名称。
4. 行动队列显示阵营颜色。
5. 召唤物显示主人阵营颜色和召唤物角标。
6. 怪物使用统一怪物颜色。
7. 攻击目标选择时，同阵营目标不高亮为攻击目标。

---

# 10. 前端战斗界面要求

## 10.1 战斗界面形态

开局后的游戏界面应采用：

```text
全屏地图式界面
```

要求：

1. 屏幕主体几乎全部是游戏地图。
2. 地图支持滚轮缩放。
3. 地图支持拖拽平移。
4. 点击当前行动角色显示角色属性和行动栏。
5. 点击非当前行动角色只显示属性。
6. 点击技能后先显示技能列表，选择技能后再进入目标选择。
7. 地图上头像血条下方显示实时 HP 数值。
8. 攻击或技能目标选择时，鼠标长时间停留在格子 / 人物上方显示最终伤害预览。
9. 属性栏和行动栏应简洁美观。
10. 预留音效接口。

## 10.2 行动栏

点击当前行动角色后显示：

```text
移动
攻击
技能
挖宝
结束行动
```

按钮规则：

- 移动：进入移动目标选择模式。
- 攻击：进入攻击目标选择模式。
- 技能：先打开技能列表。
- 挖宝：进入挖宝目标选择模式。
- 结束行动：切换到下一个行动单位。

不可用按钮应变灰并显示原因。

## 10.3 操作模式

前端应维护：

```ts
type InteractionMode =
  | "idle"
  | "entity_selected"
  | "move_targeting"
  | "attack_targeting"
  | "skill_selecting"
  | "skill_targeting"
  | "dig_targeting"
  | "map_panning";
```

规则：

1. 每种模式有明确进入和退出条件。
2. 右键或 Esc 可取消当前操作。
3. API 成功后清理高亮和状态。
4. API 失败时保留当前模式并显示错误。
5. 切换模式时清理无关提示格。

## 10.4 地图提示格

操作时地图显示提示格：

- 移动：显示可移动格和 AP 消耗。
- 攻击：显示攻击范围和可攻击目标。
- 技能：显示可选范围和影响范围。
- 挖宝：显示可挖藏宝点。
- 地形：显示危险提示和 tooltip。

## 10.5 伤害预览

要求新增后端预览 API：

```text
POST /api/game/action-preview
```

前端 hover 延迟请求：

```text
鼠标悬停超过 350ms 后请求预览。
```

前端不得自行计算最终伤害。

预览应支持：

```text
普通攻击
技能
移动
挖宝
小怪反击
是否击杀
AP 消耗
非法原因
```

## 10.6 动画与特效

前端可使用：

```text
Motion：UI 微交互
PixiJS：技能特效层
CSS / SVG：轻量动画
```

要求：

1. 动画不影响规则结算。
2. 后端返回 BattleEvent。
3. 前端根据 `visualKey` 播放动画。
4. 不要每个技能写一套完全独立动画。
5. PixiJS 只做 BattleEffectsLayer，不接管整个地图。

## 10.7 音效接口

预留音效接口：

```ts
interface SkillVisualConfig {
  visualKey?: string;
  impactColor?: string;
  trailType?: string;
  soundKey?: string;
}
```

```ts
interface BattleEvent {
  soundKey?: string;
}
```

前端应有：

```text
AudioManager
soundRegistry
音量控制
静音控制
缺失音频文件时不报错
```

音效类型预留：

```text
移动
攻击
反击
挖宝成功
挖宝失败
技能释放
受伤
治疗
死亡
地形触发
UI 点击
UI hover
胜利
失败
```

---

# 11. 数据管理与编辑器要求

## 11.1 角色管理

应支持：

1. 新增角色。
2. 编辑角色属性。
3. 删除角色。
4. 上传地图头像 / token。
5. 上传选择界面立绘。
6. 设置角色特定技能。
7. 设置稀有度。
8. 设置可选技能点。
9. 设置速度、暴击率、幸运值等属性。

## 11.2 技能管理

应支持：

1. 查看全部技能。
2. 新建技能。
3. 编辑技能。
4. 删除自定义技能。
5. 启用 / 禁用技能。
6. 直接编辑系统技能可编辑属性。
7. 搜索技能。
8. 按分类筛选。
9. 按稀有度筛选。
10. 按系统 / 自定义筛选。
11. 上传 / 设置技能图标。
12. 设置技能点消耗。
13. 设置技能可用范围 `usableAs`。
14. 设置技能 visualKey / soundKey。

## 11.3 生物管理

生物管理应替代小怪管理。

应支持：

1. 新增生物。
2. 编辑生物。
3. 删除生物。
4. 上传地图 token。
5. 上传展示立绘。
6. 设置是否可作为怪物。
7. 设置是否可作为召唤物。
8. 设置召唤物默认技能。
9. 设置属性。
10. 设置稀有度。
11. 从可作为怪物的生物中选择固定 / 随机怪物。
12. 从可作为召唤物的生物中配置召唤技能。

## 11.4 地图编辑器

应支持：

1. 新建地图。
2. 编辑地图大小。
3. 设置格子 enabled / disabled。
4. 设置部署区。
5. 固定放置怪物。
6. 固定放置藏宝点。
7. 设置地形：
   - normal
   - obstacle
   - lava
   - swamp
   - wood_stake
   - ice
   - thunderstorm
8. 地形刷子。
9. 拖动连续刷地形。
10. 右键恢复普通地形。
11. 地形 tooltip。
12. 木桩 HP 显示。
13. 保存前轻量提示。
14. 后端最终校验。

---

# 12. API 总览

实际项目可按现有路由调整，但应覆盖以下能力。

## 12.1 角色

```text
GET    /api/character-templates
POST   /api/character-templates
GET    /api/character-templates/{id}
PUT    /api/character-templates/{id}
DELETE /api/character-templates/{id}
POST   /api/character-templates/{id}/duplicate
```

## 12.2 技能

```text
GET    /api/skills
POST   /api/skills
GET    /api/skills/{id}
PUT    /api/skills/{id}
DELETE /api/skills/{id}
POST   /api/skills/{id}/duplicate
POST   /api/skills/{id}/reset-to-default
```

技能查询应支持：

```text
keyword
rarity
category
enabled
usableAs
isSystemSkill
```

## 12.3 生物

```text
GET    /api/creature-templates
POST   /api/creature-templates
GET    /api/creature-templates/{id}
PUT    /api/creature-templates/{id}
DELETE /api/creature-templates/{id}
POST   /api/creature-templates/{id}/duplicate
```

可兼容旧接口：

```text
/api/monster-templates
```

但内部应逐步迁移到 CreatureTemplate。

## 12.4 地图

```text
GET    /api/maps
POST   /api/maps
GET    /api/maps/{id}
PUT    /api/maps/{id}
DELETE /api/maps/{id}
POST   /api/maps/{id}/duplicate
POST   /api/maps/{id}/validate
```

## 12.5 游戏开始

```text
POST /api/game/preview-start
POST /api/game/start
```

## 12.6 战斗操作

```text
POST /api/game/move
POST /api/game/attack
POST /api/game/use-skill
POST /api/game/dig
POST /api/game/end-turn
POST /api/game/action-preview
```

如果实现攻击木桩：

```text
POST /api/game/attack-terrain
```

也可以复用普通 attack API，只要支持 terrain target。

---

# 13. 关键验收清单

## 13.1 核心规则验收

- 永久行动点和临时行动点分离。
- 临时行动点不保留。
- 永久行动点可保留。
- 消耗 AP 时优先消耗临时 AP。
- 速度排序正确。
- 速度相同按加入顺序。
- 召唤物下一轮加入行动队列。
- 额外行动下一轮生效。
- 眩晕跳过行动。
- 沉默禁止技能。
- 禁走禁止移动。
- 盟友不能互相攻击。
- 结盟影响胜负。
- 阵营影响盟友判断。
- 解除结盟不解除同阵营关系。

## 13.2 地图与随机验收

- 地图模板不保存随机规则。
- 随机设置在开局配置中。
- startSeed 可复现。
- 随机怪物不与角色重叠。
- 随机藏宝点不与角色重叠。
- 随机实体不与固定实体重叠。
- 可用格子不足时报错。
- disabled cell 不可用。
- obstacle 不可进入。
- wood_stake 不可进入。
- 地形变化只修改 GameState。
- MapTemplate 不被战斗过程污染。

## 13.3 地形验收

- normal 离开 1 AP。
- swamp 离开 2 AP。
- ice 离开 0 AP。
- obstacle 阻挡移动和激光。
- wood_stake 阻挡移动和激光。
- lava 回合开始造成 5 真实伤害。
- thunderstorm 按幸运概率造成 30 真实伤害。
- wood_stake 有 10 HP。
- wood_stake 可被攻击。
- wood_stake 摧毁后变 normal。
- 地形伤害不触发小怪反击。
- 地形击杀不发放奖励。

## 13.4 技能验收

- 技能可使用。
- 技能使用后数量 -1。
- 数量为 0 后消失。
- 同一技能最多 3 个。
- 开局选择技能受技能点限制。
- 角色特定技能不占技能点。
- 局内获得技能按稀有度权重。
- 系统技能可编辑。
- 技能搜索可用。
- 技能分类筛选可用。
- 沉默状态不能用技能。
- 目标非法不消耗技能。

## 13.5 怪物 / 生物 / 召唤物验收

- 生物管理可替代小怪管理。
- 生物可作为怪物。
- 生物可作为召唤物。
- 怪物无主动回合。
- 怪物可反击。
- 怪物死亡发奖励。
- 召唤物有主动回合。
- 召唤物可移动、攻击、使用技能。
- 召唤物可获得技能。
- 召唤物可召唤召唤物。
- 主人死亡后召唤链死亡。
- 召唤物继承主人阵营。
- 召唤物默认与主人永久结盟。

## 13.6 阵营验收

- 开局可配置阵营。
- 默认每个角色独立阵营。
- 同阵营默认盟友。
- 同阵营不能互相攻击。
- 同阵营胜负共享。
- 召唤物继承阵营。
- 怪物属于 monster faction。
- 局内阵营显示清晰。
- 行动队列显示阵营颜色。
- 属性面板显示阵营名称。

## 13.7 前端验收

- 战斗界面全屏地图化。
- 地图支持滚轮缩放。
- 地图支持拖拽平移。
- 点击当前行动角色显示属性和行动栏。
- 点击非当前行动角色只显示属性。
- 行动栏包含移动、攻击、技能、挖宝、结束行动。
- 点击技能先显示技能列表。
- 选择技能后进入目标选择。
- 地图头像下方显示实时 HP。
- hover 显示最终伤害预览。
- 属性栏和行动栏简洁美观。
- 地图提示格清晰。
- 技能范围和影响范围区分。
- 战斗日志清晰。
- 错误提示明确。
- 动画不阻塞结算。
- 音效缺失不影响游戏。

---

# 14. 常见潜在 Bug 检查点

## 14.1 行动点相关

- 是否错误地只使用一种 AP？
- 是否没有优先消耗临时 AP？
- 临时 AP 是否错误保留到下一次行动？
- 冰面 0 AP 移动是否被 AP 不足拦截？
- 沼泽离开是否按目标格而不是当前格计算？
- 技能 AP 不足时是否错误消耗技能？

## 14.2 随机生成相关

- 随机怪物是否可能生成在角色格？
- 随机藏宝点是否可能生成在角色格？
- 随机实体是否可能互相重叠？
- 随机实体是否可能生成在 obstacle / wood_stake？
- 预览和正式开始是否可能结果不一致？
- 奖励池是否在战斗中重新读取全局技能表？

## 14.3 技能相关

- 技能使用失败是否错误减少数量？
- 技能数量是否可能超过 3？
- 角色特定技能是否错误占用技能点？
- 死亡奖励是否错误继承角色特定技能？
- 沉默是否只禁止技能而没有误禁普攻 / 移动？
- 禁走是否只禁止移动而没有误禁技能？
- 铁索连环是否可能递归同步？
- C4 是否按释放时目标而不是爆炸时范围结算？
- 临界爆发是否错误增强灼烧 / C4 / 同步伤害？

## 14.4 地形相关

- 木桩是否被错误实现成进入触发陷阱？
- 木桩是否可以被部署 / 随机生成占用？
- 木桩摧毁是否污染 MapTemplate？
- 地形变化是否只写入 GameState？
- 岩浆 / 雷暴伤害是否错误触发小怪反击？
- 地形击杀是否错误发放奖励？
- 直线技能是否穿过 obstacle / wood_stake？

## 14.5 召唤物相关

- 召唤物是否错误立即行动？
- 召唤物是否没有加入下一轮速度排序？
- 召唤物是否没有继承主人阵营？
- 召唤物是否没有与主人结盟？
- 主人死亡后召唤物是否没有死亡？
- 召唤链是否没有递归清理？
- 召唤物是否无法使用技能或获得技能？

## 14.6 阵营相关

- 同阵营是否仍可互相攻击？
- 解除结盟技能是否错误解除同阵营关系？
- 胜负判断是否错误把召唤物 / 怪物算作胜利主体？
- 阵营 UI 是否与实际 areAllied 逻辑不一致？
- 默认阵营是否错误把所有角色放同一阵营？

## 14.7 前端相关

- 前端是否重新计算了最终伤害？
- 前端是否重新计算随机奖励？
- 前端是否把动画结果当成规则结果？
- 缩放 / 拖拽后格子点击是否错位？
- PixiJS 特效是否与地图坐标错位？
- recentEvents 是否无限累积？
- 事件是否重复播放？
- 音效缺失是否导致报错？

---

# 15. 给 LLM 的总核对提示词

```text
请根据《战棋小游戏项目总需求说明与代码核对清单》对当前代码仓库进行全面核对。

请重点检查：
1. 哪些需求已经实现。
2. 哪些需求完全未实现。
3. 哪些需求实现了一部分但不完整。
4. 哪些实现与需求冲突。
5. 哪些地方存在潜在 bug。
6. 哪些逻辑被错误地写在前端。
7. 哪些地方缺少后端校验。
8. 哪些功能缺少测试。

输出格式：
- 按模块分类。
- 每个问题说明：问题描述、影响、涉及文件、修复建议、优先级。
- 不要直接重写整个项目。
- 优先给出最小修复方案。
```
