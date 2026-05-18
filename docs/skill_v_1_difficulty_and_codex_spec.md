# 第一版通用技能实现难度分析与 Codex 实现规格

## 1. 文档目标

本文档用于将第一版准备实现的通用技能列表，扩充为 Codex 可以直接实现的需求规格。

原始技能表来自用户上传的第一版技能列表，其中所有技能均为通用技能，包含基础伤害、治疗、属性修改、延迟爆炸、伤害同步、结盟、眩晕、灼烧、沉默、禁走、额外行动等效果。

本阶段目标：

1. 分析每个技能的实现难度。
2. 明确每个技能的目标类型、作用范围、消耗行动点、持续时间、伤害类型和边界情况。
3. 将技能拆解为 Effect Engine 可以实现的效果组合。
4. 标记哪些技能可以配置化实现，哪些技能需要扩展 game-core。
5. 给 Codex 提供可执行、边界明确的实现说明。

---

## 2. 总体结论

第一版技能总数：30 个。

整体难度分布：

| 难度 | 数量 | 说明 |
|---|---:|---|
| 低 | 15 | 基础伤害、治疗、永久属性增减、获得行动点、随机伤害等，可直接用配置型 Effect 实现 |
| 中 | 10 | 需要 Buff、持续时间、额外行动、沉默、禁走、区域技能等，需要已有系统配合 |
| 高 | 5 | 涉及延迟范围结算、伤害同步、下一次伤害倍率、血量交换、条件斩杀等复杂联动 |

建议实现顺序：

1. 先实现基础 Effect：伤害、治疗、属性增减、获得永久行动点。
2. 再实现 Buff 系统：眩晕、灼烧、沉默、禁走、临时属性增益。
3. 再实现范围技能：直线、3x3、5x5。
4. 最后实现复杂技能：C4炸弹、铁索连环、临界爆发、乾坤大挪移、咒死。

---

## 3. 全局规则补充

以下规则适用于本技能列表中的全部技能。

### 3.1 技能类型

本表中的全部技能均为：

```text
通用技能 common skill
```

所有技能都是一次性技能：

```text
角色持有 SkillInstance。
技能使用成功后，从角色技能列表中移除该 SkillInstance。
```

如果技能使用失败，例如目标非法、行动点不足、目标超出距离，则不消耗行动点，也不移除技能。

---

### 3.2 默认施法距离

原始技能表只给出了消耗行动点，没有单独给出技能距离。

第一版统一规则：

```text
除 self 类型技能外，所有技能的施法距离默认使用施法者当前 attackRange。
```

也就是说：

- 单体技能：目标必须在施法者 `attackRange` 内。
- 以格子为中心的范围技能：中心格必须在施法者 `attackRange` 内。
- 直线技能：直线最大长度为施法者 `attackRange`。
- 自身技能：不检查距离。

---

### 3.3 行动点消耗

释放技能时：

1. 检查角色是否持有该技能实例。
2. 检查技能是否未使用。
3. 检查角色是否未被沉默。
4. 检查目标是否合法。
5. 检查行动点是否足够。
6. 扣除行动点。
7. 结算技能效果。
8. 移除该技能实例。

行动点消耗规则：

```text
优先消耗 temporaryAP。
temporaryAP 不足时，再消耗 permanentAP。
```

---

### 3.4 目标类型约定

本技能列表中使用以下目标类型：

| targetType | 说明 |
|---|---|
| self | 只作用于施法者自己 |
| single_entity | 选择一个活体单位 |
| two_entities | 选择两个不同活体单位 |
| cell | 选择一个地图格子作为范围中心 |
| direction | 选择上下左右四个方向之一 |

活体单位包括：

```text
角色 Character
召唤物 Summon
小怪 Monster
```

藏宝点不是活体单位，不可作为治疗、增益、伤害、Buff 类技能目标。

---

### 3.5 伤害规则

伤害分为三类。

#### normal 普通伤害

```text
最终伤害 = max(1, 伤害值 - 目标当前防御)
```

普通伤害可以暴击。

暴击规则：

```text
如果触发暴击，伤害值先乘以 1.5，再减防御。
最终伤害仍然至少为 1。
```

#### true 真实伤害

真实伤害：

```text
无视防御
不触发暴击
直接扣除对应生命值
```

#### percent_max_hp 最大生命值百分比伤害

百分比伤害：

```text
伤害 = ceil(目标 maxHp * 百分比)
无视防御
不触发暴击
```

