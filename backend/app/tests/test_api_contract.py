from fastapi.testclient import TestClient
from uuid import uuid4

from app.main import app


client = TestClient(app)


def test_seed_contract_endpoints_are_available() -> None:
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/api/characters").status_code == 200
    assert client.get("/api/character-templates").status_code == 200
    assert client.get("/api/skills/templates").status_code == 200
    assert client.get("/api/skills/templates/common").status_code == 200
    assert client.get("/api/maps").status_code == 200
    assert client.get("/api/creature-templates").status_code == 200


def test_skill_template_query_supports_usable_as_filter() -> None:
    common = client.get("/api/skills/templates", params={"usable_as": "common"})
    assert common.status_code == 200
    assert common.json()
    assert all("common" in skill["usableAs"] for skill in common.json())


def test_game_create_move_attack_and_end_action() -> None:
    created = client.post("/api/game/create", json={"mapId": "map_default"})
    assert created.status_code == 201
    state = created.json()
    game_id = state["gameId"]
    assert state["currentEntityId"] == "p1"
    assert state["entities"][0]["temporaryAP"] == 2

    attack = client.post(
        f"/api/game/{game_id}/basic-attack",
        json={"attackerId": "p1", "targetId": "p2"},
    )
    assert attack.status_code == 200
    attacked_state = attack.json()
    p2 = next(entity for entity in attacked_state["entities"] if entity["id"] == "p2")
    assert p2["currentHp"] < p2["maxHp"]

    ended = client.post(f"/api/game/{game_id}/end-action", json={"entityId": "p1"})
    assert ended.status_code == 200
    assert ended.json()["currentEntityId"] == "p2"


def test_game_use_bomb_skill_through_api() -> None:
    created = client.post("/api/game/create", json={"mapId": "map_default"})
    assert created.status_code == 201
    state = created.json()
    game_id = state["gameId"]
    p1 = next(entity for entity in state["entities"] if entity["id"] == "p1")

    used = client.post(
        f"/api/game/{game_id}/use-skill",
        json={
            "casterId": "p1",
            "skillInstanceId": p1["skillInstances"][0]["instanceId"],
            "targetEntityId": "p2",
        },
    )

    assert used.status_code == 200
    next_state = used.json()
    p2 = next(entity for entity in next_state["entities"] if entity["id"] == "p2")
    p1_after = next(entity for entity in next_state["entities"] if entity["id"] == "p1")
    assert p2["currentHp"] == 90
    assert p1_after["skillInstances"] == []


def test_start_game_uses_character_data_and_selected_common_skills() -> None:
    started = client.post(
        "/api/game/start",
        json={
            "mapId": "map_default",
            "entityIds": ["char_knight", "char_ranger"],
            "positions": {
                "char_knight": {"x": 0, "y": 0},
                "char_ranger": {"x": 1, "y": 0},
            },
            "selectedSkillTemplateIds": {"char_ranger": ["bomb"]},
        },
    )

    assert started.status_code == 201
    state = started.json()
    assert state["mapId"] == "map_default"
    assert state["map"]["width"] == 8
    assert len(state["map"]["cells"]) == 64
    assert all("terrainType" in cell for cell in state["map"]["cells"])
    ranger = next(entity for entity in state["entities"] if entity["id"] == "char_ranger")
    assert ranger["maxHp"] == 90
    assert [skill["templateId"] for skill in ranger["skillInstances"]] == ["bomb"]


def test_start_game_with_random_content_serializes_preview_positions() -> None:
    payload = {
        "mapTemplateId": "map_default",
        "selectedCharacterIds": ["char_knight"],
        "positions": {
            "char_knight": {"x": 0, "y": 0},
        },
        "selectedCommonSkillIdsByCharacterId": {},
        "randomMonsterCount": 2,
        "randomTreasureCount": 1,
        "monsterTemplatePoolIds": [],
        "rewardSkillPoolTemplateIds": [],
        "startSeed": "contract_random_start",
    }

    preview = client.post("/api/game/preview-start", json=payload)
    assert preview.status_code == 200
    preview_state = preview.json()
    assert len(preview_state["previewMonsters"]) == 2
    assert len(preview_state["previewTreasures"]) == 1
    assert set(preview_state["previewMonsters"][0]["position"]) == {"x", "y"}

    started = client.post("/api/game/start", json=payload)
    assert started.status_code == 201
    state = started.json()
    assert sum(1 for entity in state["entities"] if entity["type"] == "monster") == 2
    assert len(state["treasures"]) == 1


