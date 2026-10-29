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
- **QR food orders:** guests can order dine-in, takeaway, or delivery and follow kitchen/delivery status from a private tracking link. Delivery customers pin their destination; after staff dispatch the order, the dispatch device can share live GPS for the customer map.
- **Delivery payment:** cash on delivery or a simulated card checkout with server-side Luhn, expiry, and security-code validation. The demo never charges a bank or stores card details. Stripe checkout remains available when configured.
- **Role-based access:** the backend checks staff permissions for operational endpoints.
- **Demo restaurant:** seed a local restaurant with ten tables and a host account to explore the flow.

## Quick start

### Requirements

- Docker Engine and the Docker Compose plugin

### Start the full project

From the repository root, copy the shared development settings and start the app:

```bash
cp .env.example .env
docker compose up -d
```

On the first run, Compose builds the API and frontend images, starts PostgreSQL, waits for it to become healthy, applies database migrations, seeds the demo restaurant and host account, then starts the API and frontend. The database is stored in a named volume so it persists across container restarts. After pulling code changes, including payment or tracking updates, run `docker compose up -d --build` to rebuild and replace the running app containers.

- Guest experience: [localhost:3000](http://localhost:3000)
- Host desk: [localhost:3000/host](http://localhost:3000/host)
- API docs: [localhost:8000/docs](http://localhost:8000/docs)
- Health check: [localhost:8000/health](http://localhost:8000/health)

Sign in to the host desk with `TABLEFLOW_DEMO_HOST_EMAIL` and `TABLEFLOW_DEMO_HOST_PASSWORD` from `.env`. The checked-in defaults are for local development; teammates can use them as-is, or change them in their own ignored `.env` file.

### Populate an existing deployment database

To create the demo restaurant, missing tables, host account, and the three sample menu items in an already-migrated PostgreSQL database (including Supabase), run the seed once in the backend environment. Configure `DATABASE_URL`, `TABLEFLOW_DEMO_HOST_EMAIL`, and a strong `TABLEFLOW_DEMO_HOST_PASSWORD` in the backend deployment, then run:

```bash
uv run python -m app.db.seed
```

The seed is repeatable: it adds missing demo rows and leaves existing menu items and tables in place. It prints the restaurant ID; set that value as Vercel's `NEXT_PUBLIC_RESTAURANT_ID`, then redeploy the frontend. Use the configured host email and password to sign in at `/host`. Do not use the local development password in production.

Useful commands:

```bash
docker compose logs -f             # follow all service logs
docker compose logs -f api          # follow migrations and API logs
docker compose down                # stop containers, keep database data
docker compose down -v             # stop containers and delete database data
```

Within Compose, the API connects to PostgreSQL at host `db` on the private Compose network. The backend environment template uses the same container hostname; `localhost` inside the API container refers to that container itself.

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
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Docker Compose | PostgreSQL database credentials |
| `DATABASE_URL` | API | PostgreSQL connection string (Compose supplies the `db` host) |
| `JWT_SECRET` | API | Signs access tokens; use a private random value |
| `JWT_ALGORITHM` | API | Token signing algorithm (`HS256` by default) |
| `CORS_ORIGINS` | API | Comma-separated allowed frontend origins |
| `NEXT_PUBLIC_API_URL` | Frontend | Browser API base URL; defaults to `http://localhost:8000/api/v1` |
| `NEXT_PUBLIC_RESTAURANT_ID` | Frontend | Restaurant to display; defaults to `1` |
| `TABLEFLOW_DEMO_HOST_EMAIL` / `TABLEFLOW_DEMO_HOST_PASSWORD` | API seed | Demo host account credentials |
| `PUBLIC_CUSTOMER_URL` | API | Public customer URL used for hosted Stripe checkout redirects |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | API | Optional credentials for real Stripe checkout; simulated delivery card payments need no provider credentials |

Keep real credentials in ignored local environment files. Do not commit `.env` files or real guest data.

## Quality checks

Run from the repository root:

```bash
cd frontend && npm run lint && npx next build --webpack
cd ../backend && uv run ruff check app tests && uv run pytest
```
<!-- 1kpOF2QtdAdPZnDz -->
