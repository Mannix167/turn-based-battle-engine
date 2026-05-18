# 本地战棋式回合制小游戏 v2 项目说明书

> 目标：制作一个只在本地电脑运行的战棋式回合制沙盒小游戏。游戏核心不是剧情或 AI，而是“地图位置 + 角色属性 + 一次性技能 + Buff + 结盟 + 资源点”的自由组合玩法。  
> 重要开发原则：**游戏规则必须集中在后端 / game-core 中实现，前端只负责显示和发送操作。技能系统必须采用可扩展的 Effect Engine，不要把每个技能写成大量 if-else。**

---

## 1. 项目定位

本项目是一个本地运行的网页小游戏，具有以下核心特征：

1. 战棋式方格地图。
2. 不同角色拥有不同基础属性。
3. 每个角色每回合根据速度顺序行动。
4. 角色拥有永久行动点与临时行动点。
5. 所有技能都是一次性技能，用完后从角色身上移除。
6. 技能可以造成伤害、治疗、加 Buff、召唤、结盟、解除结盟、交换属性、延迟伤害等。
7. 地图上可以存在角色、小怪、召唤物、藏宝点。
8. 支持创建、修改、删除角色，并上传角色贴图和立绘。
9. 暂时只需要本地运行，不需要联网、不需要账号系统、不需要多人在线。

---

## 2. 推荐技术栈

### 2.1 前端

- React
- TypeScript
- Vite
- Tailwind CSS 或普通 CSS Modules
- Zustand / Redux Toolkit 二选一，用于前端状态管理
- Axios / fetch 用于请求后端 API

### 2.2 后端

- Python
- FastAPI
- Pydantic
- SQLite
- SQLAlchemy 或 SQLModel
- 本地 `uploads/` 文件夹保存图片

### 2.3 项目运行方式

项目只需要在本地电脑运行：

```bash
# 后端
cd backend
uvicorn app.main:app --reload

# 前端
cd frontend
npm install
npm run dev
```

---

## 3. 开发资源分工策略

由于 Codex 额度有限，开发任务分为两类：

1. **Codex 负责重要 / 复杂 / 容易出错的核心部分。**
2. **Qoder / Claude Code + 国产大模型负责较简单 / 重复 / 外围 / 不太影响架构的部分。**

### 3.1 必须交给 Codex 的部分

以下部分决定游戏长期可维护性，必须优先交给 Codex：

1. `game-core` 核心规则引擎。
2. 行动点系统：永久行动点、临时行动点、消耗顺序、回合清理。
3. 回合队列系统：速度排序、同速按加入顺序、额外回合、召唤物下一轮加入。
4. 地图合法性判断：边界、占格、移动、距离、攻击范围。
5. 技能系统 Effect Engine。
6. Buff / StatusEffect 系统。
7. 结盟系统与胜负判断。
8. 伤害计算与暴击计算。
9. 小怪反击逻辑。
10. 藏宝点挖掘逻辑。
11. 击杀奖励逻辑。
12. 召唤物逻辑。
13. 核心规则单元测试。
14. 后端操作接口的规则校验。

Codex 的重点不是写漂亮页面，而是保证游戏逻辑正确、可扩展、可测试。

### 3.2 可以交给 Qoder / CC + 国产大模型的部分

以下任务相对简单，可以节省 Codex 额度：

1. 前端项目初始化。
2. 页面布局。
3. 普通表单页面。
4. 角色编辑器 UI。
5. 图片上传 UI。
6. 地图选择页面 UI。
7. 角色选择页面 UI。
8. 技能选择页面 UI。
9. 战斗日志组件。
10. 角色卡片组件。
11. 技能卡片组件。
12. 简单 API 调用封装。
13. 数据库 CRUD 接口的基础代码。
14. SQLite 表结构迁移脚本初稿。
15. mock 数据、seed 数据。
16. README、运行说明、普通文档。
17. 样式美化、按钮、弹窗、提示框。
18. 非核心测试，例如组件渲染测试。

### 3.3 分工原则