def test_action_preview_returns_backend_computed_attack_preview() -> None:
    started = client.post(
        "/api/game/start",
        json={
            "mapId": "map_default",
            "entityIds": ["char_knight", "char_ranger"],
            "positions": {
                "char_knight": {"x": 0, "y": 0},
                "char_ranger": {"x": 1, "y": 0},
            },
            "selectedSkillTemplateIds": {},
        },
    )
    assert started.status_code == 201
    state = started.json()
    actor_id = state["currentEntityId"]
    target_id = "char_ranger" if actor_id == "char_knight" else "char_knight"

    preview = client.post(
        "/api/game/action-preview",
        json={
            "gameId": state["gameId"],
            "actorId": actor_id,
            "actionType": "attack",
            "targetEntityId": target_id,
        },
    )

    assert preview.status_code == 200
    data = preview.json()
    assert data["valid"] is True
    assert data["apCost"]["total"] == 1
    assert data["damagePreviews"][0]["targetEntityId"] == target_id
    assert data["damagePreviews"][0]["finalDamage"] > 0


def test_start_game_rejects_duplicate_deployment_cell() -> None:
    response = client.post(
        "/api/game/start",
        json={
            "mapId": "map_default",
            "entityIds": ["char_knight", "char_ranger"],
            "positions": {
                "char_knight": {"x": 0, "y": 0},
                "char_ranger": {"x": 0, "y": 0},
            },
        },
    )

    assert response.status_code == 400


def test_custom_skill_template_supports_icon_and_usage_filters() -> None:
    skill_id = f"skill_contract_{uuid4().hex[:8]}"
    payload = {
        "id": skill_id,
        "name": "Icon Burst",
        "description": "Contract test configurable skill.",
        "iconUrl": "✨",
        "skillKind": "configurable",
        "enabled": True,
        "usableAs": ["character"],
        "category": "character",
        "cost": 1,
        "range": 1,
        "targetType": "single",
        "areaType": "single",
        "areaSize": 1,
        "affectSelfDamage": False,
        "canTargetSelf": False,
        "canTargetAlly": False,
        "canTargetEnemy": True,
        "canTargetEmptyCell": False,
        "canTargetMonster": True,
        "canTargetSummon": True,
        "canTargetTreasure": False,
        "canTargetTerrain": True,
        "visual": {"visualKey": "blast", "soundKey": "skill_blast"},
        "effects": [{"type": "damage", "value": 7, "metadata": {}}],
    }

    created = client.post("/api/skills/templates", json=payload)
    assert created.status_code == 201
    skill = created.json()
    assert skill["iconUrl"] == "✨"
    assert skill["skillKind"] == "configurable"
    assert skill["usableAs"] == ["character"]
    assert skill["areaSize"] == 1
    assert skill["canTargetMonster"] is True
    assert skill["canTargetTerrain"] is True
    assert skill["visual"]["soundKey"] == "skill_blast"

    character_templates = client.get("/api/skills/templates/character").json()
    common_templates = client.get("/api/skills/templates/common").json()
    assert any(skill["id"] == skill_id for skill in character_templates)
    assert not any(skill["id"] == skill_id for skill in common_templates)


def test_skill_templates_can_include_disabled_and_extended_fields() -> None:
    skill_id = f"skill_disabled_{uuid4().hex[:8]}"
    payload = {
        "id": skill_id,
        "name": "Disabled Square Buff",
        "description": "Contract test disabled skill with extended fields.",
        "iconUrl": "⬛",
        "skillKind": "configurable",
        "enabled": False,
        "usableAs": ["common"],
        "category": "common",
        "cost": 2,
        "range": 4,
        "targetType": "single",
        "areaType": "circle",
        "areaSize": 2,
        "affectSelfDamage": True,
        "canTargetSelf": True,
        "canTargetAlly": True,
        "canTargetEnemy": False,
        "canTargetEmptyCell": False,
        "canTargetMonster": False,
        "canTargetSummon": False,
        "canTargetTreasure": True,
        "effects": [
            {
                "type": "add_buff",
                "value": 3,
                "duration": 2,
                "delayTurns": 1,
                "buffType": "shield",
                "metadata": {},
            }
        ],
    }

    created = client.post("/api/skills/templates", json=payload)
    assert created.status_code == 201
    skill = created.json()
    assert skill["enabled"] is False
    assert skill["areaType"] == "circle"
    assert skill["areaSize"] == 2
    assert skill["affectSelfDamage"] is True
    assert skill["canTargetTreasure"] is True
    assert skill["effects"][0]["duration"] == 2
    assert skill["effects"][0]["delayTurns"] == 1
    assert skill["effects"][0]["buffType"] == "shield"

    enabled_only = client.get("/api/skills/templates").json()
    with_disabled_query = client.get("/api/skills/templates?include_disabled=true").json()
    with_disabled_path = client.get("/api/skills/templates/all").json()
    assert not any(skill["id"] == skill_id for skill in enabled_only)
    assert any(skill["id"] == skill_id for skill in with_disabled_query)
    assert any(skill["id"] == skill_id for skill in with_disabled_path)


