<div align="center">

# TableFlow

### A more considered way to reserve, seat, and serve.

TableFlow brings the guest booking journey and the restaurant host desk into one connected experience. Guests can explore a fine-dining concept and find a table; staff can coordinate the floor, reservations, and walk-in queue.

![Warmly lit restaurant dining room, shown on the TableFlow guest experience](frontend/public/images/tableflow-hero.png)

**Next.js** · **FastAPI** · **PostgreSQL** · **SQLAlchemy**

[Experience](#the-experience) · [Features](#what-it-supports) · [Quick start](#quick-start) · [API](#api-at-a-glance)

</div>

## The experience

| Guest experience | Host desk |
| --- | --- |
| Browse the restaurant, menu highlights, and dining details. | See the live floor with table capacity and service status. |
| Choose a date, time, and party size, then review table availability. | Manage reservations, check-ins, table status, and the walk-in queue. |
| Book as a guest or sign in to create an account. | Sign in with a staff role; access is enforced by the API. |

The public experience uses a warm editorial palette and supports reduced motion. The host desk keeps the focus on clear service decisions.

## What it supports

- **Time-aware availability:** table capacity, physical status, date, and one-hour reservation slots all factor into availability.
- **Reservation lifecycle:** guests can book; signed-in customers can cancel; authorized staff can check guests in and complete a seating.
- **Walk-in queue:** active parties are ordered by arrival and matched to capacity-compatible tables.
- **Live updates:** table, reservation, and queue changes can be broadcast to connected staff clients over WebSockets.
- **Role-based access:** the backend checks staff permissions for operational endpoints.
- **Demo restaurant:** seed a local restaurant with ten tables and a host account to explore the flow.

## Quick start

### Requirements

- Node.js and npm
- Python 3.12+ and [uv](https://docs.astral.sh/uv/)
- Docker Compose, or a local PostgreSQL database

### 1. Start PostgreSQL

From the repository root, create a local environment file and choose a local-only password:

```bash
cp .env.example .env
```

Set `POSTGRES_PASSWORD` in `.env`, then start the database. Docker Compose maps it to port `55432` on your machine.

```bash
docker compose up -d
```

If you already have PostgreSQL running locally, skip Compose and point `DATABASE_URL` at that database instead.

### 2. Configure and start the API

Create the backend environment file:

```bash
cp backend/.env.example backend/.env
```

For the Compose database, update `DATABASE_URL` in `backend/.env` to use the same password and port:

```dotenv
DATABASE_URL=postgresql+psycopg://tableflow:<your-local-password>@localhost:55432/tableflow
JWT_SECRET=<a-long-random-local-secret>
```

Then install dependencies, apply migrations, seed the demo restaurant, and run the API:

```bash
cd backend
uv sync --all-groups
uv run alembic upgrade head
TABLEFLOW_DEMO_HOST_PASSWORD='choose-a-local-password' uv run python -m app.db.seed
uv run uvicorn app.main:app --reload --port 8000
```

The seed command prints the restaurant ID and creates a host account with email `host@tableflowdemo.com`. Use the password supplied in `TABLEFLOW_DEMO_HOST_PASSWORD` to sign in at `/host`.

### 3. Start the frontend

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000) for the guest experience or [localhost:3000/host](http://localhost:3000/host) for the host desk. The frontend defaults to `http://127.0.0.1:8000/api/v1` and restaurant ID `1`. If the seed output shows a different restaurant ID, set it when starting Next.js:

```bash
NEXT_PUBLIC_RESTAURANT_ID=2 npm run dev
```

Replace `2` with the restaurant ID printed by the seed command.

## API at a glance

Interactive API documentation is available at [localhost:8000/docs](http://localhost:8000/docs); the health check is [localhost:8000/health](http://localhost:8000/health). Application routes use the `/api/v1` prefix.

| Route | Purpose |
| --- | --- |
| `POST /api/v1/auth/register` · `POST /api/v1/auth/login` | Customer registration and sign-in |
| `GET /api/v1/tables/floor` | Public floor and slot availability for a party |
| `GET /api/v1/reservations/availability` | Find bookable tables for a date, slot, and party size |
| `POST /api/v1/reservations` · `POST /api/v1/reservations/{id}/cancel` | Create or cancel a reservation |
| `GET /api/v1/reservations` · `POST /api/v1/reservations/{id}/check-in` | Staff reservation list and check-in workflow |
| `GET /api/v1/tables` · `PATCH /api/v1/tables/{id}/status` | Staff floor status |
| `POST /api/v1/queue` · `GET /api/v1/queue` | Join or review the walk-in queue |
| `POST /api/v1/queue/{id}/call` · `POST /api/v1/queue/{id}/seat` | Call and seat a queued party |
| `WS /api/v1/realtime/restaurants/{restaurant_id}` | Authenticated restaurant events |

## How it fits together

```text
Next.js guest site and host desk
              │ REST + WebSocket
              ▼
     FastAPI routers and services
              │ SQLAlchemy
              ▼
          PostgreSQL
```

PostgreSQL is the source of truth for availability and seating. Reservation confirmation and queue seating lock candidate table records and commit related state changes together. See [the architecture notes](docs/ARCHITECTURE.md) and [product decisions](docs/DECISIONS.md) for more detail.

## Project structure

```text
frontend/   Next.js App Router, guest site, and host desk
backend/    FastAPI routes, workflows, models, schemas, and migrations
docs/       Architecture notes and product decisions
```

## Configuration

| Variable | Used by | Purpose |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | Docker Compose | Local PostgreSQL password |
| `DATABASE_URL` | API | PostgreSQL connection string |
| `JWT_SECRET` | API | Signs access tokens; use a private random value |
| `JWT_ALGORITHM` | API | Token signing algorithm (`HS256` by default) |
| `CORS_ORIGINS` | API | Comma-separated allowed frontend origins |
| `NEXT_PUBLIC_API_URL` | Frontend | API base URL; defaults to `http://127.0.0.1:8000/api/v1` |
| `NEXT_PUBLIC_RESTAURANT_ID` | Frontend | Restaurant to display; defaults to `1` |
| `TABLEFLOW_DEMO_HOST_PASSWORD` | Seed command | Local password for the demo host account |

Keep real credentials in ignored local environment files. Do not commit `.env` files or real guest data.

## Quality checks

Run from the repository root:

```bash
cd frontend && npm run lint && npx next build --webpack
cd ../backend && uv run ruff check app tests && uv run pytest
```