#### 原则 1：接口先行

Codex 先定义稳定的数据结构和 API 合同，Qoder / CC 只能按照这些合同写页面和 CRUD，不要让它们自己发明规则。

#### 原则 2：核心规则只能有一个权威来源

所有游戏规则必须在后端 / game-core 中实现。前端不能自己判断“能不能攻击”“技能是否命中”“是否胜利”。

#### 原则 3：国产模型可以写 UI，但不要让它改核心引擎

Qoder / CC + 国产模型可以修改：

```text
frontend/
backend/app/api/
backend/app/db/
backend/app/crud/
```

但不要随意修改：

```text
backend/app/core/
backend/app/game/
backend/app/engine/
```

#### 原则 4：每次让 Qoder / CC 做任务时必须给出边界

示例提示词：

```text
只实现前端页面和 API 调用，不要修改 game-core，不要改后端规则逻辑。
如果发现接口缺失，只列出需要的接口，不要自己绕过规则。
```

---

## 4. 推荐项目目录结构

```text
turn-based-grid-game/
  README.md
  docs/
    game_design_v2.md
    api_contract.md
    skill_system.md
    development_split.md

  backend/
    app/
      main.py
      config.py

      api/
        routes_characters.py
        routes_skills.py
        routes_maps.py
        routes_game.py
        routes_uploads.py

      db/
        database.py
        models.py
        seed.py

      schemas/
        character.py
        skill.py
        map.py
        game.py
        common.py

      game/
        engine.py
        models.py
        action_points.py
        turn_queue.py
        map_system.py
        distance.py
        damage.py
        victory.py
        alliance.py
        reward.py

        skills/
          skill_template.py
          skill_instance.py
          effect_engine.py
          effects.py
          targeting.py

        status/
          status_effect.py
          status_engine.py
          buff_types.py

        tests/
          test_action_points.py
          test_turn_queue.py
          test_movement.py
          test_damage.py
          test_skills.py
          test_alliance.py
          test_monsters.py
          test_treasure.py
          test_summon.py

      uploads/
        portraits/
        tokens/

  frontend/
    src/
      main.tsx
      App.tsx

      api/
        client.ts
        characters.ts
        skills.ts
        maps.ts
        game.ts
        uploads.ts

      types/
        character.ts
        skill.ts
        map.ts
        game.ts

      stores/
        gameStore.ts

      pages/
        HomePage.tsx
        CharacterEditorPage.tsx
        MapSelectPage.tsx
        CharacterSelectPage.tsx
        SkillSelectPage.tsx
        DeploymentPage.tsx
        BattlePage.tsx

      components/
        GridBoard.tsx
        GridCell.tsx
        EntityToken.tsx
        CharacterCard.tsx
        SkillCard.tsx
        ActionPanel.tsx
        BattleLog.tsx
        CharacterForm.tsx
        ImageUploader.tsx
        Modal.tsx
```

---

## 5. 游戏核心流程

### 5.1 开局流程

```text
选择地图
↓
选择出战角色
↓
为角色选择通用技能
↓
选择初始位置
↓
随机或手动生成小怪、藏宝点
↓
开始战斗
```

### 5.2 战斗流程

```text
生成本轮行动队列
↓
按速度顺序选择当前行动角色
↓
角色获得临时行动点
↓
触发回合开始 Buff，例如灼烧
↓
玩家操作：移动 / 普攻 / 技能 / 挖宝 / 结束行动
↓
若角色无行动点或玩家手动结束，进入下一角色
↓
本轮队列结束后进入下一轮
```

---

## 6. 地图系统

### 6.1 地图类型

地图为方格制。

第一版要求：

1. 支持自定义地图大小。
2. 支持自定义地图形状。
3. 第一版不做复杂地形。
4. 每个格子最多只能有一个地图实体。
5. 角色、召唤物、小怪都占据一个格子。
6. 藏宝点也占据一个格子，角色不能站在藏宝点所在格子，只能在范围内挖宝。

### 6.2 地图形状

地图不一定必须是完整矩形，可以通过可用格子列表定义形状。

