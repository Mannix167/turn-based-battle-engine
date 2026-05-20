# Codex 前端优化阶段说明书：全屏地图式战斗界面、交互反馈、技能特效与音效接口

## 0. 文档用途

本文档用于在以下三个阶段完成之后，单独交给 Codex 进行前端优化：

1. 新增小怪系统已完成。
2. 开局随机配置已完成。
3. 地图地形系统已完成。

本阶段不继续扩展规则系统，而是专注于：

```text
战斗界面体验
地图交互
角色信息展示
行动操作流程
技能释放体验
伤害预览
动画特效
音效接口预留
整体游戏感
```

本阶段要求使用或参考：

```text
ui-ux-pro-max skill
Motion
PixiJS
```

核心目标：

```text
把当前“能用的网页式前端”升级为“全屏地图式、有游戏交互感、有反馈、有音效扩展接口的战棋小游戏界面”。
```

---

# 1. 总体设计方向

## 1.1 战斗界面整体形态

开局后的游戏界面应采用：

```text
全屏地图式界面
```

也就是说：

- 屏幕主体几乎全部是游戏地图。
- 不使用大块固定侧边栏长期占据空间。
- 角色信息、行动按钮、技能列表等 UI 以浮层、弹出面板、悬浮卡片形式出现。
- 玩家主要通过点击地图上的角色、格子、按钮完成操作。
- 地图支持滚轮缩放和拖拽平移。
- 增加事件提示，在屏幕上方会出现提示条显示发生的事情（如：攻击，技能，收到伤害等）

目标体验：

```text
更像一款战棋游戏，而不是后台管理页面。
```

---

## 1.2 本阶段禁止事项

本阶段禁止修改核心规则：

- 不重写 game-core。
- 不修改回合系统。
- 不修改行动点系统。
- 不修改伤害结算。
- 不修改技能命中逻辑。
- 不修改小怪反击逻辑。
- 不修改地形规则。
- 不修改随机生成逻辑。
- 不在前端重新计算最终伤害。
- 不让动画或音效影响规则结算。

前端只能消费后端返回的数据：

```text
GameStateRead
BattleEvent[]
ActionPreviewResponse
SkillTemplate.visual
Entity state
Map state
```

---

## 1.3 本阶段可以修改的内容

可以修改：

- 战斗主界面布局。
- 地图渲染方式。
- 地图缩放和平移。
- 角色点击交互。
- 属性浮层。
- 行动按钮浮层。
- 技能列表浮层。
- 伤害预览 UI。
- 地图提示格高亮。
- Motion 微交互。
- PixiJS 特效层。
- 音效播放接口。
- 前端组件结构。
- 前端样式和美术表现。

---

# 2. 推荐技术方案

## 2.1 技能与库（均已安装完成）

要求 Codex 使用或参考：

```text
ui-ux-pro-max skill
```

使用库：

```bash
npm install motion pixi.js
```

可选评估：

```bash
npm install @pixi/react
```

但注意：

```text
PixiJS 只用于地图上方的特效层。
不要把整个地图和 UI 重写成 PixiJS。
React 仍负责 UI、地图格子、角色头像、浮层、按钮和面板。
```

---

## 2.2 分工边界

```text
React：
- 全屏战斗页面
- 地图网格
- 角色头像
- 血条
- 属性浮层
- 行动栏
- 技能列表
- 伤害预览浮窗
- 战斗日志
- 开局配置
- 地图编辑器

Motion：
- UI 微交互
- 面板出现/消失
- 按钮 hover/tap
- 伤害数字上浮
- 治疗数字上浮
- 血条变化过渡
- 角色受击抖动
- 死亡淡出
- Buff 图标动画

PixiJS：
- 技能特效
- 激光线
- 爆炸圆环
- 铁索连线
- 雷暴闪电
- 火焰粒子
- 地形触发闪光
- 范围冲击波

AudioManager：
- 移动音效
- 挖宝音效
- 普攻音效
- 技能音效
- 死亡音效
- 地形触发音效
```

---

# 3. 战斗界面总体结构

## 3.1 全屏地图结构

推荐页面结构：

```text
BattleScreen
├── FullscreenMapViewport
│   ├── BattleMapLayer
│   │   ├── TerrainGrid
│   │   ├── RangeHighlightLayer
│   │   ├── EntityLayer
│   │   ├── FloatingTextLayer
│   │   └── InteractionOverlay
│   ├── PixiBattleEffectsLayer
│   └── MapTooltipLayer
├── TopHud
├── SelectedEntityPanel
├── ActionCommandBar
├── SkillSelectPanel
├── DamagePreviewTooltip
├── BattleLogMiniPanel
├── AudioRoot / AudioManager
└── ToastLayer
```

视觉原则：

