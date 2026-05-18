from fastapi.testclient import TestClient
from uuid import uuid4

from app.main import app


client = TestClient(app)


def test_seed_contract_endpoints_are_available() -> None:
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/api/characters").status_code == 200
    assert client.get("/api/skills/templates").status_code == 200
    assert client.get("/api/skills/templates/common").status_code == 200
    assert client.get("/api/maps").status_code == 200


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
    ranger = next(entity for entity in state["entities"] if entity["id"] == "char_ranger")
    assert ranger["maxHp"] == 90
    assert [skill["templateId"] for skill in ranger["skillInstances"]] == ["bomb"]


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
