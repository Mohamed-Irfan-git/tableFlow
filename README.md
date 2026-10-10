# TableFlow

TableFlow is a premium restaurant table, reservation, and queue-management experience. The first milestone delivers the cinematic customer experience and host-desk foundation in `frontend/`.

## Run the frontend

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000` for the public experience or `http://localhost:3000/host` for the host desk.

## Run the API

The API is a FastAPI modular monolith backed by PostgreSQL. Keep your local PostgreSQL connection and JWT secret in an untracked `backend/.env`, using `backend/.env.example` as the template.

```bash
cd backend
uv sync --all-groups
uv run alembic upgrade head
TABLEFLOW_DEMO_HOST_PASSWORD='<choose-a-local-password>' uv run python -m app.db.seed
uv run uvicorn app.main:app --reload --port 8000
```

The health check is available at `http://localhost:8000/health`; versioned application routes are under `/api/v1`. The seed command creates the default host as `host@tableflowdemo.com` using the local-only password you supply. For an isolated local PostgreSQL instance, copy `.env.example` to a root `.env`, choose a local-only `POSTGRES_PASSWORD`, run `docker compose up -d` from the project root, and set `DATABASE_URL` in `backend/.env` to `postgresql+psycopg://tableflow:<your-password>@localhost:55432/tableflow`.

## Quality checks

```bash
cd frontend && npm run lint && npx next build --webpack
cd ../backend && uv run ruff check app tests && uv run pytest
```

## Project direction

- Customer experience: cinematic fine-dining editorial design with accessible, reduced-motion-aware interaction.
- Operations: a compact host desk designed around a live floor map and queue decisions.
- Backend: FastAPI/PostgreSQL foundation is the next integration milestone; credentials stay in ignored environment files.
