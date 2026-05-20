# 后续升级说明书：稀有度与技能机制、生物机制、阵营机制

## 0. 文档用途

本文档用于直接交给 LLM / Codex / Qoder 执行后续升级开发。

本次升级分为三个阶段：

```text
阶段 1：稀有度和技能机制完善
阶段 2：生物机制完善
阶段 3：阵营机制完善
```

总目标：

1. 为角色和技能加入稀有度体系。
2. 为角色加入可选技能点属性。
3. 支持技能数量堆叠，同一技能最大数量为 3。
4. 支持技能搜索、分类和筛选。
5. 允许系统自带技能直接编辑属性。
6. 将“小怪管理”升级为“生物管理”。
7. 完善召唤物机制。
8. 开局前允许设置角色阵营。
9. 局内清晰显示阵营和结盟关系。

---

## 1. 全局原则

### 1.1 不重写核心系统

本次升级应在现有系统上兼容式扩展，不要推倒重来。

禁止重写：

```text
回合系统
行动点系统
基础攻击
伤害计算
Buff 系统
地图系统
地形系统
技能 Effect Engine
开局随机系统
```

允许扩展：

```text
角色字段
技能字段
技能实例结构
技能选择校验
奖励随机算法
生物模板
召唤物实体
阵营字段
UI 展示
搜索筛选
```

### 1.2 前端只做展示和轻量提示

前端可以做提示，但最终校验必须由后端完成。

前端不要自行最终判断：

```text
技能点是否超限
技能堆叠是否合法
随机技能抽取概率
召唤物是否能行动
召唤物主人死亡后是否死亡
阵营是否互为盟友
是否可以攻击某目标
```

---

# 阶段 1：稀有度和技能机制完善

## 2. 阶段目标

本阶段实现：

1. 角色和技能增加稀有度。
2. 稀有度分为：普通、稀有、罕见、史诗、传说。
3. 不同稀有度在 UI 中显示不同颜色和特效。
4. 角色增加 `skillPointCapacity`，即可选技能点。
5. 技能增加 `skillPointCost`。
6. 开局前选择通用技能时，技能点总消耗不能超过角色的可选技能点。
7. 角色特定技能不占用可选技能点。
8. 局内随机获得技能时，稀有度越高，概率越低。
9. 技能支持数量堆叠，同一技能最多 3 个。
10. 技能管理和开局技能选择支持搜索、分类、稀有度筛选。
11. 系统自带技能可以直接修改属性，不需要复制为自定义技能。

---

## 3. 稀有度定义

新增通用枚举：

```ts
type Rarity =
  | "common"
  | "rare"
  | "uncommon"
  | "epic"
  | "legendary";
```

对应中文：

```ts
const RARITY_LABELS = {
  common: "普通",
  rare: "稀有",
  uncommon: "罕见",
  epic: "史诗",
  legendary: "传说"
};
```

对应颜色：

```ts
const RARITY_COLORS = {
  common: "#ffffff",
  rare: "#22c55e",
  uncommon: "#3b82f6",
  epic: "#a855f7",
  legendary: "#f59e0b"
};
```

说明：

```text
普通 < 稀有 < 罕见 < 史诗 < 传说
```

如果项目中已有 rarity 命名，应统一前后端字段。

---

## 4. 角色稀有度与技能点

### 4.1 CharacterTemplate 扩展

```ts
interface CharacterTemplate {
  rarity: Rarity;

  // 可选技能点，只限制开局选择的通用技能，不限制角色特定技能。
  skillPointCapacity: number;
}
```

完整示意：

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

### 4.2 角色稀有度含义

角色稀有度代表角色综合实力。

建议默认：

| 稀有度 | 综合强度 | skillPointCapacity 建议 |
| --- | ---- | ---------------------:|
| 普通  | 基础角色 | 3                     |
| 稀有  | 略强   | 4                     |
| 罕见  | 中强   | 5                     |
| 史诗  | 强力   | 6                     |
| 传说  | 极强   | 7                     |

注意：

```text
skillPointCapacity 是可配置字段，不要写死为稀有度自动决定。
```

---

## 5. 技能稀有度、技能点与分类

### 5.1 SkillTemplate 扩展