1. 地图占满屏幕。
2. HUD 尽量轻量，不遮挡地图。
3. 当前点击对象的信息用浮层展示。
4. 行动栏靠近被选中的角色或屏幕底部居中。
5. 技能列表采用浮动卡片，不占据大量固定空间。
6. 所有浮层都要有透明度、阴影、圆角和统一风格。

---

## 3.2 顶部 HUD

顶部只保留必要信息：

- 当前轮数。
- 当前行动角色。
- 当前角色临时行动点。
- 当前角色永久行动点。
- 当前行动队列简略预览。
- 胜负状态。
- 设置按钮 / 音量按钮。

示例：

```text
第 4 轮 | 当前行动：炎帝 | 临时 AP 3 | 永久 AP 2 | 下一个：重装骑士
```

要求：

- 不要占用过高空间。
- 半透明背景。
- 当前行动角色高亮。
- 行动点变化时有轻微动画。
- 可折叠或缩小。

---

# 4. 地图交互：缩放、拖拽、坐标转换

## 4.1 地图滚轮缩放

地图必须支持鼠标滚轮缩放。

要求：

1. 鼠标滚轮向上：放大。
2. 鼠标滚轮向下：缩小。
3. 缩放中心应尽量以鼠标所在位置为中心。
4. 缩放范围建议：

```ts
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
```

5. 缩放时地图、实体、范围高亮、PixiJS 特效层必须同步变化。
6. 缩放不影响游戏规则，只影响显示。

---

## 4.2 地图拖拽平移

地图支持鼠标拖拽平移。

要求：

1. 按住鼠标中键或空白地图区域拖拽，可以移动地图视角。
2. 拖拽地图不能误触发角色移动或技能释放。
3. 当处于技能选择目标模式时，拖拽和点击要区分。
4. 可以按住空格键临时进入拖拽视角模式。
5. 地图边界可以允许适度超出，但不要无限拖走。

推荐交互：

```text
左键点击：选择角色 / 选择格子 / 执行操作
左键拖拽空白处：平移地图
滚轮：缩放地图
右键：取消当前操作模式
Esc：取消当前操作模式
```

---

## 4.3 坐标转换

必须统一以下坐标转换：

```ts
function gridToWorld(position: Position): { x: number; y: number }

function worldToScreen(world: { x: number; y: number }): { x: number; y: number }

function screenToGrid(screen: { x: number; y: number }): Position | null
```

要求：

1. React 地图层、浮层、PixiJS 特效层使用同一套坐标系统。
2. 缩放和平移后，点击格子的判定必须准确。
3. PixiJS 特效必须对齐格子中心。
4. Tooltip 必须显示在正确格子或角色附近。

---

## 4.4 地图层级

推荐层级：

```text
Layer 0：地形格子
Layer 1：地形动态效果，例如岩浆微光、雷暴闪烁
Layer 2：可移动 / 可攻击 / 技能范围高亮
Layer 3：悬停格 / 选中格边框
Layer 4：角色、小怪、召唤物、藏宝点头像
Layer 5：血条、实时血量数值、Buff 图标
Layer 6：Motion 浮动数字
Layer 7：PixiJS 技能特效层
Layer 8：Tooltip、属性栏、行动栏
```

---

# 5. 点击角色后的交互流程

## 5.1 点击当前行动角色

当玩家点击“当前正在行动的角色”时：

1. 显示角色属性浮层。
2. 显示行动栏。
3. 高亮当前角色所在格。
4. 显示当前角色可执行操作。

行动栏包含：

```text
移动
攻击
技能
挖宝
结束行动
```

如果某个操作不可用，应显示为禁用状态，并提示原因。

例如：

- 行动点不足。
- 沉默中，不能使用技能。
- 禁走中，不能移动。
- 附近没有可挖藏宝点。
- 没有可用技能。

---

## 5.2 点击非当前行动角色

当玩家点击“当前不在行动的角色 / 小怪 / 召唤物”时：

1. 只显示该实体的属性浮层。
2. 不显示行动栏。
3. 不允许发起移动、攻击、技能、挖宝。
4. 如果当前处于攻击或技能目标选择模式，则该点击可以作为目标选择。

显示内容：

- 名称
- 类型
- 当前 HP / 最大 HP
- 攻击
- 防御
- 速度
- 幸运
- 暴击率
- 攻击范围
- Buff / Debuff
- 所在地形

---

## 5.3 点击空白格

当未处于操作模式：

- 点击空白格只显示格子信息。
- 如果格子有地形，显示地形说明。
- 如果格子是危险地形，显示危险提示。
- 如果格子是藏宝点，显示藏宝点信息。

当处于操作模式：

- 移动模式：点击合法移动格执行移动。
- 攻击模式：点击合法目标执行攻击。
- 技能模式：点击合法目标或格子释放技能。
- 挖宝模式：点击合法藏宝点执行挖宝。

---

# 6. 属性浮层 SelectedEntityPanel