def test_character_skill_validation_requires_character_usable_skill() -> None:
    valid_id = f"char_contract_{uuid4().hex[:8]}"
    valid_payload = {
        "id": valid_id,
        "name": "Skill Owner",
        "maxHp": 80,
        "baseAttack": 12,
        "baseDefense": 3,
        "attackRange": 1,
        "tempApPerTurn": 2,
        "speed": 9,
        "critRate": 5,
        "luck": 10,
        "defaultSkillTemplateIds": ["hero_strike"],
    }
    valid = client.post("/api/characters", json=valid_payload)
    assert valid.status_code == 201
    assert valid.json()["defaultSkillTemplateIds"] == ["hero_strike"]

    invalid_payload = {**valid_payload, "id": f"char_contract_{uuid4().hex[:8]}", "defaultSkillTemplateIds": ["bomb"]}
    invalid = client.post("/api/characters", json=invalid_payload)
    assert invalid.status_code == 400


def test_custom_map_can_validate_and_start_game_with_fixed_entities() -> None:
    map_id = f"map_contract_{uuid4().hex[:8]}"
    treasure_id = f"treasure_contract_{uuid4().hex[:8]}"
    monster_id = f"monster_contract_{uuid4().hex[:8]}"
    map_payload = {
        "id": map_id,
        "name": "Contract Fixed Map",
        "description": "Small map with fixed content.",
        "width": 3,
        "height": 2,
        "cells": [
            {"x": x, "y": y, "enabled": True, "terrainType": "normal", "tileImageUrl": None}
            for y in range(2)
            for x in range(3)
        ],
        "spawnZones": [
            {
                "id": "spawn_a",
                "name": "Spawn",
                "type": "player",
                "cells": [{"x": 0, "y": 0}, {"x": 1, "y": 0}],
            }
        ],
        "fixedEntities": [
            {"id": treasure_id, "type": "treasure", "templateId": "Gold", "x": 2, "y": 1},
            {"id": monster_id, "type": "monster", "templateId": "Slime", "x": 2, "y": 0},
        ],
        "randomRules": [],
        "backgroundImageUrl": None,
    }

    created = client.post("/api/maps", json=map_payload)
    assert created.status_code == 201

    validation = client.post(f"/api/maps/{map_id}/validate")
    assert validation.status_code == 200
    assert validation.json()["isValid"] is True

    draft_validation = client.post("/api/maps/validate", json={**map_payload, "id": "draft_map"})
    assert draft_validation.status_code == 200
    assert draft_validation.json()["isValid"] is True

    started = client.post(
        "/api/game/start",
        json={
            "mapId": map_id,
            "entityIds": ["char_knight", "char_ranger"],
            "positions": {
                "char_knight": {"x": 0, "y": 0},
                "char_ranger": {"x": 1, "y": 0},
            },
            "selectedSkillTemplateIds": {},
        },
    )
    assert started.status_code == 201
    state = started.json()
    assert any(entity["id"] == monster_id for entity in state["entities"])
    assert any(treasure["id"] == treasure_id for treasure in state["treasures"])


def test_map_allows_treasure_overlap_but_rejects_monster_deployment_overlap() -> None:
    map_id = f"map_contract_{uuid4().hex[:8]}"
    map_payload = {
        "id": map_id,
        "name": "Contract Fixed Map",
        "description": "Treasure can overlap, monster blocks deployment.",
        "width": 2,
        "height": 1,
        "cells": [
            {"x": 0, "y": 0, "enabled": True, "terrainType": "normal", "tileImageUrl": None},
            {"x": 1, "y": 0, "enabled": True, "terrainType": "normal", "tileImageUrl": None},
        ],
        "spawnZones": [],
        "fixedEntities": [
            {"id": f"treasure_contract_{uuid4().hex[:8]}", "type": "treasure", "templateId": "Gold", "x": 0, "y": 0},
            {"id": f"monster_contract_{uuid4().hex[:8]}", "type": "monster", "templateId": "Slime", "x": 1, "y": 0},
        ],
        "randomRules": [],
        "backgroundImageUrl": None,
    }

    created = client.post("/api/maps", json=map_payload)
    assert created.status_code == 201

    treasure_overlap_start = client.post(
        "/api/game/start",
        json={
            "mapId": map_id,
            "entityIds": ["char_knight"],
            "positions": {
                "char_knight": {"x": 0, "y": 0},
            },
            "selectedSkillTemplateIds": {},
        },
    )
    assert treasure_overlap_start.status_code == 201

    monster_overlap_start = client.post(
        "/api/game/start",
        json={
            "mapId": map_id,
            "entityIds": ["char_knight"],
            "positions": {
                "char_knight": {"x": 1, "y": 0},
            },
            "selectedSkillTemplateIds": {},
        },
    )
    assert monster_overlap_start.status_code == 400

    monster_overlap_validation = client.post(
        "/api/maps/validate",
        json={
            **map_payload,
            "id": "draft_map",
            "fixedEntities": [
                {"id": "monster_a", "type": "monster", "templateId": "Slime", "x": 1, "y": 0},
                {"id": "monster_b", "type": "monster", "templateId": "Slime", "x": 1, "y": 0},
            ],
        },
    )
    assert monster_overlap_validation.status_code == 200
    assert monster_overlap_validation.json()["isValid"] is False