```ts
interface SkillTemplate {
  rarity: Rarity;

  // 开局选择该技能所消耗的技能点。
  skillPointCost: number;

  // 技能分类。
  categories: SkillCategory[];

  // 系统自带技能也允许编辑部分属性。
  editable: boolean;
  isSystemSkill: boolean;
}
```

### 5.2 技能点消耗默认值

| 技能稀有度 | skillPointCost 默认 |
| ----- | -----------------:|
| 普通    | 1                 |
| 稀有    | 2                 |
| 罕见    | 3                 |
| 史诗    | 4                 |
| 传说    | 5                 |

规则：

```text
技能点消耗只影响开局前角色选择通用技能。
局内获得技能不消耗技能点。
角色特定技能不消耗技能点。
```

---

## 6. 开局技能选择校验

开局前，每个角色可以选择通用技能。

新增限制：

```text
角色所选通用技能的 skillPointCost 总和不能超过该角色 skillPointCapacity。
```

计算规则：

```ts
selectedCommonSkillPointCost =
  sum(skill.skillPointCost * selectedQuantityForThisSkill)
```

示例：

```text
角色 skillPointCapacity = 6

选择：
- 炸弹 x2，每个 1 点，共 2 点
- C4炸弹 x1，4 点

总计 6 点，合法。
```

注意：

```text
角色特定技能不计入 skillPointCost。
```

---

## 7. 技能数量与堆叠机制

### 7.1 规则

1. 同一个角色可以携带多个同一技能。
2. 局内可以获得多个同一技能。
3. 同一技能可以堆叠显示。
4. 同一角色同一技能最大数量为 3。
5. 每次使用技能，数量 -1。
6. 数量为 0 时从技能列表中移除。
7. 所有技能仍然是一次性消耗，但因为有数量，所以可以多次使用同一个技能。

### 7.2 SkillStack

推荐将角色持有技能升级为技能堆叠结构：

```ts
interface SkillStack {
  templateId: string;
  ownerEntityId: string;

  quantity: number;
  maxQuantity: number; // 默认 3

  sourceTypes: SkillSourceType[];

  acquiredAt?: string;
}
```

```ts
type SkillSourceType =
  | "character"
  | "common"
  | "reward"
  | "summon";
```

如果当前项目已有 `SkillInstance`，可以保留，但 UI 和逻辑要支持按 `templateId` 聚合数量。

---

### 7.3 获取技能时的堆叠规则

当角色获得技能 `skillTemplateId` 时：

```text
如果角色当前没有该技能：
  新增 SkillStack，quantity = 1

如果角色当前已有该技能，且 quantity < 3：
  quantity += 1

如果角色当前已有该技能，且 quantity >= 3：
  不再增加数量
  第一版直接丢弃该奖励，并写入战斗日志
```

日志示例：

```text
炎帝已拥有 3 个“炸弹”，无法继续获得，奖励被丢弃。
```

---

### 7.4 开局选择同一技能多份

开局选择通用技能时允许选择同一技能多份。

规则：

```text
每个技能最多选择 3 份。
每份都消耗 skillPointCost。
```

UI：

```text
技能卡片显示 + / - 数量选择器。
数量上限为 3。
技能点不足时禁止继续增加。
```

---

### 7.5 使用技能

使用技能时：

1. 检查角色是否拥有该技能。
2. 检查 `quantity > 0`。
3. 检查 AP、目标、沉默等规则。
4. 结算技能效果。
5. `quantity -= 1`。
6. 如果 `quantity == 0`，从可用技能列表中隐藏或移除。
7. 返回更新后的 `GameState`。

---

## 8. 技能随机获得概率

### 8.1 稀有度权重

局内随机获得技能时，稀有度越高，概率越低。

新增配置：

```ts
const RARITY_DROP_WEIGHTS = {
  common: 50,
  rare: 25,
  uncommon: 15,
  epic: 8,
  legendary: 2
};
```

实际概率由奖励池中可用技能决定。

### 8.2 抽取算法

从 `GameState.rewardSkillPoolTemplateIds` 中抽取。

流程：

1. 根据奖励池拿到所有可用技能模板。
2. 过滤 disabled 技能。
3. 每个技能的权重由 `RARITY_DROP_WEIGHTS[skill.rarity]` 决定。
4. 加权随机抽取一个技能。
5. 添加到角色技能堆叠中。
6. 如果该技能已达到 3 个，第一版丢弃并写日志。

伪代码：