---

### 3.6 自己免疫自己的伤害

根据已有规则：

```text
角色所有伤害默认对自己不扣血。
```

实现要求：

```text
如果 damageEffect.sourceEntityId == targetEntityId，则该 damage effect 不生效。
```

但治疗、强化、获得行动点等正面效果仍可作用于自己。

---

### 3.7 盟友不能互相攻击

已有结盟规则：

```text
结盟后不能互相攻击。
```

因此，所有伤害类技能默认不能对盟友造成伤害。

范围伤害命中时，应自动跳过盟友。

---

### 3.8 Buff 持续时间口径

第一版统一采用：

```text
持续 N 回合 = 目标的 N 次行动机会。
```

具体规则：

- 眩晕 1 回合：跳过目标下一次行动机会，然后移除。
- 灼烧 3 回合：目标接下来 3 次回合开始时各扣一次血。
- 沉默 3 回合：目标接下来 3 次行动机会内不能使用技能。
- 禁走 3 回合：目标接下来 3 次行动机会内不能移动。
- 属性 Buff 3 回合：目标接下来 3 次行动机会内属性生效。

如果角色因为“再来一次”在一轮中有两次行动机会，则每次行动机会都单独计算 Buff 持续时间。

---

### 3.9 回合开始触发顺序

目标角色每次行动开始时，按以下顺序处理：

1. 检查角色是否存活。
2. 触发回合开始 Buff，例如灼烧。
3. 如果因 Buff 伤害死亡，直接结束该角色行动。
4. 判断是否眩晕。
5. 如果眩晕，则跳过本次行动机会，并减少/移除眩晕 Buff。
6. 如果未眩晕，则获得 temporaryAP。
7. 玩家进行移动、攻击、技能、挖宝等操作。

---

### 3.10 技能能否触发小怪反击

规则：

```text
小怪受到普通攻击或伤害技能后，若攻击者在小怪攻击范围内，小怪立即反击一次。
```

因此：

- 炸弹、激光、箭雨、随机一击等伤害技能可以触发小怪反击。
- 灼烧每回合扣血不触发反击。
- 铁索连环同步伤害不触发反击。
- C4炸弹爆炸不触发反击，因为这是延迟效果，不是当前施法者直接攻击。

---

### 3.11 技能死亡奖励

如果技能直接造成目标死亡，则击杀者是该技能的施法者。

如果是以下间接伤害导致死亡：

- 灼烧
- C4 延迟爆炸
- 肾上腺素副作用
- 铁索连环同步伤害

则仍记录原始来源 `sourceEntityId`，死亡奖励归该来源角色。

如果 sourceEntityId 不存在或已死亡，则不发放死亡奖励。

---

## 4. 需要新增 / 确认的底层能力

为了实现这批技能，game-core 至少需要支持以下 Effect 和 Buff。

### 4.1 EffectType

```ts
type EffectType =
  | "damage"
  | "heal"
  | "modify_stat"
  | "set_stat_temporarily"
  | "grant_permanent_ap"
  | "add_buff"
  | "delayed_area_damage"
  | "link_damage_sync"
  | "create_alliance"
  | "swap_current_hp"
  | "extra_turn_next_round"
  | "conditional_execute"
  | "instant_kill";
```

### 4.2 BuffType

```ts
type BuffType =
  | "stun"
  | "burn"
  | "silence"
  | "root"
  | "stat_modifier"
  | "next_damage_multiplier"
  | "damage_sync_link"
  | "adrenaline";
```

### 4.3 DamageEvent 字段

为了支持铁索连环、临界爆发、小怪反击、死亡奖励，建议统一 DamageEvent：

```ts
interface DamageEvent {
  id: string;
  batchId?: string;
  sourceEntityId: string;
  targetEntityId: string;
  amount: number;
  damageType: "normal" | "true" | "percent_max_hp";
  ignoreDefense: boolean;
  canCrit: boolean;
  isLinkedDamage?: boolean;
  isDotDamage?: boolean;
  isDelayedDamage?: boolean;
}
```

---

# 5. 技能难度总览表

