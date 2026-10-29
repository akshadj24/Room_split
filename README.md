# RoomSplit

AI-powered roommate expense manager.

## Quick Start

### 1. Start DB
```bash
docker-compose up -d
```

### 2. Backend
```bash
cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

- API: http://localhost:8000
- Frontend: http://localhost:5173
- Health: http://localhost:8000/health