## 6.1 显示方式

点击角色、小怪、召唤物或藏宝点时，显示属性浮层。

位置建议：

1. 优先显示在被点击实体附近。
2. 如果靠近屏幕边缘，则自动调整到可见区域。
3. 也可以固定在屏幕左下角或右下角，但不要遮挡地图中心。

UI 要求：

- 简洁美观。
- 半透明深色或浅色玻璃质感。
- 圆角。
- 轻微阴影。
- 信息分层清晰。
- 使用 Motion 出现/消失动画。

---

## 6.2 角色属性显示内容

角色 / 召唤物显示：

```text
头像
名称
当前 HP / 最大 HP
血条
临时行动点
永久行动点
攻击力
防御力
速度
幸运
暴击率
攻击范围
当前位置
当前地形
Buff / Debuff
携带技能数量
```

其中：

- HP 数值必须和地图头像下方实时血量一致。
- Buff 图标可以 hover 显示说明。
- 危险地形需要显示警告，例如“位于雷暴：回合开始可能受到伤害”。

---

## 6.3 小怪属性显示内容

小怪显示：

```text
头像
名称
当前 HP / 最大 HP
血条
攻击力
防御力
攻击范围
暴击率
当前位置
当前地形
反击说明
```

反击说明示例：

```text
受到直接攻击后，若攻击者在攻击范围内，会立即反击。
```

---

## 6.4 藏宝点显示内容

藏宝点显示：

```text
名称：藏宝点
状态：未挖掘 / 已挖掘
挖宝要求：在攻击距离内
挖宝消耗：1 AP
成功率：由角色幸运值决定
失败惩罚：50% 无事发生，50% 扣 10 HP
```

如果当前行动角色已选中，可以显示：

```text
当前角色挖宝成功率：xx%
```

---

# 7. 行动栏 ActionCommandBar

## 7.1 显示条件

只有点击当前行动角色时显示行动栏。

行动栏按钮：

```text
移动
攻击
技能
挖宝
结束行动
```

要求：

1. 靠近角色或固定在屏幕底部居中。
2. 简洁美观，有游戏按钮感。
3. 按钮 hover / press 有 Motion 动画。
4. 不可用按钮变灰，并能 hover 显示原因。
5. 右键或 Esc 可以关闭行动栏 / 退出当前模式。

---

## 7.2 按钮状态

### 移动

可用条件：

- 当前角色未处于禁走状态。
- 当前角色有足够行动点移动到至少一个相邻可走格。
- 冰面 0AP 移动时，即使 AP 为 0 也可移动。

点击后：

- 进入 `move_targeting` 模式。
- 地图上高亮可移动格。
- 鼠标悬停格子显示移动消耗。
- 点击合法格子后执行移动 API。

---

### 攻击

可用条件：

- 当前角色有至少 1 点行动点。
- 存在攻击范围内的非盟友活体目标。

点击后：

- 进入 `attack_targeting` 模式。
- 地图上高亮攻击范围。
- 可攻击目标高亮。
- 鼠标悬停目标显示最终伤害预览。
- 点击合法目标后执行普通攻击 API。

---

### 技能

可用条件：

- 当前角色未处于沉默状态。
- 当前角色拥有至少一个可用技能。
- 当前角色有可能支付某个技能的行动点。

点击后：

- 先显示技能列表面板。
- 玩家选择技能后，再进入对应技能的目标选择模式。
- 选择技能前，不直接显示技能范围。
- 选择技能后，根据技能显示可选目标 / 可选格 / 可选方向。

---

### 挖宝

可用条件：

- 当前角色有至少 1 点行动点。
- 存在攻击距离内的未挖掘藏宝点。

点击后：

- 进入 `dig_targeting` 模式。
- 高亮可挖藏宝点。
- 鼠标悬停藏宝点显示成功率和失败惩罚。
- 点击藏宝点后执行挖宝 API。

---

### 结束行动

点击后：

- 结束当前角色行动。
- 进入下一个行动单位。
- 清除当前选择、范围高亮、行动栏和技能面板。
- 播放轻微 UI 过渡动画。

---

# 8. 操作模式 InteractionMode

前端应维护明确的操作模式。

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

状态说明：

| 模式               | 说明              |
| ---------------- | --------------- |
| idle             | 默认浏览地图          |
| entity_selected  | 选中了实体，只显示信息或行动栏 |
| move_targeting   | 正在选择移动目标格       |
| attack_targeting | 正在选择普攻目标        |
| skill_selecting  | 正在选择技能          |
| skill_targeting  | 已选择技能，正在选择目标    |
| dig_targeting    | 正在选择藏宝点         |
| map_panning      | 正在拖拽地图视角        |

要求：