示例：

```json
{
  "id": "map_001",
  "name": "默认地图",
  "width": 10,
  "height": 10,
  "validCells": [
    { "x": 0, "y": 0 },
    { "x": 0, "y": 1 },
    { "x": 1, "y": 0 }
  ]
}
```

若 `validCells` 为空或不存在，则默认整个矩形地图都可用。

### 6.3 移动规则

1. 只能上下左右移动。
2. 每移动一格消耗 1 行动点。
3. 不能移动到地图外。
4. 不能移动到非法格子。
5. 不能移动到已经被实体占据的格子。
6. 暂时不考虑障碍物与复杂地形。

### 6.4 距离规则

攻击和技能距离使用曼哈顿距离：

```text
distance = abs(x1 - x2) + abs(y1 - y2)
```

普通攻击使用角色的 `attackRange`。

技能释放使用技能自身的 `range`。

---

## 7. 地图实体

统一抽象为 Entity。

### 7.1 Entity 类型

```text
character：普通角色
summon：召唤物
monster：小怪
treasure：藏宝点
```

### 7.2 角色、召唤物、小怪的共同属性

```ts
interface BattleEntity {
  id: string;
  type: "character" | "summon" | "monster";
  name: string;
  ownerId?: string;
  controllerId?: string;
  x: number;
  y: number;

  maxHp: number;
  currentHp: number;

  baseAttack: number;
  currentAttack: number;
  baseDefense: number;
  currentDefense: number;

  attackRange: number;
  tempApPerTurn: number;
  permanentAP: number;
  temporaryAP: number;

  speed: number;
  critRate: number;
  luck: number;

  joinOrder: number;
  isAlive: boolean;

  skillInstances: SkillInstance[];
  statusEffects: StatusEffect[];
}
```

### 7.3 藏宝点属性

```ts
interface TreasureEntity {
  id: string;
  type: "treasure";
  name: string;
  x: number;
  y: number;
  isDug: boolean;
}
```

---

## 8. 角色属性

角色基础属性包括：

```text
id：唯一标识
name：名称
description：描述
maxHp：最大生命值
baseAttack：基础攻击力
baseDefense：基础防御力
attackRange：基础攻击范围
tempApPerTurn：每回合获得的临时行动点
speed：速度
critRate：暴击率
luck：幸运值
portraitImageUrl：选择角色界面使用的立绘
tokenImageUrl：地图上显示的棋子图片
```

### 8.1 行动点属性

每个角色独立拥有行动点。

```text
permanentAP：永久行动点
temporaryAP：临时行动点
```

开局每个角色默认拥有：

```text
permanentAP = 3
```

每次轮到该角色行动时：

```text
temporaryAP = tempApPerTurn
```

角色行动结束时：

```text
temporaryAP = 0
permanentAP 保留
```

### 8.2 行动点消耗顺序

默认优先消耗临时行动点。

```text
先扣 temporaryAP
临时行动点不足时，再扣 permanentAP
```

示例：

```text
角色 temporaryAP = 2，permanentAP = 3
释放 cost = 4 的技能
结果 temporaryAP = 0，permanentAP = 1
```

---

## 9. 回合与行动队列

### 9.1 行动顺序

每一轮开始时生成行动队列。

排序规则：

```text
速度高者先行动。
速度相同则按加入战斗的顺序行动。
```

### 9.2 召唤物加入规则

召唤物被召唤后不会立刻行动，从下一轮开始参与速度排序。

### 9.3 额外回合

某些技能可以让目标角色下一轮出现两次行动机会。

实现方式：

```text
extraTurnNextRound += 1
```

下一轮生成行动队列时，该角色会被加入多次。

例如：

```text
A 速度 10
B 速度 8，extraTurnNextRound = 1
C 速度 7
```

下一轮队列：

```text
A → B → B → C
```

---

## 10. 普通攻击与伤害计算

### 10.1 普通攻击规则

