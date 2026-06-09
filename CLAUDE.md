# Town of Peace — 桃源镇文明模拟器

## Tech Stack
- TypeScript (ES2022), Node.js v22
- seedrandom for seeded RNG
- vitest for testing
- tsx for development runner

## Project Structure
- `src/config/` — pure data + Schema (world constants, characters, skills, items, prices, tech-tree, events)
- `src/core/` — infrastructure (WorldEngine, RNG, EventBus). No business logic.
- `src/agents/` — Agent lifecycle, decisions, skills, health, relationships, work
- `src/economy/` — Market, inventory, trade, employment, currency
- `src/society/` — Laws, festivals, groups, archives, knowledge transfer
- `src/world/` — Map, buildings, resources, seasons
- `src/innovation/` — Innovation engine, tech checker, discoveries
- `src/narrative/` — Chronicle generator (separate from core), event emitter, templates
- `tests/` — unit, integration (with replay tests), fixtures
- `data/` — saves and templates

## Design Rules
- WorldState is pure data (no methods). Logic lives in Manager/System classes.
- Simulation core strictly separate from output layer. ChronicleGenerator reads state, formats text.
- Modules communicate ONLY through EventBus, never direct imports between business modules.
- Config files export both data AND type schemas with validation functions.
- SeedRandom RNG for deterministic, replayable simulations.
- Same seed + same sequence of ticks = identical output. Verified via replay tests.

## Key Commands
- `npm run dev` — run with defaults
- `npm run new -- --seed 42` — new game with seed
- `npm run continue` — continue saved game
- `npm test` — run tests
- `npm run test:replay` — replay verification

## Code Standards
- TypeScript strict mode
- 2-space indentation
- JSDoc on public interfaces
- Tests alongside code
- No wildcard imports
- Event-driven architecture: emit events, don't import sister modules