| 技能 | 难度 | 实现方式 | 主要依赖 |
|---|---|---|---|
| 炸弹 | 低 | 配置型 | damage |
| 医疗包 | 低 | 配置型 | heal |
| 攻击力提升 | 低 | 配置型 | modify_stat |
| 强身健体 | 低 | 配置型 | modify_stat |
| 迅捷如风 | 低 | 配置型 | modify_stat，速度下轮生效 |
| 幸运四叶草 | 低 | 配置型 | modify_stat，luck clamp |
| 早有准备 | 低 | 配置型 | grant_permanent_ap |
| C4炸弹 | 高 | 需要核心扩展 | delayed_area_damage |
| 铁索连环 | 高 | 需要核心扩展 | damage_sync_link，DamageEvent |
| 结盟 | 中 | 半配置型 | alliance system |
| 肾上腺素 | 中 | 半配置型 | stat_modifier + delayed true damage |
| 铜墙铁壁 | 低-中 | 配置型 | timed stat_modifier |
| 乾坤大挪移 | 高 | 需要核心扩展 | two_entities + hp swap |
| 人品爆发 | 中 | 配置型 | temporary stat override |
| 激光 | 中 | 配置型 | direction + line area |
| 临界爆发 | 高 | 需要核心扩展 | next_damage_multiplier |
| 正中靶心 | 低 | 配置型 | modify_stat |
| 牢狱之灾 | 中 | 配置型 | stun buff |
| 灼烧 | 中 | 配置型 | burn buff |
| 箭雨 | 中 | 配置型 | 5x5 area damage |
| 身轻如燕 | 低 | 配置型 | modify temporaryApPerTurn |
| 肌无力 | 低 | 配置型 | modify_stat |
| 破甲 | 低 | 配置型 | modify_stat |
| 霉运当头 | 低 | 配置型 | modify_stat |
| 再来一次 | 中 | 配置型/核心已有 | extra_turn_next_round |
| 诅咒 | 低-中 | 配置型 | percent_max_hp damage |
| 重击 | 低 | 配置型 | true damage |
| 咒死 | 高 | 需要核心扩展 | conditional instant kill |
| 沉默 | 中 | 配置型 + validator | silence buff |
| 禁走 | 中 | 配置型 + validator | root buff |
| 随机一击 | 低-中 | 配置型 | random damage |

---

# 6. 技能逐项实现规格

## 6.1 炸弹

### 原始描述

对单个敌人造成 15 点伤害，消耗 1 行动点。

### 难度

低。

### 规格

```yaml
id: bomb
name: 炸弹
skillKind: configurable
usableAs: [common, reward]
cost: 1
targetType: single_entity
areaType: single
range: caster.attackRange
allowedTargets: non_allied_living_units
consumeOnSuccess: true
effects:
  - type: damage
    value: 15
    damageType: normal
    ignoreDefense: false
    canCrit: true
```

### 边界

- 不能选择自己。
- 不能选择盟友。
- 可以选择小怪。
- 会触发小怪反击。
- 使用后移除。

---

## 6.2 医疗包

### 难度

低。

### 规格

```yaml
id: medkit
name: 医疗包
cost: 1
targetType: single_entity
areaType: single
range: caster.attackRange
allowedTargets: any_living_unit
effects:
  - type: heal
    value: 20
```

### 边界

- 可以选择自己。
- 可以选择盟友。
- 可以选择非盟友角色或小怪，但这是玩家自愿操作。
- 回复后不能超过目标 maxHp。
- 不触发铁索连环。
- 不触发小怪反击。

---

## 6.3 攻击力提升

### 难度

低。

### 规格

```yaml
id: attack_up
name: 攻击力提升
cost: 1
targetType: single_entity
range: caster.attackRange
allowedTargets: any_living_unit
effects:
  - type: modify_stat
    stat: baseAttack
    value: 3
    duration: permanent_in_battle
```

### 边界

- 永久提高本局战斗中的基础攻击力。
- 不影响角色模板数据，只影响当前 BattleEntity。
- 可作用于自己。

---

## 6.4 强身健体

```yaml
id: defense_up
name: 强身健体
cost: 1
targetType: single_entity
range: caster.attackRange
allowedTargets: any_living_unit
effects:
  - type: modify_stat
    stat: baseDefense
    value: 3
    duration: permanent_in_battle
```

难度：低。

边界：防御值增加后立即影响后续伤害计算。

---

## 6.5 迅捷如风

```yaml
id: speed_up
name: 迅捷如风
cost: 1
targetType: single_entity
range: caster.attackRange
allowedTargets: any_living_unit
effects:
  - type: modify_stat
    stat: speed
    value: 3
    duration: permanent_in_battle
```

难度：低。

边界：

- 当前回合行动队列不重新排序。
- 从下一轮生成行动队列时生效。