1. 普通攻击消耗 1 行动点。
2. 普通攻击不能选择自己。
3. 普通攻击不能攻击盟友。
4. 普通攻击必须在攻击范围内。
5. 普通攻击可以触发小怪反击。

### 10.2 伤害计算

普通攻击和伤害技能都可以暴击。

暴击规则：

```text
若触发暴击，基础伤害 × 1.5
```

伤害结算：

```text
最终伤害 = max(1, floor(原始伤害 - 目标防御))
```

### 10.3 自身伤害免疫

角色所有伤害默认对自己不扣血。

规则：

```text
如果 damage effect 的 sourceId 与 targetId 相同，则该 damage effect 不生效。
治疗、强化、获得行动点等正面效果仍然可以对自己生效。
```

---

## 11. 技能系统

### 11.1 核心设定

所有技能都是一次性技能。

包括：

1. 角色特定技能。
2. 开局选择的通用技能。
3. 局内通过挖宝获得的通用技能。
4. 击杀角色或小怪获得的通用技能。

使用后，该技能实例从角色身上移除。

### 11.2 技能模板与技能实例

需要区分：

```text
SkillTemplate：技能模板，描述技能本身。
SkillInstance：角色实际持有的技能实例，用完后删除。
```

示例：

```ts
interface SkillTemplate {
  id: string;
  name: string;
  description: string;
  category: "character" | "common";
  cost: number;
  range: number;
  targetType: "single" | "emptyCell" | "direction" | "self";
  areaType: "single" | "line" | "cross" | "square" | "none";
  canTargetSelf: boolean;
  canTargetAlly: boolean;
  canTargetEnemy: boolean;
  canTargetEmptyCell: boolean;
  effects: EffectConfig[];
}

interface SkillInstance {
  instanceId: string;
  templateId: string;
  source: "character_default" | "start_common" | "treasure" | "monster_reward" | "kill_reward" | "random_reward";
  isUsed: boolean;
}
```

### 11.3 多段效果

一个技能可以包含多个效果。

示例：

