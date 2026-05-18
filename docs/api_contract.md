# API Contract v2 Draft

All gameplay rules are enforced by `backend/app/game`. API routes validate input and call game-core; frontend code must treat API state as authoritative.

## Characters

- `GET /api/characters`
- `GET /api/characters/{id}`
- `POST /api/characters`
- `PUT /api/characters/{id}`
- `DELETE /api/characters/{id}`

## Uploads

- `POST /api/uploads/portrait?filename=name.png`
- `POST /api/uploads/token?filename=name.png`

The first implementation accepts raw request bytes and returns a local URL. Multipart UI can be added later without changing game-core.

## Skills

- `GET /api/skills/templates`
- `GET /api/skills/templates/common`
- `GET /api/skills/templates/character`

Skill effects are templates only until phase 4.

## Maps

- `GET /api/maps`
- `GET /api/maps/{id}`
- `POST /api/maps`
- `PUT /api/maps/{id}`

If `validCells` is empty, the whole rectangle is playable.

## Game

- `POST /api/game/create`
- `POST /api/game/start`
- `GET /api/game/{gameId}`
- `POST /api/game/{gameId}/move`
- `POST /api/game/{gameId}/basic-attack`
- `POST /api/game/{gameId}/use-skill`
- `POST /api/game/{gameId}/dig-treasure`
- `POST /api/game/{gameId}/end-action`
- `POST /api/game/{gameId}/choose-kill-reward`

`use-skill`, `dig-treasure`, and `choose-kill-reward` are implemented through game-core.

Current MVP skill template:

- `bomb`: common single-target skill, one use per `SkillInstance`, costs 1 AP, range 3, deals 10 fixed damage.

Current phase 8 effect support includes `summon`; no public summon template is exposed yet, so future skill additions should add a template composed from that effect.