---

## 6.6 幸运四叶草

```yaml
id: lucky_clover
name: 幸运四叶草
cost: 1
targetType: single_entity
range: caster.attackRange
allowedTargets: any_living_unit
effects:
  - type: modify_stat
    stat: luck
    value: 15
    duration: permanent_in_battle
    clamp: [0, 100]
```

难度：低。

边界：

- 幸运值有效范围为 0 到 100。
- 超过 100 时按 100 计算。

---

## 6.7 早有准备

```yaml
id: prepared
name: 早有准备
cost: 3
targetType: self
areaType: single
effects:
  - type: grant_permanent_ap
    value: 3
```

难度：低。

边界：

- 先扣除释放技能所需行动点，再获得 3 点永久行动点。
- 因为默认先扣 temporaryAP，所以该技能主要用于把临时行动点转化为永久行动点。
- 使用后移除。

---

## 6.8 C4炸弹

### 原始描述

三回合后对 3x3 范围内的所有对象造成 20 点伤害，消耗 1 行动点。

### 难度

高。

### 需要新增能力

- 选择地图格子作为目标。
- 创建延迟范围伤害事件。
- 在未来回合触发。
- 地图上显示 C4 标记。

### 规格

```yaml
id: c4_bomb
name: C4炸弹
cost: 1
targetType: cell
areaType: square
areaSize: 3
range: caster.attackRange
allowedTargetCells: enabled_cells
effects:
  - type: delayed_area_damage
    delayRounds: 3
    areaType: square
    areaSize: 3
    value: 20
    damageType: normal
    ignoreDefense: false
    canCrit: false
    hitRule: non_allied_living_units_at_trigger_time
```

### 触发时机

如果在第 R 轮释放，则在第 R+3 轮开始时爆炸。

例如：

```text
第 1 轮释放 → 第 4 轮开始时爆炸
```

### 命中规则

- 释放时选择一个中心格。
- 爆炸时检查该中心格周围 3x3 范围内的当前实体。
- 命中爆炸时仍在范围内的非盟友活体单位。
- 不命中施法者自己。
- 不命中盟友。
- 不命中藏宝点。

### 边界

- C4 标记所在格可以为空，也可以有单位。
- C4 不阻挡移动。
- C4 爆炸不触发小怪反击。
- C4 造成死亡时，击杀来源记为原始施法者。
- 如果施法者死亡，C4 仍然爆炸，但如果死亡奖励系统需要 sourceEntityId 且施法者已死亡，则不发放击杀奖励。

---

## 6.9 铁索连环

### 原始描述

选定两个目标，使其在 3 回合内收到的伤害同步，且同步伤害为真实伤害，消耗 2 行动点。

### 难度

高。

### 需要新增能力

- 选择两个目标。
- 监听 DamageEvent。
- 创建 damage sync link。
- 防止递归同步死循环。

### 规格

```yaml
id: chain_link
name: 铁索连环
cost: 2
targetType: two_entities
range: caster.attackRange
allowedTargets: any_two_living_units
effects:
  - type: link_damage_sync
    duration: 3
    syncDamageType: true
```

### 规则

选择两个不同活体单位 A 和 B。

在持续期间：

```text
A 受到直接伤害后，B 受到等量真实伤害。
B 受到直接伤害后，A 受到等量真实伤害。
```

同步伤害：

- 无视防御。
- 不暴击。
- 不触发小怪反击。
- 不再次触发铁索连环，避免无限递归。

### DamageEvent 要求

同步时生成的 DamageEvent 必须设置：

```ts
isLinkedDamage = true
```

伤害同步监听器必须跳过：

```text
isLinkedDamage = true 的伤害事件
```

### AoE 边界

如果 A 和 B 在同一个范围技能中同时受到伤害，为避免双重互相同步，建议按以下规则：

```text
同一个 batchId 内，如果链条双方都已经直接受到该 batch 的伤害，则该 batch 不再触发双方之间的同步。
```

如果实现该规则成本过高，第一版可采用更简单规则：每个 DamageEvent 独立触发同步，但必须确保不会递归。

### 持续时间

持续 3 次目标行动机会。

更简单实现可采用：

```text
在创建 link 时记录 expiresAtRound = currentRound + 3。
在第 expiresAtRound 轮开始时移除。
```

为降低实现复杂度，第一版建议使用 `expiresAtRound`。

---

## 6.10 结盟