```ts
function drawRandomRewardSkill(pool, receiver) {
  const candidates = pool.filter(skill => skill.enabled);

  if (candidates.length === 0) {
    return null;
  }

  const weighted = candidates.map(skill => ({
    skill,
    weight: RARITY_DROP_WEIGHTS[skill.rarity]
  }));

  return weightedRandom(weighted);
}
```

### 8.3 配置化

```ts
interface GameConfig {
  rarityDropWeights: Record<Rarity, number>;
  maxSkillStackQuantity: number;
}
```

默认：

```ts
maxSkillStackQuantity = 3;
```

---

## 9. 技能搜索和分类机制

### 9.1 技能分类枚举

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

中文：

| category | 中文       |
| -------- | -------- |
| damage   | 伤害       |
| heal     | 治疗       |
| buff     | 增益       |
| debuff   | 减益       |
| control  | 控制       |
| movement | 位移       |
| summon   | 召唤       |
| terrain  | 地形       |
| alliance | 结盟       |
| resource | 资源 / 行动点 |
| special  | 特殊       |

一个技能可以有多个分类。

---

### 9.2 技能管理界面搜索

技能管理界面支持：

1. 按名称搜索。
2. 按描述搜索。
3. 按稀有度筛选。
4. 按分类筛选。
5. 按技能类型筛选：
   - 系统自带
   - 自定义
6. 按启用状态筛选。
7. 按是否可作为通用技能筛选。
8. 按是否可作为角色特定技能筛选。

API 示例：

```text
GET /api/skills?keyword=火&rarity=epic&category=damage&enabled=true
```

---

### 9.3 开局技能选择界面搜索

开局前角色选择通用技能时支持：

1. 搜索技能名。
2. 按分类筛选。
3. 按稀有度筛选。
4. 只显示可作为通用技能的技能。
5. 显示技能点消耗。
6. 显示当前角色剩余技能点。
7. 显示当前技能数量。
8. 支持 + / - 调整数量。
9. 达到数量上限 3 时禁止继续增加。
10. 技能点不足时禁止继续增加。

---

## 10. 系统自带技能可编辑

### 10.1 目标

修改当前技能管理逻辑：

```text
系统自带技能的属性可以直接修改，不需要复制为自定义技能。
```

### 10.2 可编辑范围