```json
{
  "id": "burning_line",
  "name": "灼热直线",
  "category": "common",
  "cost": 2,
  "range": 5,
  "targetType": "direction",
  "areaType": "line",
  "effects": [
    {
      "type": "damage",
      "value": 20
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

### 11.4 第一版需要支持的 Effect 类型

至少需要支持：

```text
damage：造成伤害
heal：回复生命
add_buff：添加 Buff
remove_buff：移除 Buff
modify_stat：修改属性
add_permanent_ap：增加永久行动点
add_temporary_ap：增加临时行动点
extra_turn_next_round：下轮额外行动一次
alliance：结盟
remove_alliance：解除结盟
swap_attack：交换基础攻击力或当前攻击力
sync_hp：血量同步
summon：召唤仆从
delayed_damage：延迟伤害
grant_skill：获得技能
```

### 11.5 直线技能规则

直线技能只支持上下左右四个方向。

规则：

1. 释放者选择一个方向。
2. 方向为：上、下、左、右。
3. 不支持斜线。
4. 第一版没有墙，所以不考虑穿墙问题。
5. 命中该方向上技能范围内所有非盟友实体。
6. 小怪、召唤物、角色都可以被命中。
7. 技能不会对释放者自己造成伤害。

---

## 12. Buff / StatusEffect 系统

### 12.1 基础结构

```ts
interface StatusEffect {
  id: string;
  type: "stun" | "burn" | "alliance" | "delayed_damage" | "stat_modifier" | "sync_hp";
  sourceEntityId: string;
  targetEntityId: string;
  duration?: number;
  remainingTurns?: number;
  value?: number;
  metadata?: Record<string, any>;
}
```

### 12.2 第一版 Buff

#### 眩晕 stun

```text
效果：跳过下一次行动机会。
```

如果角色下一轮有两次行动机会，眩晕只跳过其中一次。

#### 灼烧 burn

```text
效果：每回合开始时扣血。
```

注意：这里的“每回合开始时”指角色自己的行动开始时。

如果角色一轮中有两次行动机会，灼烧在每次行动开始时都触发。

#### 延迟伤害 delayed_damage

```text
效果：指定轮数后触发一次伤害。
```

#### 属性修改 stat_modifier

可以临时或永久修改：

```text
攻击力
防御力
速度
幸运值
暴击率
```

---

## 13. 结盟系统

### 13.1 初始状态

初始默认无队伍。

工程实现上，每个角色初始可以视为自己的独立队伍。

### 13.2 结盟规则

1. 技能可以让两个或多个角色结盟。
2. 结盟可以持续若干回合，也可以永久持续。
3. 存在解除结盟的技能。
4. 结盟后不能互相攻击。
5. 结盟后胜负条件共享。
6. 结盟具有传递性。

示例：

```text
A 和 B 结盟。
B 和 C 结盟。
则 A、B、C 属于同一联盟集团。
```

### 13.3 胜利条件

```text
当所有存活角色只剩一个联盟集团时，游戏结束。
```

如果场上只剩一个角色，也满足胜利条件。

---

## 14. 小怪系统

### 14.1 小怪基本规则

1. 小怪属于地图实体。
2. 小怪占据一个格子。
3. 小怪不会主动行动。
4. 小怪没有技能。
5. 小怪可以被攻击和技能命中。
6. 小怪死亡后从地图上消失。

### 14.2 小怪反击

规则：

```text
小怪受到普通攻击或伤害技能后，若攻击者在小怪攻击范围内，小怪立即反击一次。
小怪每次受到攻击都可以反击。
```

小怪反击使用普通攻击伤害计算规则。

### 14.3 小怪奖励

建议第一版：

```text
击杀小怪后，击杀者随机获得一个通用技能。
```

---

## 15. 藏宝点系统

### 15.1 基本规则

1. 藏宝点是地图实体。
2. 藏宝点占据一个格子。
3. 藏宝点只能挖掘一次。
4. 挖宝消耗 1 行动点。
5. 挖宝范围使用角色的基础攻击距离。
6. 挖宝成功后，挖宝角色随机获得一个通用技能。
7. 挖宝成功率由角色幸运值决定。

### 15.2 挖宝概率

```text
成功率 = luck%
```

例如：

```text
luck = 70，则成功率为 70%。
```

### 15.3 挖宝失败惩罚

失败后：

```text
50% 无事发生
50% 扣除固定 10 点生命值
```

扣血值可以在游戏开始前界面中修改。

---

## 16. 召唤物系统

### 16.1 基本规则

1. 召唤物属于地图实体。
2. 召唤物占据一个格子。
3. 召唤物与普通角色地位相同。
4. 召唤物由主人操控。
5. 召唤物与主人默认结盟。
6. 召唤物可以移动、攻击、释放技能。
7. 召唤物拥有自己的回合。
8. 召唤物从下一轮开始参与速度排序。
9. 召唤物生命值归零后消失。

### 16.2 召唤位置

召唤技能通常选择一个空格作为召唤位置。

要求：

1. 目标格必须在技能范围内。
2. 目标格必须为空。
3. 目标格必须是合法地图格。

---

## 17. 死亡与奖励

### 17.1 死亡规则

当角色、召唤物或小怪生命值小于等于 0 时死亡。

死亡后：

```text
从地图上移除。
不再参与行动队列。
不再参与胜负判断。
清除其身上的 Buff、延迟效果、结盟关系。
```

### 17.2 击杀角色奖励

角色死亡后，击杀者可以从死亡角色身上选择一个未使用的通用技能。

规则：

1. 只能选择通用技能。
2. 不能继承角色特定技能。
3. 如果死亡角色身上没有未使用的通用技能，则击杀者随机获得一个通用技能。

### 17.3 击杀小怪奖励

击杀小怪后，击杀者随机获得一个通用技能。

---

## 18. 角色编辑器

### 18.1 功能要求

网页端需要支持：

1. 新增角色。
2. 修改已有角色。
3. 删除角色。
4. 上传地图棋子图片。
5. 上传选择角色界面使用的立绘。
6. 设置角色基础属性。
7. 设置角色默认携带的角色特定技能。
8. 保存到本地数据库。

### 18.2 第一版暂不要求

1. 不要求在网页端编辑技能逻辑。
2. 不要求技能编辑器。
3. 不要求地图编辑器特别复杂。
4. 不要求账号系统。
5. 不要求联网。

---

## 19. 技能扩展方式

第一版暂时只支持在代码中扩充技能。

建议流程：

1. 在后端 `skill_templates` 中添加技能模板。
2. 使用已有 effect 类型组合技能。
3. 如果需要新机制，再新增 effect handler。
4. 给每个新 effect 写单元测试。

不要在前端写技能逻辑。

---

## 20. 后端 API 初步设计

### 20.1 角色 API

```text
GET    /api/characters
GET    /api/characters/{id}
POST   /api/characters
PUT    /api/characters/{id}
DELETE /api/characters/{id}
```

### 20.2 图片上传 API

```text
POST /api/uploads/portrait
POST /api/uploads/token
```

### 20.3 技能 API

```text
GET /api/skills/templates
GET /api/skills/templates/common
GET /api/skills/templates/character
```

### 20.4 地图 API

```text
GET  /api/maps
GET  /api/maps/{id}
POST /api/maps
PUT  /api/maps/{id}
```

### 20.5 游戏 API

```text
POST /api/game/create
POST /api/game/start
GET  /api/game/{gameId}
POST /api/game/{gameId}/move
POST /api/game/{gameId}/basic-attack
POST /api/game/{gameId}/use-skill
POST /api/game/{gameId}/dig-treasure
POST /api/game/{gameId}/end-action
POST /api/game/{gameId}/choose-kill-reward
```

---

## 21. 前端页面要求

### 21.1 首页

功能：

1. 新建游戏。
2. 进入角色编辑器。
3. 查看已有角色。

### 21.2 角色编辑器页面

功能：

1. 创建角色。
2. 修改角色。
3. 删除角色。
4. 上传立绘。
5. 上传地图棋子图片。
6. 设置属性。
7. 选择角色特定技能。

### 21.3 地图选择页面

功能：

1. 选择地图。
2. 设置地图大小。
3. 设置地图形状。
4. 设置小怪和藏宝点生成方式：随机 / 手动配置。
5. 设置挖宝失败扣血固定值，默认 10。

### 21.4 角色选择与技能选择页面

功能：

1. 选择参战角色。
2. 为每个角色选择开局通用技能。
3. 通用技能不能重复选择给同一个角色。
4. 同一个通用技能可以给多个角色携带。

### 21.5 初始部署页面

功能：

1. 将角色放置到地图上的不同位置。
2. 支持不同数量角色。
3. 一个格子只能放一个角色。
4. 可以配置小怪和藏宝点位置。

### 21.6 战斗页面

建议布局：

```text
顶部：当前轮数、当前行动角色、胜负状态
左侧：地图棋盘
右侧：当前角色属性、行动点、技能列表、操作按钮
下方：战斗日志
```

战斗页面需要支持：

1. 点击角色查看属性。
2. 点击格子移动。
3. 点击目标普通攻击。
4. 点击技能后显示可选目标或可选方向。
5. 挖宝。
6. 手动结束当前角色行动。
7. 显示行动点变化。
8. 显示 Buff。
9. 显示战斗日志。
10. 击杀后弹出技能奖励选择框。

---

## 22. 开发阶段划分

### 阶段 1：项目骨架与数据结构

负责人建议：Codex 主导，Qoder / CC 辅助。

任务：

1. 创建前后端项目。
2. 定义核心数据结构。
3. 定义 API 合同。
4. 建立 SQLite 数据库。
5. 添加初始 seed 数据。

验收标准：

1. 前后端能启动。
2. 可以通过 API 获取角色、技能、地图 mock 数据。
3. 核心模型类型清晰。

---

### 阶段 2：地图、移动、行动点、普通攻击

负责人建议：Codex。

任务：

1. 实现地图合法性判断。
2. 实现占格规则。
3. 实现移动规则。
4. 实现永久行动点和临时行动点。
5. 实现普通攻击。
6. 实现伤害计算与暴击。

验收标准：

1. 角色不能移动到非法格子。
2. 角色不能移动到已占用格子。
3. 移动消耗行动点。
4. 普通攻击消耗 1 行动点。
5. 普通攻击不能攻击自己或盟友。
6. 伤害计算正确。

---

### 阶段 3：回合队列系统

负责人建议：Codex。

任务：

1. 速度排序。
2. 同速按加入顺序排序。
3. 当前角色行动开始时获得临时行动点。
4. 当前角色行动结束时清空临时行动点。
5. 实现额外回合机制。
6. 召唤物下一轮加入队列。

验收标准：

1. 行动顺序稳定正确。
2. 额外回合能让角色下一轮行动两次。
3. 死亡角色不会继续行动。

---

### 阶段 4：技能系统 v1

负责人建议：Codex。

任务：

1. 实现 SkillTemplate。
2. 实现 SkillInstance。
3. 实现技能一次性消耗。
4. 实现多 effect 技能。
5. 实现目标选择校验。
6. 实现直线技能。

验收标准：

1. 技能使用后从角色身上移除。
2. 技能可以包含多个 effect。
3. 技能距离校验正确。
4. 直线技能命中正确目标。

---

### 阶段 5：Buff 系统

负责人建议：Codex。

任务：

1. 实现 StatusEffect。
2. 实现眩晕。
3. 实现灼烧。
4. 实现延迟伤害。
5. 实现属性修改 Buff。

验收标准：

1. 眩晕跳过下一次行动机会。
2. 灼烧在角色行动开始时扣血。
3. 延迟伤害按指定轮数触发。
4. Buff 持续时间正确减少。

---

### 阶段 6：结盟与胜负判定

负责人建议：Codex。

任务：

1. 实现联盟关系。
2. 实现临时结盟。
3. 实现永久结盟。
4. 实现解除结盟。
5. 实现联盟传递性。
6. 实现胜负判定。

验收标准：

1. 盟友不能互相攻击。
2. 联盟具有传递性。
3. 只剩一个联盟集团时游戏结束。

---

### 阶段 7：藏宝点、小怪、击杀奖励

负责人建议：Codex。

任务：

1. 实现藏宝点。
2. 实现挖宝成功率。
3. 实现挖宝失败惩罚。
4. 实现小怪反击。
5. 实现击杀小怪奖励。
6. 实现击杀角色奖励选择。

验收标准：

1. 藏宝点只能挖一次。
2. 幸运值影响挖宝成功率。
3. 小怪受到攻击后按规则反击。
4. 击杀角色后可以选择一个通用技能。
5. 无通用技能时随机获得通用技能。

---

### 阶段 8：召唤物

负责人建议：Codex。

任务：

1. 实现召唤 effect。
2. 召唤物占据格子。
3. 召唤物与主人结盟。
4. 召唤物下一轮加入行动队列。
5. 召唤物可以行动、攻击、使用技能。

验收标准：

1. 召唤位置必须合法。
2. 召唤物不会立即行动。
3. 召唤物死亡后消失。

---

### 阶段 9：前端战斗界面

负责人建议：Qoder / CC + 国产模型，Codex 只审查接口和关键 bug。

任务：

1. 实现棋盘显示。
2. 实现角色棋子显示。
3. 实现当前角色面板。
4. 实现技能按钮。
5. 实现行动点显示。
6. 实现战斗日志。
7. 接入后端游戏 API。

验收标准：

1. 玩家可以通过 UI 移动、攻击、放技能。
2. UI 显示与后端状态一致。
3. 前端不自行计算核心规则。

---

### 阶段 10：角色编辑器与图片上传

负责人建议：Qoder / CC + 国产模型。

任务：

1. 新增角色表单。
2. 修改角色表单。
3. 删除角色。
4. 上传立绘。
5. 上传棋子图片。
6. 接入角色 CRUD API。

验收标准：

1. 能在网页端新增角色。
2. 能修改角色属性。
3. 能上传并显示图片。
4. 数据能保存到本地数据库。

---

### 阶段 11：UI 美化与体验增强

负责人建议：Qoder / CC + 国产模型。

任务：

1. 美化首页。
2. 美化角色卡片。
3. 美化技能卡片。
4. 添加技能范围预览。
5. 添加 Buff 图标。
6. 添加弹窗提示。
7. 添加更完整的战斗日志。

验收标准：

1. UI 美观。
2. 操作清晰。
3. 玩家能理解当前发生了什么。

---

## 23. 给 Codex 的推荐提示词

### 23.1 开始项目时

```text
请阅读 docs/game_design_v2.md，并按照阶段 1 开始实现项目骨架。
优先建立清晰的数据结构、game-core 目录和 API 合同。
不要急着实现复杂 UI。
每完成一个阶段，请运行测试并对照验收标准检查。
```

### 23.2 实现核心引擎时

```text
请只实现后端 game-core，不要修改前端 UI。
重点保证规则正确、模块清晰、可测试。
请为行动点、回合队列、移动、攻击、技能、Buff、结盟分别写单元测试。
不要把技能写成大量 if-else，要使用 SkillTemplate + Effect Engine。
```

### 23.3 让 Codex 审查国产模型代码时

```text
请审查最近提交的代码，重点检查是否有以下问题：
1. 前端是否私自实现了游戏规则。
2. 后端是否绕过 game-core 直接修改状态。
3. 技能逻辑是否写死成 if-else。
4. API 返回状态是否与 game-core 一致。
5. 是否破坏了既有测试。
请只修复关键问题，不要大规模重构 UI。
```

---

## 24. 给 Qoder / CC + 国产大模型的推荐提示词

### 24.1 做前端页面

```text
你只负责实现前端页面和组件，不要修改后端 game-core。
请根据已有 API 类型和接口实现 UI。
所有游戏规则以后端返回为准，前端不要自行判断技能命中、伤害、胜负。
如果发现接口缺失，请列出需要的接口，不要自己在前端绕过。
```

### 24.2 做角色编辑器

```text
请实现角色编辑器页面，包括新增、修改、删除角色，上传立绘和地图棋子图片。
只调用后端角色 CRUD API 和上传 API，不要修改游戏核心规则。
表单字段必须和后端 Character schema 保持一致。
```

### 24.3 做 UI 美化

```text
请只优化前端样式和交互体验，不要修改 API 合同，不要修改 game-core。
重点优化棋盘、角色卡片、技能卡片、战斗日志、弹窗和按钮布局。
```

---

## 25. MVP 技能清单建议

第一版不需要一次性做完所有复杂技能。建议先做以下技能模板：

### 25.1 基础技能

1. 单体伤害。
2. 单体治疗。
3. 增加攻击力。
4. 增加防御力。
5. 获得永久行动点。

### 25.2 控制与 Buff

1. 眩晕。
2. 灼烧。
3. 延迟伤害。

### 25.3 地图与范围

1. 直线伤害。
2. 范围治疗。
3. 召唤仆从。

### 25.4 特殊技能

1. 强制结盟。
2. 解除结盟。
3. 交换攻击力。
4. 下轮额外行动一次。

---

## 26. 非目标

第一版不做：

1. 在线多人。
2. 账号系统。
3. 排行榜。
4. 复杂 AI。
5. 复杂地形。
6. 大型剧情。
7. 商业化付费系统。
8. 技能编辑器。
9. 复杂动画特效。
10. Electron 桌面打包。

---

## 27. 最重要的工程提醒

1. **不要让前端计算核心规则。**
2. **不要把每个技能写成独立 if-else。**
3. **先写 game-core，再写漂亮 UI。**
4. **核心规则必须有测试。**
5. **Codex 主要用于复杂规则，Qoder / CC 主要用于 UI 和 CRUD。**
6. **每次复杂功能开发前，先明确输入、输出、状态变化和测试用例。**