```yaml
id: alliance
name: 结盟
cost: 2
targetType: single_entity
range: caster.attackRange
allowedTargets: non_self_living_units
effects:
  - type: create_alliance
    duration: 5
```

难度：中。

规则：

- 施法者与目标结盟 5 回合。
- 结盟具有传递性。
- 结盟后双方不能互相攻击。
- 胜负条件共享。
- 持续时间结束后解除该技能创建的临时联盟关系。

边界：

- 如果双方已经永久结盟，则释放失败或提示无需释放。
- 如果双方已有临时结盟，可以刷新持续时间为 5 回合。

---

## 6.11 肾上腺素

### 原始描述

三回合内提升基础攻击力、防御值、速度 5 点，三回合后受到 25 点伤害。

### 难度

中。

### 规格

```yaml
id: adrenaline
name: 肾上腺素
cost: 2
targetType: self
areaType: single
effects:
  - type: add_buff
    buffType: adrenaline
    duration: 3
    modifiers:
      baseAttack: 5
      baseDefense: 5
      speed: 5
    onExpire:
      type: damage
      value: 25
      damageType: true
      canCrit: false
      ignoreDefense: true
```

### 边界

- 只作用于施法者自己。
- 攻击、防御立即生效。
- 速度提升从下一轮行动队列开始生效。
- Buff 到期后对自身造成 25 点真实伤害。
- 该自伤不因为“自己免疫自己的伤害”而免疫，因为这是技能明确副作用。
- 该伤害不触发小怪反击。

---

## 6.12 铜墙铁壁

```yaml
id: iron_wall
name: 铜墙铁壁
cost: 3
targetType: single_entity
range: caster.attackRange
allowedTargets: any_living_unit
effects:
  - type: add_buff
    buffType: stat_modifier
    duration: 2
    modifiers:
      baseDefense: 10
```

难度：低-中。

边界：2 次目标行动机会后失效。

---

## 6.13 乾坤大挪移

### 原始描述

将选定两个目标的剩余血量交换，消耗 5 行动点。

### 难度

高。

### 规格

```yaml
id: hp_swap
name: 乾坤大挪移
cost: 5
targetType: two_entities
range: caster.attackRange
allowedTargets: any_two_living_units
effects:
  - type: swap_current_hp
```

### 规则

选择两个不同活体单位 A 和 B。

交换当前生命值：

```text
newA.hp = min(oldB.hp, A.maxHp)
newB.hp = min(oldA.hp, B.maxHp)
```

### 边界

- 不能选择死亡单位。
- 不能选择同一个目标两次。
- HP 交换不视为伤害或治疗。
- 不触发铁索连环。
- 不触发小怪反击。
- 不触发暴击。
- 如果因 maxHp 限制导致数值被截断，不补偿差值。

---

## 6.14 人品爆发

```yaml
id: luck_burst
name: 人品爆发
cost: 3
targetType: single_entity
range: caster.attackRange
allowedTargets: any_living_unit
effects:
  - type: set_stat_temporarily
    stat: luck
    value: 100
    duration: 2
```

难度：中。

边界：

- 持续期间有效幸运值为 100。
- 结束后恢复为基础值 + 其他仍存在的修正。
- 不应简单保存 oldLuck 再恢复，否则会覆盖期间其他技能造成的幸运变化。
- 建议采用 stat layer / modifier system 重新计算 effectiveStat。

---

## 6.15 激光

```yaml
id: laser
name: 激光
cost: 1
targetType: direction
areaType: line_4dir
range: caster.attackRange
effects:
  - type: damage
    value: 10
    damageType: normal
    ignoreDefense: false
    canCrit: true
    hitRule: non_allied_living_units_in_line
```

难度：中。

规则：

- 玩家选择上、下、左、右其中一个方向。
- 从施法者所在格出发，沿该方向检查最多 `caster.attackRange` 格。
- 命中直线上的所有非盟友活体单位。
- 不穿墙；第一版无墙，因此只受 enabled cells 限制。
- 遇到 disabled cell 后停止继续延伸。

---

## 6.16 临界爆发

### 原始描述

下一次造成的攻击伤害翻倍，消耗 5 行动点。

### 难度

高。

### 规格

```yaml
id: critical_burst
name: 临界爆发
cost: 5
targetType: self
effects:
  - type: add_buff
    buffType: next_damage_multiplier
    multiplier: 2
    consumeOnNextEligibleDamage: true
```

### Eligible Damage 定义

下一次由该角色主动造成的直接伤害翻倍。

