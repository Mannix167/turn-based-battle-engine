# Turn-Based Grid Game v2

Local-first turn-based grid sandbox. The current implementation focuses on the first three development phases:

- project skeleton, backend contracts, SQLite-backed character data, seed maps/skills
- game-core map legality, movement, action points, basic attacks, damage/crit calculation
- turn queue ordering, temporary AP lifecycle, extra turns, next-round summon participation

## Backend

```bash
cd backend
uvicorn app.main:app --reload
```

## Tests

```bash
cd backend
python -m pytest
```

## Frontend Stub

The frontend is intentionally minimal for now. It exists as a later UI integration target, while all game rules live in `backend/app/game`.

```bash
cd frontend
npm install
npm run dev
```
