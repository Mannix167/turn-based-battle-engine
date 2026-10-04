from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.routes_game import GAMES
from app.game.alliance import add_alliance
from app.game.engine import create_state
from app.game.fixtures import demo_entity
from app.game.models import GameMap, Position, StatusEffect


client = TestClient(app)


@pytest.fixture
def art_game():
    actor = demo_entity("art_a", "Actor", 1, 1, 1, speed=20)
    target = demo_entity("art_b", "Target", 2, 1, 2, speed=8)
    state = create_state(GameMap("map_default", "Art audit", 8, 8), [actor, target])
    state.gameId = f"art_{uuid4().hex}"
    GAMES[state.gameId] = state
    yield state, actor, target
    GAMES.pop(state.gameId, None)


def preview(state, actor, action, **fields):
    return client.post("/api/game/action-preview", json={"gameId": state.gameId, "actorId": actor.id, "actionType": action, **fields}).json()


def test_silenced_skill_is_displayed_as_unavailable(art_game):
    state, actor, _ = art_game
    actor.statusEffects.append(StatusEffect("silence", "silence", actor.id, actor.id, remainingTurns=2))
    result = preview(state, actor, "skill", skillInstanceId=actor.skillInstances[0].instanceId)
    assert result["valid"] is False
    assert "silenced" in result["reason"]


def test_empty_skill_stack_is_displayed_as_unavailable(art_game):
    state, actor, _ = art_game
    actor.skillInstances[0].quantity = 0
    result = preview(state, actor, "skill", skillInstanceId=actor.skillInstances[0].instanceId)
    assert result["valid"] is False
    assert "empty" in result["reason"]


def test_rooted_actor_has_no_valid_move_highlight(art_game):
    state, actor, _ = art_game
    actor.statusEffects.append(StatusEffect("root", "root", actor.id, actor.id, remainingTurns=2))
    result = preview(state, actor, "move", targetPosition={"x": 1, "y": 2})
    assert result["valid"] is False
    assert "rooted" in result["reason"]


def test_dig_preview_checks_ap_and_matches_100_luck(art_game):
    from app.game.models import TreasureEntity

    state, actor, _ = art_game
    state.treasures["t"] = TreasureEntity("t", "Treasure", 1, 2)
    actor.luck = 100
    result = preview(state, actor, "dig", targetPosition={"x": 1, "y": 2})
    assert result["digPreview"]["successRate"] == 100
    actor.permanentAP = actor.temporaryAP = 0
    assert preview(state, actor, "dig", targetPosition={"x": 1, "y": 2})["valid"] is False


def test_alliance_contract_exposes_links_and_duration_without_changing_rules(art_game):
    state, actor, target = art_game
    add_alliance(state, actor.id, target.id, duration=3)
    result = client.get(f"/api/game/{state.gameId}").json()
    assert result["alliances"] == [{"sourceEntityId": actor.id, "targetEntityId": target.id, "remainingTurns": 3}]


def test_replacing_same_named_image_does_not_overwrite_another_asset(tmp_path, monkeypatch):
    from app.api import routes_uploads

    monkeypatch.setattr(routes_uploads, "UPLOAD_DIR", tmp_path)
    urls = []
    for content in [b"first-image", b"second-image"]:
        response = client.post("/api/uploads/token?filename=Same%20Image.PNG", content=content)
        assert response.status_code == 200
        urls.append(response.json()["url"])
    assert urls[0] != urls[1]
    assert all(url.endswith(".png") and " " not in url for url in urls)
    assert (tmp_path / "tokens" / urls[0].split("/")[-1]).read_bytes() == b"first-image"