系统自带技能允许编辑：

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
数值参数，例如伤害值、治疗值、持续回合、AP 消耗、范围等
```

谨慎编辑或不允许编辑：

```text
底层 customHandlerKey
核心 Effect 类型结构
复杂技能的内部逻辑代码
```

建议：

```text
系统技能的逻辑结构可以固定，但参数可编辑。
```

---

### 10.3 数据保存策略

系统技能不能只存在 seed 文件中，否则编辑后会被重置。

建议：

1. 系统自带技能 seed 到数据库。
2. 数据库中所有技能都可以编辑。
3. 用 `isSystemSkill` 标记来源。
4. 用 `editable` 控制是否可编辑。
5. 编辑保存到数据库。
6. 不要每次启动都覆盖用户修改。

```ts
interface SkillTemplate {
  id: string;
  isSystemSkill: boolean;
  editable: boolean;
  version?: number;
}
```

可选功能：

```text
恢复默认值
POST /api/skills/{skillId}/reset-to-default
```

---

## 11. 阶段 1 后端任务

1. 新增 `Rarity` 枚举。
2. CharacterTemplate 增加：
   - `rarity`
   - `skillPointCapacity`
3. SkillTemplate 增加：
   - `rarity`
   - `skillPointCost`
   - `categories`
   - `editable`
   - `isSystemSkill`
4. 技能选择校验增加技能点限制。
5. 技能持有结构支持数量堆叠。
6. 同一技能最大数量为 3。
7. 使用技能后数量 -1。
8. 随机奖励技能改为按稀有度加权。
9. 技能管理 API 支持搜索和筛选。
10. 系统技能允许直接编辑可编辑字段。
11. 增加相关测试。

---

## 12. 阶段 1 前端任务

1. 角色卡片显示稀有度颜色和标签。
2. 技能卡片显示稀有度颜色和标签。
3. 开局技能选择界面显示：
   - 角色技能点上限
   - 已用技能点
   - 剩余技能点
   - 技能点消耗
   - 技能数量 + / -
4. 技能管理界面增加：
   - 搜索框
   - 分类筛选
   - 稀有度筛选
   - 启用状态筛选
   - 系统 / 自定义筛选
5. 技能数量堆叠显示。
6. 技能使用后数量减少，数量为 0 时消失。
7. 系统技能可直接编辑。
8. 稀有度特效：
   - 普通：白 / 灰
   - 稀有：绿
   - 罕见：蓝
   - 史诗：紫
   - 传说：金

---

## 13. 阶段 1 验收标准

- 角色和技能都有稀有度。
- 角色有可选技能点。
- 开局选择通用技能不能超过技能点上限。
- 角色特定技能不占技能点。
- 同一技能可以携带多个。
- 同一技能最多 3 个。
- 使用技能后数量减少。
- 局内随机获得技能按稀有度加权。
- 技能搜索和分类可用。
- 系统自带技能可以直接修改属性。

---

# 阶段 2：生物机制完善

## 14. 阶段目标

本阶段将“小怪管理”升级为“生物管理”。

生物可以以两种形式出现在局内：

```text
怪物 monster
召唤物 summon
```

二者共用同一套 `CreatureTemplate`，但战斗中行为不同。

---

## 15. 生物定义

### 15.1 怪物 monster

怪物规则：

1. 由地图固定生成或开局随机生成。
2. 没有主动回合。
3. 不进入行动队列。
4. 不主动攻击。
5. 没有技能。
6. 受到直接攻击后，如果攻击者在攻击范围内，会立即反击。
7. 死亡后发放奖励技能。

### 15.2 召唤物 summon

召唤物规则：

1. 由技能在局内召唤。
2. 有自己的回合。
3. 进入行动队列。
4. 有自己的属性。
5. 相当于一个角色。
6. 默认与主人永久结盟。
7. 主人控制召唤物移动、攻击、释放技能。
8. 召唤物可以获得技能。
9. 召唤物可以使用技能。
10. 召唤物可以使用技能召唤新的召唤物。
11. 主人死亡后，召唤物立即死亡。
12. 召唤物死亡后不发放击杀角色奖励，除非后续另行设计。

---

## 16. CreatureTemplate 数据模型

将 `MonsterTemplate` 升级或迁移为 `CreatureTemplate`。

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

  // 允许作为怪物生成
  canSpawnAsMonster: boolean;

  // 允许作为召唤物被召唤
  canBeSummoned: boolean;

  // 召唤物默认技能
  summonSkillTemplateIds: string[];

  createdAt: string;
  updatedAt: string;
}
```

迁移规则：

```text
原小怪数据迁移为 CreatureTemplate：
canSpawnAsMonster = true
canBeSummoned = false
summonSkillTemplateIds = []
```

---

## 17. 生物管理页面

将“小怪管理”改名为：

```text
生物管理 / Creature Manager
```

功能：

1. 查看生物列表。
2. 新增生物。
3. 编辑生物。
4. 删除生物。
5. 复制生物。
6. 上传地图图标。
7. 上传展示立绘。
8. 设置是否可作为怪物生成。
9. 设置是否可作为召唤物。
10. 设置召唤物默认技能。
11. 设置属性。

---

## 18. BattleEntity 类型扩展

```ts
type BattleEntityType =
  | "character"
  | "monster"
  | "summon";
```

召唤物实体：

```ts
interface BattleSummonEntity {
  id: string;
  entityType: "summon";

  templateId: string;
  ownerEntityId: string;

  name: string;
  maxHp: number;
  currentHp: number;
  baseAttack: number;
  baseDefense: number;
  attackRange: number;
  speed: number;
  critRate: number;
  luck: number;
  temporaryApPerTurn: number;

  permanentAP: number;
  temporaryAP: number;

  skillStacks: SkillStack[];

  position: Position;
  alive: boolean;

  factionId: string;
}
```

召唤物默认：

```text
factionId = owner.factionId
与主人永久结盟
```

---

## 19. 召唤技能实现

扩展 Summon Effect：

```ts
interface SummonEffect {
  type: "summon";
  creatureTemplateId: string;
  count?: number;
  positionRule: "target_empty_cell" | "near_caster";
}
```

规则：