包括：

- 普通攻击
- 直接伤害技能，例如炸弹、激光、箭雨、随机一击、重击、诅咒

不包括：

- 灼烧持续伤害
- C4 延迟爆炸
- 铁索连环同步伤害
- 肾上腺素副作用
- 咒死 instant kill

### 边界

- 如果一次技能命中多个目标，例如箭雨，则只对该技能造成的所有直接伤害统一翻倍，然后消耗 Buff。
- 如果下一次直接伤害因目标免疫或无目标而没有造成任何伤害，则不消耗 Buff。
- 伤害倍率在暴击前应用：

```text
baseDamage * 2 → 判断暴击 * 1.5 → 减防御
```

---

## 6.17 正中靶心

```yaml
id: crit_up
name: 正中靶心
cost: 1
targetType: single_entity
range: caster.attackRange
allowedTargets: any_living_unit
effects:
  - type: modify_stat
    stat: critRate
    value: 10
    duration: permanent_in_battle
    clamp: [0, 100]
```

难度：低。

说明：暴击率按百分比计算，例如 20 表示 20%。

---

## 6.18 牢狱之灾

```yaml
id: stun_prison
name: 牢狱之灾
cost: 1
targetType: single_entity
range: caster.attackRange
allowedTargets: non_allied_living_units
effects:
  - type: add_buff
    buffType: stun
    duration: 1
```

难度：中。

边界：

- 跳过目标下一次行动机会。
- 如果目标下一轮有两次行动机会，只跳过第一次。
- 眩晕不阻止受到伤害或被治疗。

---

## 6.19 灼烧

```yaml
id: burn
name: 灼烧
cost: 1
targetType: single_entity
range: caster.attackRange
allowedTargets: non_allied_living_units
effects:
  - type: add_buff
    buffType: burn
    duration: 3
    value: 6
    damageType: true
```

难度：中。

规则：

- 目标接下来 3 次行动开始时，每次受到 6 点真实伤害。
- 灼烧伤害无视防御，不暴击。
- 灼烧不触发小怪反击。
- 灼烧可以触发死亡奖励，来源为施法者。

---

## 6.20 箭雨

```yaml
id: arrow_rain
name: 箭雨
cost: 1
targetType: cell
areaType: square
areaSize: 5
range: caster.attackRange
effects:
  - type: damage
    value: 5
    damageType: normal
    ignoreDefense: false
    canCrit: true
    hitRule: non_allied_living_units_in_area
```

难度：中。

规则：

- 选择一个中心格。
- 中心格必须在施法者 attackRange 内。
- 对 5x5 范围内所有非盟友活体单位造成伤害。
- 自己免疫自己的伤害。
- 可命中小怪，并可能触发小怪反击。

---

## 6.21 身轻如燕

```yaml
id: light_body
name: 身轻如燕
cost: 1
targetType: single_entity
range: caster.attackRange
allowedTargets: any_living_unit
effects:
  - type: modify_stat
    stat: temporaryApPerTurn
    value: 1
    duration: permanent_in_battle
```

难度：低。

说明：从目标下一次行动开始，每回合获得的临时行动点 +1。

---

## 6.22 肌无力

```yaml
id: weakness
name: 肌无力
cost: 1
targetType: single_entity
range: caster.attackRange
allowedTargets: non_allied_living_units
effects:
  - type: modify_stat
    stat: baseAttack
    value: -3
    duration: permanent_in_battle
    min: 0
```

难度：低。

---

## 6.23 破甲

```yaml
id: armor_break
name: 破甲
cost: 1
targetType: single_entity
range: caster.attackRange
allowedTargets: non_allied_living_units
effects:
  - type: modify_stat
    stat: baseDefense
    value: -3
    duration: permanent_in_battle
    min: 0
```

难度：低。

---

## 6.24 霉运当头

```yaml
id: bad_luck
name: 霉运当头
cost: 1
targetType: single_entity
range: caster.attackRange
allowedTargets: non_allied_living_units
effects:
  - type: modify_stat
    stat: luck
    value: -15
    duration: permanent_in_battle
    clamp: [0, 100]
```

难度：低。

---

## 6.25 再来一次

```yaml
id: encore
name: 再来一次
cost: 2
targetType: single_entity
range: caster.attackRange
allowedTargets: any_living_unit
effects:
  - type: extra_turn_next_round
    value: 1
```

难度：中。

规则：

