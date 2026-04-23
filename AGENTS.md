# Repository Guidelines

## Project Structure & Module Organization
This repo has three parts:

- `server/`: FastAPI backend in `server/app/`, with routers in `server/app/routers/`, shared config in `server/app/core/`, and Alembic migrations in `server/alembic/versions/`.
- `client/`: TypeScript CLI/daemon in `client/src/`, plus YAML templates in `client/templates/`.
- `web/`: Vue 3 dashboard in `web/src/`, with views under `views/`, reusable UI under `components/`, and stores under `stores/`.

Use `clawhome.sh` when you need to run backend and frontend together.

## Build, Test, and Development Commands
- `cd server && uv sync`: install backend dependencies.
- `cd server && uv run uvicorn app.main:app --reload`: run the API locally.
- `cd server && uv run alembic upgrade head`: apply database migrations.
- `cd client && npm run build`: compile the CLI to `client/dist/`.
- `cd client && npm run dev`: watch and rebuild the client during development.
- `cd web && npm run dev`: start the Vite dashboard.
- `cd web && npm run build`: type-check and build the frontend.
- `./clawhome.sh start|stop|restart|status`: manage the full local stack.

## Coding Style & Naming Conventions
- Python uses 4-space indentation, type-aware Pydantic/FastAPI code, and `snake_case` for modules, functions, and settings.
- TypeScript and Vue use 2-space indentation, ES modules, and `.js` import specifiers in source.
- Vue components use `PascalCase` filenames such as `AgentCard.vue`; utility modules use lowercase names such as `storage.ts`.

No formatter or linter is configured yet, so match the surrounding file instead of introducing a new style.

## Testing Guidelines
Backend dev dependencies include `pytest`, but no committed test suite exists yet. Add tests with new behavior when practical:

- backend tests: `server/tests/test_<feature>.py`
- frontend/client tests: `<name>.test.ts` near the module or under a `tests/` directory

Run backend tests with `cd server && uv run pytest`. For frontend and client changes, at minimum run the relevant build command before opening a PR.

## Commit & Pull Request Guidelines
Recent commits use short imperative subjects, for example `Fix WS path...` and `Expand openclaw metrics...`. Keep commit messages focused and descriptive.

PRs should include a clear summary, linked issues, schema or config changes, and screenshots for dashboard UI updates. Call out any required `.env`, migration, or service-management steps.

## Security & Configuration Tips
Backend settings load from `server/.env`. Do not commit secrets, production database credentials, or real tokens. When changing data models, add an Alembic migration in `server/alembic/versions/`.