1. 只能召唤 `canBeSummoned = true` 的 CreatureTemplate。
2. 召唤位置必须是合法空格。
3. 召唤物占据一个格子。
4. 召唤物从下一轮开始加入行动队列。
5. 召唤物默认与主人永久结盟。
6. 召唤物 `ownerEntityId` 指向施法者。
7. 召唤物初始永久 AP 默认 3。
8. 召唤物初始技能来自 `summonSkillTemplateIds`。
9. 召唤物可以在局内获得技能。
10. 召唤物可以使用技能。

---

## 20. 召唤物行动队列

召唤物加入行动队列规则：

```text
召唤物被召唤后，不立即行动。
从下一轮开始，按 speed 参与行动排序。
```

与角色相同：

```text
速度高者先行动。
速度相同按加入战斗顺序。
```

召唤物有自己的行动点：

```text
permanentAP
temporaryAP
temporaryApPerTurn
```

---

## 21. 召唤物死亡联动

### 21.1 主人死亡

规则：

```text
主人死亡后，其所有存活召唤物立即死亡。
```

要求：

1. 监听实体死亡事件。
2. 如果死亡实体拥有召唤物，立即杀死这些召唤物。
3. 召唤物死亡产生 death event。
4. 如果允许召唤物召唤召唤物，则递归清理召唤链。

递归示例：

```text
A 召唤 B，B 召唤 C。
A 死亡 -> B 死亡 -> C 死亡。
```

### 21.2 召唤物死亡

召唤物正常死亡时：

1. 从地图移除。
2. 从行动队列移除。
3. 不影响主人。
4. 其直接或间接召唤物全部死亡。

---

## 22. 怪物与召唤物区别

| 行为      | monster | summon        |
| ------- | -------:| -------------:|
| 有主动回合   | 否       | 是             |
| 进入行动队列  | 否       | 是             |
| 会反击     | 是       | 按普通角色逻辑，不自动反击 |
| 可使用技能   | 否       | 是             |
| 可获得技能   | 否       | 是             |
| 有主人     | 否       | 是             |
| 与主人结盟   | 无       | 是             |
| 主人死亡后死亡 | 无       | 是             |
| 击杀后奖励   | 是       | 默认否           |

---

## 23. 随机小怪适配

原随机小怪池应改为：

```text
CreatureTemplate 中 canSpawnAsMonster = true 且 enabled = true 的生物。
```

兼容原字段：

```ts
monsterTemplatePoolIds
```

如果已有代码使用 `monsterTemplatePoolIds`，可以保留字段名，但内部映射到 CreatureTemplate。

---

## 24. 阶段 2 后端任务

1. 新增 `CreatureTemplate`。
2. 将 MonsterTemplate 迁移为 CreatureTemplate。
3. 生物管理 API。
4. 支持 `canSpawnAsMonster`。
5. 支持 `canBeSummoned`。
6. 支持 `summonSkillTemplateIds`。
7. 修改随机小怪生成逻辑，使用 CreatureTemplate。
8. 修改固定小怪生成逻辑，使用 CreatureTemplate。
9. 实现 summon Effect。
10. 实现 BattleSummonEntity。
11. 召唤物加入行动队列。
12. 召唤物可以获得技能。
13. 召唤物可以使用技能。
14. 召唤物可以召唤召唤物。
15. 主人死亡后召唤链死亡。
16. 增加测试。

---

## 25. 阶段 2 前端任务

1. 小怪管理改为生物管理。
2. 生物表单增加：
   - 是否可作为怪物
   - 是否可作为召唤物
   - 召唤物默认技能
3. 地图固定小怪选择改为从可作为怪物的生物中选择。
4. 召唤技能配置中可选择可召唤生物。
5. 战斗中区分显示：
   - 角色
   - 怪物
   - 召唤物
6. 召唤物显示主人标识。
7. 召唤物显示阵营边框。
8. 召唤物可被点击并显示属性和技能。
9. 召唤物进入行动队列后，UI 能正确显示其行动。

---

## 26. 阶段 2 验收标准

- 小怪管理已升级为生物管理。
- 生物可设置为怪物或召唤物。
- 原小怪数据可正常迁移。
- 随机怪物从可作为怪物的生物中生成。
- 固定怪物从可作为怪物的生物中选择。
- 召唤技能能召唤指定生物。
- 召唤物有自己的回合。
- 召唤物可以移动、攻击、使用技能。
- 召唤物可以获得技能。
- 召唤物可以召唤召唤物。
- 主人死亡后召唤物立即死亡。
- 召唤链可以正确清理。