1. 每种模式有明确进入和退出条件。
2. 右键或 Esc 返回上一个合理状态。
3. 执行 API 成功后回到 `entity_selected` 或切换到下一个行动角色。
4. 执行失败时保留当前模式，并显示错误提示。
5. 切换模式时清理不相关的高亮。

---

# 9. 地图提示格与目标选择

## 9.1 移动提示格

点击“移动”后：

- 高亮所有相邻可移动格。
- 如果未来支持连续移动，可扩展为多格路径。
- 第一版仍按“每次移动一格”实现。
- 每个可移动格可以显示 AP 消耗数字。

不同地形显示：

```text
normal：1 AP
swamp 离开：2 AP
ice 离开：0 AP
obstacle：不可移动
```

---

## 9.2 攻击提示格

点击“攻击”后：

- 高亮当前角色攻击范围内的格子。
- 可攻击目标有明显边框。
- 非法目标不高亮。
- 盟友不作为可攻击目标。
- 小怪可作为可攻击目标。
- 鼠标悬停目标显示伤害预览。

---

## 9.3 技能提示格

点击“技能”后先显示技能列表。

选择技能后：

根据技能类型显示不同提示：

```text
single_entity：高亮可选实体
cell：高亮可选格子
direction：显示上下左右四个方向按钮或方向箭头
self：直接提示确认释放
two_entities：提示依次选择两个目标
```

技能范围和影响范围要区分：

```text
可选择范围：表示技能能点哪里。
影响范围：表示技能释放后会影响哪些格子或目标。
```

视觉区分：

```text
可选择范围：紫色半透明
影响范围：橙色半透明
最终命中目标：红色或金色描边
```

---

## 9.4 挖宝提示格

点击“挖宝”后：

- 高亮攻击距离内的未挖掘藏宝点。
- 显示宝箱边框。
- 鼠标悬停显示成功率。
- 点击宝箱后执行挖宝。

---

# 10. 技能列表 SkillSelectPanel

## 10.1 显示方式

点击行动栏中的“技能”后，显示技能列表面板。

位置建议：

- 靠近行动栏弹出。
- 或固定在屏幕底部中间。
- 不遮挡当前角色和主要目标区域。

UI 要求：

- 技能卡片有图标、名称、消耗、简短描述。
- 可用技能高亮。
- 不可用技能灰色。
- 技能 hover 显示详细 tooltip。
- 技能选择后面板可以收起，进入目标选择模式。
- 使用成功后技能从列表中移除，并播放消失动画。

---

## 10.2 技能卡片内容

每个技能卡片显示：

```text
技能图标
技能名称
行动点消耗
目标类型
简短效果
是否一次性
可用状态
```

不可用原因：

- 行动点不足。
- 被沉默。
- 没有合法目标。
- 技能数据异常。

---

## 10.3 技能选择后的流程

```text
点击当前行动角色
↓
点击“技能”
↓
显示技能列表
↓
选择技能
↓
进入 skill_targeting 模式
↓
地图显示可选目标 / 可选格 / 可选方向
↓
鼠标悬停显示预览
↓
点击目标释放
↓
后端结算
↓
返回 GameState + BattleEvent
↓
播放动画和音效
↓
技能从列表移除
```

---

# 11. 实时血量显示

## 11.1 地图头像下方显示 HP 数值

地图上每个角色 / 小怪 / 召唤物头像下方必须显示：

```text
当前血量 / 最大血量
```

例如：

```text
36 / 80
```

显示要求：

1. 位于血条下方或血条内部。
2. 字体清晰。
3. 缩放地图时仍然可读。
4. 血量变化时有过渡动画。
5. 低血量时血条颜色变化或轻微闪烁。
6. 死亡后隐藏或显示为 0。

---

## 11.2 血条动画

当 HP 改变：

- 血条宽度平滑变化。
- 受到伤害时显示红色掉血动画。
- 治疗时显示绿色恢复动画。
- 数值变化可以使用 Motion 做短暂弹跳。

---

# 12. 伤害预览 Damage Preview

## 12.1 功能目标

当玩家处于攻击或技能目标选择模式时，如果鼠标长时间停留在某个格子或人物上方，应显示最终造成的真实伤害预览。

这里的“真实伤害预览”指：

```text
根据当前规则实际结算后预计造成的最终结果。
```

包括：

- 攻击力
- 防御力
- 暴击概率
- 技能伤害
- 真实伤害
- 百分比伤害
- 地形影响
- Buff 影响
- 临界爆发等倍率
- 是否会击杀
- 是否会触发小怪反击
- 行动点消耗

---

## 12.2 重要原则：预览由后端计算

前端不能自己计算最终伤害。

必须由后端提供预览 API。

新增 API：

```text
POST /api/game/action-preview
```

请求：

```ts
interface ActionPreviewRequest {
  gameId: string;
  actorId: string;

  actionType: "attack" | "skill" | "move" | "dig";

  targetPosition?: Position;
  targetEntityId?: string;

  skillInstanceId?: string;
  direction?: "up" | "down" | "left" | "right";

  selectedTargetIds?: string[];
}
```

