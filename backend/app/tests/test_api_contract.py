from fastapi.testclient import TestClient

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
