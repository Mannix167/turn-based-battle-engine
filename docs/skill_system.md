# Skill System

The skill system is intentionally data-driven:

- `SkillTemplate` describes cost, range, target rules, area rules, and a list of effects.
- `SkillInstance` is what an entity actually owns. It is removed after use.
- `EffectEngine` dispatches effect types through handlers instead of hard-coding one branch per skill.
- Targeting lives in `backend/app/game/skills/targeting.py`.

Current MVP template:

- `bomb`: common single-target skill, cost 1, range 3, deals 10 fixed damage, then the instance is consumed.

Implemented effect handlers include damage, heal, buff add/remove, stat modification, AP changes, extra next-round turns, alliance changes, delayed damage, skill grants, and summon. The public template list still intentionally exposes only `bomb` until skills are added in a later content pass.

Additional skills should be added as templates composed from effect types. New mechanics should add a new effect handler plus focused tests.