返回：

```ts
interface ActionPreviewResponse {
  valid: boolean;
  reason?: string;

  actionType: "attack" | "skill" | "move" | "dig";

  apCost?: {
    temporaryAp: number;
    permanentAp: number;
    total: number;
  };

  damagePreviews?: DamagePreviewItem[];

  healPreviews?: HealPreviewItem[];

  buffPreviews?: BuffPreviewItem[];

  terrainPreviews?: TerrainPreviewItem[];

  counterAttackPreview?: DamagePreviewItem;

  digPreview?: {
    successRate: number;
    failNoEffectRate: number;
    failDamageRate: number;
    failDamageValue: number;
  };

  killPreview?: {
    willKill: boolean;
    killedEntityIds: string[];
  };

  affectedPositions?: Position[];
}
```

```ts
interface DamagePreviewItem {
  targetEntityId: string;
  targetName: string;

  damageType: "normal" | "true" | "percent_max_hp" | "terrain";
  finalDamage: number;

  baseDamage?: number;
  defenseReduction?: number;

  canCrit: boolean;
  critRate?: number;
  critDamagePreview?: number;

  willKill: boolean;
}
```

说明：

- 普通攻击预览要返回最终伤害。
- 技能预览要返回每个受影响目标的预计结果。
- 如果技能有范围效果，返回 `affectedPositions`。
- 如果目标是小怪且会反击，返回 `counterAttackPreview`。
- 如果是挖宝，返回成功率与失败惩罚概率。
- 如果操作非法，返回 `valid = false` 和原因。

---

## 12.3 触发方式

鼠标悬停在格子 / 目标上超过一定时间后触发预览。

建议：

```ts
const PREVIEW_DELAY_MS = 350;
```

要求：

1. hover 立即高亮目标。
2. 超过 350ms 后请求 preview API。
3. 鼠标移走时取消请求或忽略返回。
4. 同一目标短时间内可缓存预览结果。
5. 操作模式改变时清空预览。
6. 不要在每一帧请求 preview API。

---

## 12.4 DamagePreviewTooltip 展示内容

攻击预览示例：

```text
普通攻击
消耗：1 AP
预计伤害：12
暴击率：20%
暴击伤害：27
目标剩余：18 / 60
小怪反击：预计 8 伤害
```

技能预览示例：

```text
激光
消耗：1 AP
命中目标：3
目标 A：8 伤害
目标 B：10 伤害，可能击杀
目标 C：1 伤害
```

挖宝预览示例：

```text
挖宝
消耗：1 AP
成功率：70%
失败：50% 无事发生，50% 受到 10 点伤害
```

非法操作示例：

```text
无法攻击：目标是盟友
无法移动：目标格为障碍物
无法释放：行动点不足
```

---

# 13. 音效接口预留

## 13.1 目标

后续会为不同动作增加音效：

```text
移动
挖宝
普通攻击
释放技能
不同技能
受伤
治疗
死亡
反击
地形触发
胜利
失败
```

本阶段不要求准备所有音频文件，但必须预留结构和接口。

---

## 13.2 SkillTemplate 音效字段

扩展 `SkillVisualConfig` 或新增音效字段：

```ts
interface SkillVisualConfig {
  visualKey?: string;
  impactColor?: string;
  trailType?: string;
  soundKey?: string;
}
```

`skill.visual.soundKey` 用于指定技能释放音效。

例如：

```json
{
  "visual": {
    "visualKey": "blast",
    "soundKey": "skill_blast"
  }
}
```

---

## 13.3 BattleEvent 音效字段

扩展 `BattleEvent`：

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
  soundKey?: string;

  value?: number;
  metadata?: Record<string, any>;
}
```

后端可以直接返回 `soundKey`。

如果后端不返回，前端可以根据事件类型和 skill visual fallback：

```text
event.soundKey
↓
skill.visual.soundKey
↓
default sound by event.type
```

---

## 13.4 AudioManager

前端新增：

```text
AudioManager
```

职责：

1. 维护 soundKey 到音频文件的映射。
2. 播放一次性音效。
3. 控制音量。
4. 支持静音。
5. 避免同一音效过度叠加。
6. 支持未来加入背景音乐。

接口建议：

```ts
type SoundKey =
  | "ui_click"
  | "ui_hover"
  | "move_step"
  | "attack_slash"
  | "counter_attack"
  | "dig_success"
  | "dig_fail"
  | "skill_blast"
  | "skill_heal"
  | "skill_laser"
  | "skill_chain"
  | "skill_curse"
  | "buff_apply"
  | "damage_hit"
  | "heal"
  | "death"
  | "terrain_lava"
  | "terrain_wood_stake"
  | "terrain_thunderstorm"
  | "victory"
  | "defeat";

