# 回合制战棋游戏 v2

本项目是一个本地优先的回合制网格战棋沙盒。当前重点是稳定 `game-core`、数据结构、API 合同、技能系统、地图/角色/技能编辑器，以及可迭代的前端战斗界面。

## 快速启动

后端：

```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

前端：

```bash
cd frontend
npm install
npm run dev
```

常用验证：

```bash
cd backend
python -m pytest
```

```bash
cd frontend
npm run build
```

也可以直接运行仓库根目录的 `start.bat` / `stop.bat`。

## 当前状态

- 后端：FastAPI + SQLAlchemy + SQLite。
- 前端：React + Vite + TypeScript。
- 数据库：`backend/data/game.db`。
- 上传目录：`backend/uploads`，通过 `/uploads/...` 静态访问。
- 技能图标：后端动态 SVG 图片接口 `/api/skills/icons/{skill_id}.svg`，技能模板的 `iconUrl` 应指向图片 URL。

## 项目结构

```text
backend/
  app/
    api/              FastAPI 路由层
    db/               SQLAlchemy 模型、数据库连接、seed、轻量迁移
    game/             game-core，所有战斗规则应在这里
    schemas/          API 请求/响应合同
    tests/            API 合同测试
frontend/
  src/
    api/              前端 API client
    components/       棋盘、技能卡、角色面板等组件
    pages/            首页、设置、战斗、编辑器页面
    types/            前端类型，需与后端 schema 对齐