---

# 阶段 3：阵营机制完善

## 27. 阶段目标

本阶段实现：

1. 开局前允许修改不同角色的阵营。
2. 某些角色可以开局就属于同一阵营。
3. 同一阵营默认互相结盟。
4. 局内显示阵营，让玩家一眼看出哪些角色属于同一阵营。
5. 阵营与现有结盟系统兼容。
6. 召唤物默认继承主人的阵营。

---

## 28. 阵营模型

新增：

```ts
interface Faction {
  id: string;
  name: string;
  color: string;
  iconUrl?: string;
}
```

开局配置中增加：

```ts
interface StartGameConfig {
  factions: Faction[];
  characterFactionAssignments: Record<string, string>;
}
```

默认：

```text
每个角色一个独立阵营。
```

这样保持原始“默认无队伍”的玩法。

---

## 29. 战斗实体阵营字段

BattleEntity 增加：

```ts
interface BattleEntity {
  factionId: string;
}
```

规则：

```text
角色：开局时由 characterFactionAssignments 决定 factionId。
召唤物：默认 factionId = owner.factionId。
怪物：统一属于 monster faction。
```

---

## 30. 阵营与结盟关系

同一阵营的角色默认互相结盟。

```text
same faction => allied
```

同一阵营之间：

1. 不能互相攻击。
2. 可以互相治疗。
3. 胜负条件共享。
4. 召唤物继承主人阵营。

判断盟友：

```ts
function areAllied(a, b) {
  return a.factionId === b.factionId
    || allianceSystem.hasAlliance(a.id, b.id);
}
```

解除结盟技能只解除技能创建的 alliance，不应改变基础 faction。

```text
同一阵营的基础结盟不能被普通解除结盟技能解除。
```

---

## 31. 胜负条件

建议胜负判断只看角色，不看召唤物和怪物。

理由：

- 召唤物依附于主人。
- 主人死亡后召唤物会死亡。
- 怪物不是参赛方。

规则：

```text
如果所有存活角色都属于同一 faction 或同一联盟集团，则游戏结束。
```

---

## 32. 开局阵营配置 UI

开局配置界面增加阵营设置。

功能：

1. 创建阵营。
2. 删除阵营。
3. 修改阵营名称。
4. 修改阵营颜色。
5. 给角色分配阵营。
6. 支持一键：
   - 每个角色独立阵营
   - 所有角色同阵营
   - 按拖拽分组
7. 地图上预览不同角色阵营边框。

---

## 33. 局内阵营显示

战斗中必须让玩家一眼看出阵营。

显示方式：

1. 角色头像边框颜色 = 阵营颜色。
2. 角色脚下光圈颜色 = 阵营颜色。
3. 属性面板显示阵营名称。
4. 行动队列显示阵营颜色。
5. 同阵营角色 hover 时可以显示同色描边。
6. 召唤物显示主人的阵营颜色，并带召唤物角标。
7. 怪物使用统一怪物颜色，例如红色或灰色。

---

## 34. 阵营与操作限制

攻击目标选择时：

```text
同阵营目标不能作为攻击目标。
同阵营目标可以作为治疗 / 增益目标。
```

技能目标规则应继续使用：

```text
areAllied(actor, target)
```

而不是直接只看 faction。

---

## 35. 阶段 3 后端任务

1. 新增 Faction 模型。
2. StartGameConfig 增加 factions。
3. StartGameConfig 增加 characterFactionAssignments。
4. BattleEntity 增加 factionId。
5. 开局时根据配置写入角色 factionId。
6. 召唤物生成时继承 owner.factionId。
7. 怪物使用 monster faction。
8. 修改 areAllied 判断：
   - 同 faction 为盟友。
   - allianceSystem 中结盟也为盟友。
9. 解除结盟技能不解除同 faction 关系。
10. 胜负判断改为基于 faction / alliance group。
11. 增加测试。

---

## 36. 阶段 3 前端任务

1. 开局配置页增加阵营编辑。
2. 支持创建 / 删除 / 改名 / 改色阵营。
3. 支持给角色分配阵营。
4. 提供默认分配：
   - 每个角色独立阵营