- 目标在下一轮行动队列中额外出现一次。
- 如果目标原本下一轮有一次行动，则变为两次。
- 多次叠加时，最多允许下一轮额外行动 1 次。

建议限制：

```text
extraTurnNextRound 最大值 = 1
```

避免无限行动。

---

## 6.26 诅咒

```yaml
id: curse
name: 诅咒
cost: 3
targetType: single_entity
range: caster.attackRange
allowedTargets: non_allied_living_units
effects:
  - type: damage
    damageType: percent_max_hp
    percent: 0.4
    ignoreDefense: true
    canCrit: false
```

难度：低-中。

规则：

```text
伤害 = ceil(目标 maxHp * 0.4)
```

边界：

- 无视防御。
- 不暴击。
- 可以击杀目标。
- 会触发死亡奖励。

---

## 6.27 重击

```yaml
id: heavy_strike
name: 重击
cost: 1
targetType: single_entity
range: caster.attackRange
allowedTargets: non_allied_living_units
effects:
  - type: damage
    value: 15
    damageType: true
    ignoreDefense: true
    canCrit: false
```

难度：低。

说明：造成 15 点无视防御伤害。

---

## 6.28 咒死

### 原始描述

若选定目标的生命值小于其最大生命值 15%，则直接死亡。

### 难度

高。

### 规格

```yaml
id: execute
name: 咒死
cost: 3
targetType: single_entity
range: caster.attackRange
allowedTargets: non_allied_living_units
effects:
  - type: conditional_execute
    condition:
      type: hp_below_percent
      percent: 0.15
      strict: true
    then:
      type: instant_kill
```

### 规则

判定条件：

```text
target.currentHp < target.maxHp * 0.15
```

注意是“小于”，不是“小于等于”。

### 边界

- 直接死亡不视为伤害。
- 不触发铁索连环。
- 不触发小怪反击。
- 会触发死亡奖励，击杀者为施法者。
- 如果条件不满足，技能仍然消耗行动点并使用掉。

---

## 6.29 沉默

```yaml
id: silence
name: 沉默
cost: 2
targetType: single_entity
range: caster.attackRange
allowedTargets: non_allied_living_units
effects:
  - type: add_buff
    buffType: silence
    duration: 3
```

难度：中。

规则：

- 目标接下来 3 次行动机会内不能使用技能。
- 目标仍然可以移动、普通攻击、挖宝、结束行动。
- 如果目标已有沉默，则刷新持续时间为 3。

实现要求：

在 useSkill 前增加校验：

```text
如果 actor 有 silence Buff，则拒绝释放技能。
```

---

## 6.30 禁走

```yaml
id: root
name: 禁走
cost: 2
targetType: single_entity
range: caster.attackRange
allowedTargets: non_allied_living_units
effects:
  - type: add_buff
    buffType: root
    duration: 3
```

难度：中。

规则：

- 目标接下来 3 次行动机会内不能移动。
- 目标仍可以普通攻击、释放技能、挖宝、结束行动。

实现要求：

在 moveEntity 前增加校验：

```text
如果 actor 有 root Buff，则拒绝移动。
```

---

## 6.31 随机一击

```yaml
id: random_hit
name: 随机一击
cost: 1
targetType: single_entity
range: caster.attackRange
allowedTargets: non_allied_living_units
effects:
  - type: damage
    formula: 5 * randomInt(1, 6)
    damageType: normal
    ignoreDefense: false
    canCrit: true
```

难度：低-中。

规则：

- 释放时随机生成整数 n，范围为 1 到 6。
- 造成 `5 * n` 点普通伤害。
- n 应记录进战斗日志。

---

# 7. 建议数据库 / JSON 注册结构

建议将这批技能放入：

```text
backend/seed/skills_v1.json
```

每个技能保存为 SkillTemplate。

示例：

```json
{
  "id": "bomb",
  "name": "炸弹",
  "description": "对单个非盟友目标造成15点普通伤害。",
  "skillKind": "configurable",
  "enabled": true,
  "usableAs": ["common", "reward"],
  "cost": 1,
  "rangeMode": "caster_attack_range",
  "targetType": "single_entity",
  "areaType": "single",
  "targetRule": "non_allied_living_units",
  "effects": [
    {
      "type": "damage",
      "value": 15,
      "damageType": "normal",
      "ignoreDefense": false,
      "canCrit": true
    }
  ]
}
```

---

# 8. 推荐实现阶段

## 阶段 1：基础技能

先实现：