docs/                 设计文档和阶段计划
```

## 后端定位指南

核心规则都在 `backend/app/game`，前端不要自行判定命中、伤害、胜负。

- 地图与格子：`backend/app/game/map_system.py`
- 行动点：`backend/app/game/action_points.py`
- 回合队列：`backend/app/game/turn_queue.py`
- 普攻与技能入口：`backend/app/game/engine.py`
- 伤害计算：`backend/app/game/damage.py`
- 技能模板结构：`backend/app/game/skills/skill_template.py`
- 技能目标校验：`backend/app/game/skills/targeting.py`
- 技能效果执行：`backend/app/game/skills/effect_engine.py`
- 状态效果触发：`backend/app/game/status/status_engine.py`
- 内置地图/技能种子：`backend/app/game/fixtures.py`
- 击杀奖励：`backend/app/game/reward.py`
- 结盟与胜负：`backend/app/game/alliance.py`、`backend/app/game/victory.py`

API 路由：

- 角色：`backend/app/api/routes_characters.py`
- 地图：`backend/app/api/routes_maps.py`
- 技能：`backend/app/api/routes_skills.py`
- 游戏：`backend/app/api/routes_game.py`
- 上传：`backend/app/api/routes_uploads.py`

Schema 合同：

- 游戏状态和操作：`backend/app/schemas/game.py`
- 技能模板：`backend/app/schemas/skill.py`
- 地图模板：`backend/app/schemas/map.py`
- 角色模板：`backend/app/schemas/character.py`

## 前端定位指南

页面：

- 首页：`frontend/src/pages/HomePage.tsx`
- 游戏设置：`frontend/src/pages/SetupPage.tsx`
- 战斗页：`frontend/src/pages/BattlePage.tsx`
- 角色编辑器：`frontend/src/pages/CharacterEditorPage.tsx`
- 地图编辑器：`frontend/src/pages/MapEditorPage.tsx`
- 技能管理器：`frontend/src/pages/SkillEditorPage.tsx`

关键组件：

- 棋盘：`frontend/src/components/GridBoard.tsx`
- 单位面板：`frontend/src/components/EntityPanel.tsx`
- 技能卡：`frontend/src/components/SkillCard.tsx`
- 击杀奖励弹窗：`frontend/src/components/KillRewardModal.tsx`
- 角色表单：`frontend/src/components/CharacterForm.tsx`

API client：

- `frontend/src/api/game.ts`
- `frontend/src/api/skills.ts`
- `frontend/src/api/maps.ts`
- `frontend/src/api/characters.ts`

类型：

- `frontend/src/types/game.ts`
- `frontend/src/types/skill.ts`
- `frontend/src/types/map.ts`
- `frontend/src/types/character.ts`

## 技能系统说明

技能模板字段见：

- 后端：`backend/app/schemas/skill.py`
- 前端：`frontend/src/types/skill.ts`

重要字段：

- `iconUrl`：技能图标图片 URL，必须是可被 `<img>` 使用的图片地址。
- `skillKind`：`built_in` 或 `configurable`。
- `enabled`：禁用技能不会出现在开局可选和奖励池，但技能管理器可通过 include disabled 查看。
- `usableAs`：`character`、`common`、`reward`、`summon`。
- `targetType`：`self`、`single`、`twoEntities`、`emptyCell`、`direction`。
- `areaType`：`single`、`line`、`cross`、`square`、`circle`、`none`。
- `areaSize`：范围技能尺寸。
- `affectSelfDamage`：控制来源与目标相同时，伤害是否生效。
- `canTargetMonster`、`canTargetSummon`、`canTargetTreasure`：细分目标类型开关。

新增内置技能时，优先改：

1. `backend/app/game/fixtures.py` 注册 `SkillTemplate`。
2. 如需新效果，扩展 `EffectType`：
   - `backend/app/game/skills/skill_template.py`
   - `backend/app/schemas/skill.py`
   - `frontend/src/types/skill.ts`
3. 在 `backend/app/game/skills/effect_engine.py` 添加效果 handler。
4. 如果需要新目标类型或范围逻辑，改 `targeting.py` 和 `BattlePage.tsx`。
5. 增加后端测试。

当前第一版通用技能已在 `backend/app/game/fixtures.py` 注册。高复杂技能已有可运行模板和基础行为，后续如果要做严格 DamageEvent、完整 C4 标记、伤害同步递归控制等，应继续扩展 `game-core`，不要放到前端。

## 双目标技能

例如“乾坤大挪移”的 `targetType` 是 `twoEntities`。

后端请求字段：

```json
{
  "casterId": "char_a",
  "skillInstanceId": "xxx",
  "targetEntityId": "target_1",
  "secondTargetEntityId": "target_2"
}
```

前端逻辑在 `frontend/src/pages/BattlePage.tsx`：

- 第一次点击目标时保存为 `pendingFirstTargetId`。
- 第二次点击不同目标时提交 `targetEntityId + secondTargetEntityId`。
- 同一目标点击两次会提示错误，不会请求后端。

## 行动点规则

行动点逻辑在 `backend/app/game/action_points.py`。

`consume_ap(entity, cost)` 规则：

- 先消耗 `temporaryAP`。
- 临时行动点不足时，再消耗 `permanentAP`。
- 总行动点不足时抛出 `ActionPointError`。

已覆盖测试：4 点临时 AP + 1 点永久 AP 可以成功释放 5 费技能，并扣到 0/0。

## 地图系统

地图 API 在 `backend/app/api/routes_maps.py`。

支持：

- `GET /api/maps`
- `GET /api/maps/{map_id}`
- `POST /api/maps`
- `PUT /api/maps/{map_id}`
- `DELETE /api/maps/{map_id}`
- `POST /api/maps/{map_id}/duplicate`
- `POST /api/maps/{map_id}/validate`
- `POST /api/maps/validate`，用于未保存草稿校验
- `POST /api/maps/preview-random-generation`

地图编辑器在 `frontend/src/pages/MapEditorPage.tsx`。

## 技能 API

技能 API 在 `backend/app/api/routes_skills.py`。

常用接口：

- `GET /api/skills/templates`：只返回启用技能。
- `GET /api/skills/templates?include_disabled=true`：包含禁用技能。
- `GET /api/skills/templates/all`：包含禁用技能。
- `GET /api/skills/templates/common`：开局通用技能。
- `GET /api/skills/templates/character`：角色专属技能。
- `POST /api/skills/templates`
- `PUT /api/skills/templates/{skill_id}`
- `DELETE /api/skills/templates/{skill_id}`
- `POST /api/skills/templates/{skill_id}/duplicate`
- `GET /api/skills/icons/{skill_id}.svg`

技能管理器应使用 include disabled 接口，否则看不到禁用技能，无法重新启用。

## 数据库与迁移

项目当前使用轻量迁移：

- 模型：`backend/app/db/models.py`
- 迁移：`backend/app/db/migrations.py`
- Seed：`backend/app/db/seed.py`

`Base.metadata.create_all()` 不会给已有 SQLite 表自动补列，所以新增 DB 列时要在 `migrations.py` 里补 `ALTER TABLE`。

## 测试建议

后端改动至少运行：

```bash
cd backend
python -m pytest
```

前端改动至少运行：

```bash
cd frontend
npm run build
```

新增规则建议补测试：

- `backend/app/game/tests/`：纯 game-core 规则。
- `backend/app/tests/test_api_contract.py`：API 合同和端到端请求。

## 常见坑

- 前端只做交互和展示，不要在前端决定技能是否合法、是否命中、伤害多少。
- 新技能如果需要新字段，要同步后端 schema、前端 type、DB 持久化和测试。
- 内置技能 `skillKind=built_in`，技能管理器不可直接编辑，应该复制后生成自定义技能。
- 禁用技能不会出现在开局选择中，但必须能在技能管理器里看到。
- 技能图标要用图片 URL，不要只放 emoji 或文字。
- 修改后端接口后要重启后端服务；Vite 热更新只覆盖前端。