interface AudioManager {
  play(soundKey: SoundKey, options?: PlaySoundOptions): void;
  setMasterVolume(value: number): void;
  setMuted(muted: boolean): void;
}
```

```ts
interface PlaySoundOptions {
  volume?: number;
  loop?: boolean;
  interrupt?: boolean;
  delayMs?: number;
}
```

---

## 13.5 音效资源目录

预留目录：

```text
frontend/src/assets/audio/
  ui/
    click.wav
    hover.wav
  actions/
    move_step.wav
    attack_slash.wav
    counter_attack.wav
    death.wav
  skills/
    blast.wav
    heal.wav
    laser.wav
    chain.wav
    curse.wav
  terrain/
    lava.wav
    wood_stake.wav
    thunderstorm.wav
  system/
    victory.wav
    defeat.wav
```

如果音频文件暂时不存在：

```text
AudioManager 不应报错。
应静默跳过或输出开发环境 warning。
```

---

## 13.6 音效触发规则

根据 `BattleEvent` 触发音效：

| BattleEvent                    | 默认 soundKey                                 |
| ------------------------------ | ------------------------------------------- |
| move                           | move_step                                   |
| skill_cast                     | skill.visual.soundKey 或按 visualKey fallback |
| damage                         | damage_hit                                  |
| heal                           | heal                                        |
| death                          | death                                       |
| counter_attack                 | counter_attack                              |
| treasure_dig_success           | dig_success                                 |
| treasure_dig_fail              | dig_fail                                    |
| terrain_triggered lava         | terrain_lava                                |
| terrain_triggered wood_stake   | terrain_wood_stake                          |
| terrain_triggered thunderstorm | terrain_thunderstorm                        |

按钮交互：

| UI 操作      | soundKey |
| ---------- | -------- |
| hover 技能按钮 | ui_hover |
| 点击行动按钮     | ui_click |
| 选择技能       | ui_click |
| 取消操作       | ui_click |

注意：

```text
音效不能影响规则结算。
音效播放失败不能阻断游戏流程。
```

---

# 14. Motion 动画要求

## 14.1 必须实现的 Motion 动画

1. 行动按钮 hover / tap。
2. 技能卡片 hover / tap。
3. 技能使用后消失。
4. 属性浮层出现 / 消失。
5. 行动栏出现 / 消失。
6. 伤害数字上浮。
7. 治疗数字上浮。
8. 角色受击抖动。
9. 死亡淡出。
10. Buff 图标出现 / 消失。
11. 当前行动角色呼吸光圈。
12. 战斗日志新条目滑入。

---

## 14.2 动画时长建议

```text
按钮 hover / tap：100ms - 180ms
浮层出现 / 消失：180ms - 300ms
伤害数字上浮：600ms - 900ms
死亡淡出：500ms - 800ms
技能特效：600ms - 900ms
战斗日志出现：200ms - 350ms
```

原则：

```text
按钮反馈要快。
战斗特效可以稍慢。
不要为了动画拖慢操作。
```

---

# 15. PixiJS 技能特效层

## 15.1 PixiJS 使用范围

PixiJS 只负责地图上的战斗特效。

用于：

- 激光线
- 爆炸圆环
- 锁链连线
- 雷暴闪电
- 火焰粒子
- 地形触发闪光
- 范围冲击波

不用于：

- 地图状态管理
- 角色状态管理
- 技能结算
- UI 面板
- 按钮
- 开局配置
- 地图编辑器

---

## 15.2 PixiEffectsCanvas 接口

建议实现：

```ts
interface PixiEffectsCanvasProps {
  events: BattleEvent[];
  gridToScreen: (position: Position) => { x: number; y: number };
  cellSize: number;
  zoom: number;
  offset: { x: number; y: number };
  width: number;
  height: number;
}
```

要求：

1. 初始化 PixiJS Application。
2. 接收事件。
3. 根据事件创建图形 / 粒子 / 连线。
4. 特效结束后自动销毁。
5. 组件卸载时销毁 PixiJS Application。
6. 使用 `event.id` 去重，避免重复播放。
7. 地图缩放和平移时特效层同步。

---

## 15.3 visualKey 映射

前端维护：

```ts
const VISUAL_EFFECTS = {
  slash: SlashEffect,
  blast: BlastEffect,
  heal: HealEffect,
  "laser-line": LaserLineEffect,
  "chain-link": ChainLinkEffect,
  "buff-up": BuffUpEffect,
  curse: CurseEffect,
  burn: BurnEffect,
  stun: StunEffect,
  "arrow-rain": ArrowRainEffect,
  execute: ExecuteEffect,
  swap: SwapEffect,
  "terrain-lava": TerrainLavaEffect,
  "terrain-wood-stake": WoodStakeEffect,
  "terrain-ice": IceMoveEffect,
  "terrain-thunderstorm": ThunderstormEffect,
  default: DefaultEffect
};
```

多个技能可以复用同一个 visualKey。

---

# 16. 战斗日志

## 16.1 显示方式

战斗日志应是轻量浮层，不要占满屏幕。

建议：

- 默认显示最近 5 - 8 条。
- 可展开查看完整日志。
- 位于左下角或右下角。
- 半透明背景。
- 重要事件高亮。

---

## 16.2 事件分类

| 事件      | 表现        |
| ------- | --------- |
| 暴击      | 金色强调      |
| 击杀      | 红色 / 骷髅图标 |
| 反击      | 橙色        |
| 挖宝成功    | 金色        |
| 挖宝失败    | 灰色 / 红色   |
| 地形伤害    | 紫色 / 红色   |
| 获得技能    | 蓝色 / 金色   |
| 结盟      | 金色链条      |
| 灼烧 / 眩晕 | 状态图标      |

Motion：

- 新日志滑入。
- 重要日志短暂闪光。
- 超出数量后旧项淡出。

---

# 17. 错误提示与操作反馈

必须有 UI 提示，而不是只在控制台报错。

需要处理：

1. 行动点不足。
2. 目标不合法。
3. 超出距离。
4. 被沉默，无法释放技能。
5. 被禁走，无法移动。
6. 目标是盟友，不能攻击。
7. 地形不可进入。
8. 该格子不是合法目标。
9. 技能选择未完成。
10. 预览请求失败。
11. 音频文件缺失。
12. 动画播放失败时降级。

建议使用：

```text
Toast
Inline warning
Tooltip reason
按钮禁用原因
```

---

# 18. 前端组件结构建议

```text
frontend/src/components/battle/
  BattleScreen.tsx
  FullscreenMapViewport.tsx
  BattleMapLayer.tsx
  TerrainGrid.tsx
  RangeHighlightLayer.tsx
  EntityLayer.tsx
  BattleEntityToken.tsx
  EntityHealthBar.tsx
  SelectedEntityPanel.tsx
  ActionCommandBar.tsx
  SkillSelectPanel.tsx
  DamagePreviewTooltip.tsx
  BattleEffectsLayer.tsx
  PixiEffectsCanvas.tsx
  MotionFloatingTextLayer.tsx
  BattleLogMiniPanel.tsx
  TopHud.tsx
  MapTooltipLayer.tsx