def test_phase_one_skill_points_stack_and_filters_contract() -> None:
    skill_id = f"skill_contract_{uuid4().hex[:8]}"
    payload = {
        "id": skill_id,
        "name": "Epic Contract Flame",
        "description": "Searchable phase one damage skill.",
        "iconUrl": None,
        "skillKind": "configurable",
        "enabled": True,
        "usableAs": ["common", "reward"],
        "rarity": "epic",
        "skillPointCost": 4,
        "categories": ["damage"],
        "editable": True,
        "isSystemSkill": False,
        "version": 1,
        "category": "common",
        "cost": 1,
        "range": 3,
        "targetType": "single",
        "areaType": "single",
        "areaSize": 1,
        "affectSelfDamage": False,
        "canTargetSelf": False,
        "canTargetAlly": False,
        "canTargetEnemy": True,
        "canTargetEmptyCell": False,
        "canTargetMonster": True,
        "canTargetSummon": True,
        "canTargetTreasure": False,
        "canTargetTerrain": False,
        "visual": {},
        "effects": [{"type": "damage", "value": 9, "metadata": {}}],
    }
    created = client.post("/api/skills/templates", json=payload)
    assert created.status_code == 201
    assert created.json()["rarity"] == "epic"
    assert created.json()["skillPointCost"] == 4

    filtered = client.get("/api/skills/templates", params={"keyword": "flame", "rarity": "epic", "category": "damage"}).json()
    assert any(skill["id"] == skill_id for skill in filtered)

    rejected = client.post(
        "/api/game/start",
        json={
            "mapId": "map_default",
            "entityIds": ["char_knight"],
            "positions": {"char_knight": {"x": 0, "y": 0}},
            "selectedSkillTemplateIds": {"char_knight": [skill_id]},
        },
    )
    assert rejected.status_code == 400
    assert rejected.json()["detail"]["error"] == "SKILL_POINT_CAPACITY_EXCEEDED"

    accepted = client.post(
        "/api/game/start",
        json={
            "mapId": "map_default",
            "entityIds": ["char_knight"],
            "positions": {"char_knight": {"x": 0, "y": 0}},
            "selectedSkillTemplateIds": {"char_knight": ["bomb", "bomb", "bomb"]},
        },
    )
    assert accepted.status_code == 201
    knight = next(entity for entity in accepted.json()["entities"] if entity["id"] == "char_knight")
    assert len(knight["skillInstances"]) == 1
    assert knight["skillInstances"][0]["templateId"] == "bomb"
    assert knight["skillInstances"][0]["quantity"] == 3


def test_system_skill_can_be_edited_directly() -> None:
    original = next(skill for skill in client.get("/api/skills/templates", params={"include_disabled": True}).json() if skill["id"] == "bomb")
    payload = {
        **original,
        "name": "炸弹-合同测试",
        "rarity": "rare",
        "skillPointCost": 2,
        "categories": ["damage", "special"],
    }

    try:
        updated = client.put("/api/skills/templates/bomb", json=payload)
        assert updated.status_code == 200
        data = updated.json()
        assert data["id"] == "bomb"
        assert data["skillKind"] == "built_in"
        assert data["isSystemSkill"] is True
        assert data["editable"] is True
        assert data["rarity"] == "rare"
        assert "special" in data["categories"]
    finally:
        client.put("/api/skills/templates/bomb", json=original)