- 炸弹
- 医疗包
- 攻击力提升
- 强身健体
- 迅捷如风
- 幸运四叶草
- 早有准备
- 正中靶心
- 身轻如燕
- 肌无力
- 破甲
- 霉运当头
- 诅咒
- 重击
- 随机一击

目标：验证技能实例、消耗行动点、使用后消失、基础 Effect 执行正常。

## 阶段 2：Buff 与行动限制技能

实现：

- 牢狱之灾
- 灼烧
- 沉默
- 禁走
- 铜墙铁壁
- 人品爆发
- 肾上腺素
- 再来一次
- 结盟

目标：验证 Buff 持续时间、回合开始触发、行动校验、额外行动、联盟关系。

## 阶段 3：范围技能

实现：

- 激光
- 箭雨

目标：验证 direction、line_4dir、square area、范围命中与盟友跳过。

## 阶段 4：复杂联动技能

实现：

- C4炸弹
- 铁索连环
- 临界爆发
- 乾坤大挪移
- 咒死

目标：验证延迟事件、伤害事件监听、下一次伤害倍率、双目标技能、条件斩杀。

---

# 9. 必须补充的测试用例

## 9.1 基础测试

- 行动点不足时不能释放技能。
- 技能释放成功后移除。
- 目标超出 attackRange 时不能释放。
- 沉默状态下不能释放技能。
- 禁走状态下不能移动。

## 9.2 伤害测试

- 普通伤害正确减防御。
- 普通伤害最低为 1。
- 真实伤害无视防御。
- 百分比伤害使用 ceil。
- 自己不会受到自己的伤害。
- 盟友不会受到伤害技能影响。

## 9.3 Buff 测试

- 眩晕跳过下一次行动。
- 灼烧在回合开始扣血 3 次。
- 沉默持续 3 次行动机会。
- 禁走持续 3 次行动机会。
- 临时属性 Buff 到期后恢复。

## 9.4 复杂技能测试

- C4 在第 R+3 轮开始爆炸。
- C4 命中爆炸时范围内的目标，而不是释放时范围内目标。
- 铁索连环同步伤害不递归。
- 临界爆发只消耗一次，并使下一次直接伤害翻倍。
- 乾坤大挪移交换 HP 并按 maxHp 截断。
- 咒死在 `< 15% maxHp` 时击杀，在 `= 15% maxHp` 时不击杀。

---

# 10. 给 Codex 的实现提示词

```text
请根据“第一版通用技能实现难度分析与 Codex 实现规格”实现 skills_v1。

要求：
1. 这 30 个技能全部是通用技能，全部一次性使用。
2. 除 self 技能外，默认施法距离使用施法者当前 attackRange。
3. 技能使用成功后移除 SkillInstance；目标非法或行动点不足时不消耗技能。
4. 普通伤害按 max(1, damage - defense) 计算，可暴击；真实伤害和百分比伤害不暴击、不减防。
5. 伤害类技能不能伤害自己，也不能伤害盟友。
6. Buff 持续 N 回合表示目标的 N 次行动机会。
7. 沉默禁止释放技能，但不禁止移动、普攻、挖宝。
8. 禁走禁止移动，但不禁止普攻、技能、挖宝。
9. C4 炸弹在释放后第 3 轮开始时爆炸，命中当时 3x3 范围内的非盟友活体单位。
10. 铁索连环需要通过 DamageEvent 实现伤害同步，并防止递归同步。
11. 临界爆发只增强下一次由施法者主动造成的直接伤害，不增强灼烧、C4、同步伤害、副作用伤害。
12. 乾坤大挪移交换两个目标当前 HP，不视为伤害或治疗。
13. 咒死在目标 currentHp < maxHp * 0.15 时直接击杀，不视为伤害。
14. 请优先实现基础技能和测试，再实现复杂联动技能。
15. 不要把每个技能写成大量 if-else。尽量通过 SkillTemplate + Effect Engine + Buff System 实现。
```

---

## 11. 结语

这批技能作为第一版已经比较丰富，足够体现游戏核心特色。

实现难点不在基础数值，而在以下 5 个系统能力：

1. 持续 Buff 与回合计数。
2. 范围目标选择。
3. DamageEvent 事件化伤害结算。
4. 一次性技能实例管理。
5. 复杂联动技能的边界控制。

建议 Codex 先建立测试，再逐批实现技能。不要一次性把 30 个技能全部硬编码进去，否则后续自定义技能系统会很难维护。