frontend/src/hooks/battle/
  useMapCamera.ts
  useInteractionMode.ts
  useActionPreview.ts
  useBattleEvents.ts
  useBattleAudio.ts

frontend/src/audio/
  AudioManager.ts
  soundRegistry.ts

frontend/src/effects/
  visualEffectRegistry.ts
  pixiEffects/
  motionEffects/
```

---

# 19. 实施顺序

## 阶段 A：重构战斗界面为全屏地图

任务：

1. 新建 `BattleScreen`。
2. 地图铺满屏幕。
3. 将原来的固定侧边栏改为浮层。
4. 实现顶部轻量 HUD。
5. 保持现有功能可用。

验收：

- 地图成为视觉中心。
- 不破坏现有操作。
- 不修改 game-core。

---

## 阶段 B：地图缩放与拖拽

任务：

1. 实现滚轮缩放。
2. 实现地图拖拽平移。
3. 实现统一坐标转换。
4. 确保点击格子准确。
5. 确保 PixiJS 层可同步。

验收：

- 缩放后点击仍准确。
- 拖拽不会误触发操作。
- 地图移动和特效层对齐。

---

## 阶段 C：点击角色显示属性栏与行动栏

任务：

1. 点击当前行动角色，显示属性栏和行动栏。
2. 点击非当前行动角色，只显示属性栏。
3. 点击空格显示格子 / 地形信息。
4. 实现右键 / Esc 取消。
5. 用 Motion 优化浮层动画。

验收：

- 当前行动角色和非当前行动角色交互不同。
- 属性栏简洁美观。
- 行动栏简洁美观。
- 不遮挡关键地图区域。

---

## 阶段 D：操作模式与提示格

任务：

1. 实现 `InteractionMode`。
2. 移动按钮进入移动模式。
3. 攻击按钮进入攻击模式。
4. 技能按钮先打开技能列表。
5. 挖宝按钮进入挖宝模式。
6. 各模式显示对应提示格。
7. 点击合法格子 / 目标后触发 API。

验收：

- 操作流程清晰。
- 高亮准确。
- 非法目标不可点或有提示。
- 模式切换不会残留高亮。

---

## 阶段 E：技能列表与技能释放

任务：

1. 点击技能按钮显示技能列表。
2. 技能卡片显示图标、消耗、描述、状态。
3. 选择技能后进入目标选择。
4. 技能释放后移除技能实例。
5. 使用 Motion 做技能卡片消失动画。

验收：

- 技能使用流程自然。
- 技能列表不遮挡地图核心区域。
- 技能释放后 UI 状态正确。

---

## 阶段 F：伤害预览

任务：

1. 新增 `/api/game/action-preview`。
2. 前端 hover 延迟请求预览。
3. 显示 DamagePreviewTooltip。
4. 支持攻击、技能、移动、挖宝预览。
5. 预览由后端计算。

验收：

- 长时间 hover 后出现最终伤害预览。
- 小怪反击预览正确显示。
- 挖宝成功率正确显示。
- 非法操作显示原因。
- 前端不自行计算最终伤害。

---

## 阶段 G：Motion 微交互

任务：

1. 按钮反馈。
2. 浮层动画。
3. 血条动画。
4. 伤害 / 治疗数字。
5. Buff 图标动画。
6. 死亡淡出。
7. 战斗日志动画。

验收：

- 操作反馈明显。
- 动画轻量顺滑。
- 不影响 API 结算。

---

## 阶段 H：PixiJS 特效层

任务：

1. 实现 `PixiEffectsCanvas`。
2. 实现 visualKey 映射。
3. 实现激光、爆炸、锁链、雷暴、火焰等效果。
4. 使用 event.id 去重。
5. 特效结束后清理。

验收：

- 特效位置准确。
- 缩放拖拽后仍对齐。
- 不接管地图逻辑。
- 不造成内存泄漏。

---

## 阶段 I：音效接口预留

任务：

1. 实现 `AudioManager`。
2. 实现 `soundRegistry`。
3. 扩展 BattleEvent soundKey。
4. 扩展 SkillTemplate.visual.soundKey。
5. 根据事件播放音效。
6. 支持静音和音量控制。
7. 音频缺失时不报错。

验收：

- 可以通过 soundKey 播放音效。
- 缺少文件不影响游戏。
- 后续增加音效文件无需改规则逻辑。
- UI 有音量 / 静音入口。

---

# 20. 最终验收标准

完成后应满足：

1. 战斗界面全屏地图化。
2. 地图支持滚轮缩放。
3. 地图支持拖拽平移。
4. 点击当前行动角色显示属性栏和行动栏。
5. 点击非当前行动角色只显示属性栏。
6. 移动、攻击、技能、挖宝都有清晰操作模式。
7. 点击行动按钮后地图出现对应提示格。
8. 点击技能后先显示技能列表，再选择技能释放。
9. 地图头像下方实时显示 HP 数值。
10. 攻击 / 技能 hover 后能显示最终伤害预览。
11. 属性栏和行动栏简洁美观。
12. Motion 微交互完整。
13. PixiJS 技能特效层可用。
14. BattleEvent 驱动动画。
15. 预留音效接口和 soundKey。
16. 音效缺失不影响游戏。
17. 前端不重新计算规则。
18. game-core 不被重构。

---

# 21. 给 Codex 的总提示词

```text
请根据本文档进行战斗前端优化。本阶段在新增小怪、开局随机性、地形升级完成后进行。