def test_creature_template_fields_and_summon_effect_contract() -> None:
    creature_id = f"monster_contract_{uuid4().hex[:8]}"
    creature_payload = {
        "id": creature_id,
        "name": "Summonable Sprite",
        "description": "Creature contract",
        "maxHp": 22,
        "baseAttack": 6,
        "baseDefense": 1,
        "attackRange": 1,
        "speed": 7,
        "critRate": 0,
        "luck": 0,
        "tempApPerTurn": 2,
        "rarity": "rare",
        "tokenImageUrl": None,
        "portraitImageUrl": None,
        "enabled": True,
        "canSpawnAsMonster": False,
        "canBeSummoned": True,
        "summonSkillTemplateIds": ["bomb"],
    }
    created_creature = client.post("/api/monster-templates", json=creature_payload)
    assert created_creature.status_code == 201
    creature = created_creature.json()
    assert creature["canSpawnAsMonster"] is False
    assert creature["canBeSummoned"] is True
    assert creature["summonSkillTemplateIds"] == ["bomb"]

    preview = client.post(
        "/api/game/preview-start",
        json={
            "mapId": "map_default",
            "entityIds": ["char_knight"],
            "positions": {"char_knight": {"x": 0, "y": 0}},
            "randomMonsterCount": 1,
            "monsterTemplatePoolIds": [creature_id],
        },
    )
    assert preview.status_code == 400

    skill_id = f"skill_contract_{uuid4().hex[:8]}"
    summon_skill = {
        "id": skill_id,
        "name": "Summon Sprite",
        "description": "Summons a creature template.",
        "iconUrl": None,
        "skillKind": "configurable",
        "enabled": True,
        "usableAs": ["common"],
        "rarity": "rare",
        "skillPointCost": 2,
        "categories": ["summon"],
        "editable": True,
        "isSystemSkill": False,
        "version": 1,
        "category": "common",
        "cost": 1,
        "range": 3,
        "targetType": "emptyCell",
        "areaType": "single",
        "areaSize": 1,
        "affectSelfDamage": False,
        "canTargetSelf": False,
        "canTargetAlly": False,
        "canTargetEnemy": False,
        "canTargetEmptyCell": True,
        "canTargetMonster": False,
        "canTargetSummon": False,
        "canTargetTreasure": False,
        "canTargetTerrain": False,
        "visual": {},
        "effects": [{"type": "summon", "metadata": {"creatureTemplateId": creature_id}}],
    }
    created_skill = client.post("/api/skills/templates", json=summon_skill)
    assert created_skill.status_code == 201

    started = client.post(
        "/api/game/start",
        json={
            "mapId": "map_default",
            "entityIds": ["char_knight", "char_ranger"],
            "positions": {
                "char_knight": {"x": 0, "y": 0},
                "char_ranger": {"x": 1, "y": 0},
            },
            "selectedSkillTemplateIds": {"char_ranger": [skill_id]},
        },
    )
    assert started.status_code == 201
    state = started.json()
    ranger = next(entity for entity in state["entities"] if entity["id"] == "char_ranger")
    stack = next(skill for skill in ranger["skillInstances"] if skill["templateId"] == skill_id)
    used = client.post(
        f"/api/game/{state['gameId']}/use-skill",
        json={"casterId": "char_ranger", "skillInstanceId": stack["instanceId"], "targetCell": {"x": 2, "y": 0}},
    )
    assert used.status_code == 200
    next_state = used.json()
    summon = next(entity for entity in next_state["entities"] if entity["type"] == "summon")
    assert summon["templateId"] == creature_id
    assert summon["ownerId"] == "char_ranger"
    assert summon["factionId"] == ranger["factionId"]
    assert summon["tempApPerTurn"] == 2
    assert [skill["templateId"] for skill in summon["skillInstances"]] == ["bomb"]


def test_start_game_factions_make_same_team_allies() -> None:
    started = client.post(
        "/api/game/start",
        json={
            "mapId": "map_default",
            "entityIds": ["char_knight", "char_ranger"],
            "positions": {
                "char_knight": {"x": 0, "y": 0},
                "char_ranger": {"x": 1, "y": 0},
            },
            "factions": [{"id": "blue", "name": "蓝队", "color": "#3b82f6"}],
            "characterFactionAssignments": {"char_knight": "blue", "char_ranger": "blue"},
        },
    )
    assert started.status_code == 201
    state = started.json()
    assert {entity["factionId"] for entity in state["entities"] if entity["type"] == "character"} == {"blue"}
    assert state["factions"][0]["id"] == "blue"

    attack = client.post(
        f"/api/game/{state['gameId']}/basic-attack",
        json={"attackerId": state["currentEntityId"], "targetId": "char_knight" if state["currentEntityId"] == "char_ranger" else "char_ranger"},
    )
    assert attack.status_code == 400
    assert "ally" in attack.json()["detail"]
