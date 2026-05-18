# Development Status

## Completed

- Phase 1: project skeleton, data schemas, API contracts, SQLite character table, seed characters, seed maps and skills.
- Phase 2: map legality, occupied cells, orthogonal movement, AP spending, basic attacks, damage and critical hits.
- Phase 3: speed-based turn queues, join-order ties, temporary AP lifecycle, extra next-round turns, summon next-round eligibility, dead entity exclusion.
- Phase 4: `SkillTemplate`, one-use `SkillInstance`, effect dispatch engine, single-target validation, directional line targeting, and the temporary MVP `bomb` skill that deals 10 fixed damage.
- Phase 5: action-start status engine for stun, burn, delayed damage, and temporary stat modifiers.
- Phase 6: alliance links, temporary alliance ticking, transitive alliance grouping, ally attack prevention, and victory detection when one alliance group remains.
- Phase 7: treasure digging, luck-based success, one-use treasure points, failure damage, monster counterattacks, monster kill rewards, character kill reward choices.
- Phase 8: summon effect, legal empty-cell summon validation, owner alliance through `ownerId`, next-round queue participation, summon death handled by normal defeat flow.

## Rule Boundary

Frontend and CRUD code may call API routes, but must not duplicate core rules. The authoritative modules are under:

- `backend/app/game`
- later effect engine modules under `backend/app/game/skills`
- later status modules under `backend/app/game/status`