5. 战斗地图显示阵营边框。
6. 属性面板显示阵营名称。
7. 行动队列显示阵营颜色。
8. 召唤物显示主人阵营。
9. 攻击目标提示中同阵营目标不高亮为攻击目标。
10. 结盟关系和阵营关系都要能看出来。

---

## 37. 阶段 3 验收标准

- 开局前可以设置角色阵营。
- 默认每个角色独立阵营。
- 同一阵营角色开局互为盟友。
- 同一阵营角色不能互相攻击。
- 同一阵营角色胜负共享。
- 召唤物继承主人阵营。
- 解除结盟技能不解除同阵营关系。
- 局内阵营显示清晰。
- 行动队列和地图头像能看出阵营。
- 胜负判断正确。

---

# 38. 总体测试清单

## 38.1 稀有度与技能机制

- 角色稀有度可保存。
- 技能稀有度可保存。
- 技能点校验正确。
- 角色特定技能不占技能点。
- 技能可堆叠到 3。
- 技能超过 3 时无法继续获得或被丢弃。
- 使用技能后数量减少。
- 数量为 0 后技能消失。
- 稀有度越高随机获得概率越低。
- 技能搜索可用。
- 技能分类筛选可用。
- 系统技能可直接编辑。

## 38.2 生物机制

- 原小怪迁移为生物。
- 生物可作为怪物。
- 生物可作为召唤物。
- 怪物无主动回合。
- 怪物可反击。
- 召唤物有主动回合。
- 召唤物可使用技能。
- 召唤物可获得技能。
- 召唤物可召唤召唤物。
- 主人死亡后召唤链死亡。

## 38.3 阵营机制

- 开局可设置阵营。
- 同阵营不能互相攻击。
- 同阵营可以互相治疗。
- 召唤物继承阵营。
- 怪物阵营显示正确。
- 胜负判断正确。
- 阵营 UI 清晰。

---

# 39. 推荐开发顺序

```text
阶段 1A：数据模型扩展
阶段 1B：技能点校验和技能堆叠
阶段 1C：稀有度随机权重
阶段 1D：技能搜索分类和系统技能编辑

阶段 2A：CreatureTemplate 数据模型
阶段 2B：MonsterTemplate 迁移
阶段 2C：召唤物实体与行动队列
阶段 2D：召唤链死亡
阶段 2E：生物管理 UI

阶段 3A：Faction 数据模型
阶段 3B：开局阵营配置
阶段 3C：areAllied 与胜负判断
阶段 3D：阵营 UI 显示
```

---

# 40. 给 LLM / Codex 的总提示词

```text
请根据本文档分三个阶段实现后续升级：

阶段 1：稀有度和技能机制完善。
- 为角色和技能增加 rarity。
- 为角色增加 skillPointCapacity。
- 为技能增加 skillPointCost、categories。
- 开局选择通用技能时校验技能点总和。
- 角色特定技能不占技能点。
- 技能支持堆叠，同一技能最大数量 3。
- 使用技能后数量 -1。
- 局内随机获得技能按稀有度权重抽取。
- 技能管理和开局技能选择支持搜索、稀有度筛选、分类筛选。
- 系统自带技能可以直接编辑可编辑属性，不需要复制为自定义技能。

阶段 2：生物机制完善。
- 将小怪管理升级为生物管理 CreatureTemplate。
- 生物可以作为 monster 或 summon 出现。
- monster 没有主动回合，只反击。
- summon 有自己的回合和技能，类似角色。
- summon 默认与主人永久结盟。
- summon 可以获得技能、使用技能，也可以召唤 summon。
- 主人死亡后，其召唤链立即死亡。

阶段 3：阵营机制完善。
- 开局前允许设置角色阵营。
- 默认每个角色独立阵营。
- 同阵营角色默认互相结盟，不能互相攻击，胜负共享。
- 召唤物继承主人阵营。
- 局内清晰显示阵营颜色、边框和名称。
- areAllied 同时考虑 faction 和 allianceSystem。
- 解除结盟技能不能解除同阵营关系。

要求：
1. 不要重写现有 game-core，只做兼容式扩展。
2. 前端只做展示和轻量提示，最终校验以后端为准。
3. 所有新增字段都要有默认值和迁移策略。
4. 为关键逻辑补充测试。
5. 每个阶段完成后先运行测试和手动验收，再进入下一阶段。
```