核心目标：
把战斗界面改造成全屏地图式战棋界面。地图支持滚轮缩放和拖拽平移。点击当前行动角色显示属性栏和行动栏，行动栏包含移动、攻击、技能、挖宝、结束行动。点击技能后先显示技能列表，选择技能后再进入目标选择。点击非当前行动角色只显示属性。地图上角色头像血条下方显示实时 HP 数值。攻击或技能目标选择时，鼠标长时间停留在格子或人物上方显示最终伤害预览。预留移动、挖宝、攻击、技能、死亡等音效接口。

技术要求：
1. 使用或参考 ui-ux-pro-max skill 和 frontend-skill。
2. 引入 Motion，用于 UI 微交互、浮层、按钮、伤害数字、治疗数字、血条、死亡淡出、Buff 图标动画。
3. 引入 PixiJS，但只作为 BattleEffectsLayer，不要重写整个地图。
4. 实现全屏地图、滚轮缩放、拖拽平移和统一坐标转换。
5. 实现 SelectedEntityPanel、ActionCommandBar、SkillSelectPanel、DamagePreviewTooltip。
6. 实现 InteractionMode：idle、entity_selected、move_targeting、attack_targeting、skill_selecting、skill_targeting、dig_targeting、map_panning。
7. 新增 /api/game/action-preview，由后端计算最终伤害和操作预览，前端不能自行计算伤害。
8. 扩展 BattleEvent，支持 visualKey 和 soundKey。
9. 实现 AudioManager 和 soundRegistry，音效文件缺失时不能影响游戏。
10. 动画和音效都不能阻塞后端结算。
11. 不修改 game-core，不重写技能结算、伤害计算、随机奖励、回合系统。
12. 保持界面简洁美观，属性栏和行动栏尤其要有游戏感。
```
