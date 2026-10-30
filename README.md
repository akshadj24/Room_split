# RoomSplit 🏠

> AI-powered roommate expense manager — split bills, track balances, and settle up without the awkward math.

![RoomSplit](https://img.shields.io/badge/Status-Live-brightgreen) ![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688) ![React](https://img.shields.io/badge/Frontend-React-61DAFB) ![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791) ![Mistral](https://img.shields.io/badge/AI-Mistral-FF7000)

---

## 🌐 Live Demo

- **Frontend:** [roomsplit.vercel.app](https://roomsplit.vercel.app)
- **Backend API:** [roomsplit-backend.onrender.com](https://roomsplit-backend.onrender.com)
- **API Docs:** [roomsplit-backend.onrender.com/docs](https://roomsplit-backend.onrender.com/docs)

---

## ✨ Features

- 👤 **Individual accounts** — each roommate has their own login
- 🔗 **Secure invite links** — join a household via expiring invitation
- 💸 **Expense splitting** — equal, custom, or weighted splits
- ⚖️ **Auto balance calculation** — see exactly who owes whom
- 🤝 **Settlements** — record repayments, receiver confirms receipt
- 📊 **Analytics** — category breakdown and monthly spending trends
- 🤖 **AI Assistant** — ask questions in plain English, draft expenses via chat
- 🔔 **Reminders** — due date and pending balance notifications
- 📱 **Mobile-first** — works on Android and desktop browsers

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Backend | Python + FastAPI |
| Database | PostgreSQL (Supabase) |
| ORM | SQLAlchemy 2 + Alembic |
| Auth | JWT + Argon2 password hashing |
| AI | Mistral AI (mistral-small-latest) |
| Charts | Recharts |
| Hosting | Vercel (frontend) + Render (backend) |

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React Client  │────▶│   FastAPI App   │────▶│   PostgreSQL    │
│   (Vercel)      │     │   (Render)      │     │   (Supabase)    │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   Mistral AI    │
                        │   (AI Chat)     │
                        └─────────────────┘
```

**Key principle:** Financial calculations are always server-controlled. AI assists with language and insights — it never determines official balances or writes financial records without user confirmation.

---

## 🚀 Local Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- Docker Desktop
- uv (`pip install uv`)

### 1. Clone the repo
```bash
git clone https://github.com/yourusername/roomsplit.git
cd roomsplit
```

### 2. Start the database
```bash
docker-compose up -d
```

### 3. Backend setup
```bash
cd backend
copy .env.example .env   # Windows
# cp .env.example .env   # Mac/Linux

# Fill in your .env values
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

### 4. Frontend setup
```bash
cd frontend
npm install
npm run dev
```

### 5. Open the app
- Frontend: http://localhost:5173
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## ⚙️ Environment Variables

### Backend `.env`
```env
APP_ENV=development
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/roomsplit
SESSION_SECRET=your-long-random-secret
FRONTEND_ORIGIN=http://localhost:5173
LLM_API_KEY=your-mistral-api-key
LLM_MODEL=mistral-small-latest
```

### Frontend `.env`
```env
VITE_API_URL=http://localhost:8000
```

---

## 📁 Project Structure

```
roomsplit/
├── frontend/
│   └── src/
│       ├── api/              # API call functions
│       ├── components/       # Reusable UI components
│       ├── features/         # Feature modules
│       │   ├── auth/
│       │   ├── expenses/
│       │   ├── settlements/
│       │   ├── analytics/
│       │   └── assistant/
│       ├── pages/            # Route pages
│       └── hooks/            # Custom React hooks
├── backend/
│   └── app/
│       ├── api/              # Route handlers
│       ├── core/             # Config, security
│       ├── db/               # Database connection
│       ├── models/           # SQLAlchemy models
│       ├── schemas/          # Pydantic schemas
│       └── services/         # Business logic
├── docker-compose.yml
└── README.md
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Login |
| GET | `/api/v1/auth/me` | Current user |
| POST | `/api/v1/households` | Create household |
| POST | `/api/v1/households/{id}/invitations` | Generate invite link |
| POST | `/api/v1/invitations/{token}/accept` | Join household |
| GET | `/api/v1/households/{id}/dashboard` | Dashboard summary |
| POST | `/api/v1/households/{id}/expenses` | Add expense |
| GET | `/api/v1/households/{id}/balances` | View balances |
| POST | `/api/v1/households/{id}/settlements` | Record repayment |
| GET | `/api/v1/households/{id}/analytics` | Spending analytics |
| POST | `/api/v1/households/{id}/ai/chat` | AI assistant |

---

## 💡 How It Works

### Adding an Expense
1. Member records expense — amount, category, who paid, who's included
2. Backend validates splits sum exactly to total
3. Balances update automatically for all participants

### Settling Up
1. Payer records "I paid ₹500 to AJ"
2. Settlement created as **pending** — balance unchanged
3. Receiver (AJ) confirms receipt
4. Status → **confirmed** — balance updates

### AI Assistant
- Ask "How much did we spend on food this month?" → answers from real DB data
- Say "I paid ₹800 for groceries, split equally" → shows draft for confirmation
- AI never saves anything without explicit user confirmation

---

## 🔒 Security

- Passwords hashed with **Argon2**
- JWT authentication on all protected routes
- Invitation tokens — only hash stored in DB
- All household endpoints verify active membership server-side
- AI tool calls validate household authorization
- No financial writes without user confirmation
- Environment secrets never committed to Git

---

## 🗺️ Roadmap

- [ ] Receipt OCR — scan and auto-fill expenses
- [ ] Recurring expense templates (rent, wifi, utilities)
- [ ] CSV export and monthly reports
- [ ] Budget alerts
- [ ] PWA — install on home screen
- [ ] Duplicate expense detection

---

## 👨‍💻 Author

**Akshad Joshi**
- Final year AI & Data Science Engineering, Savitribai Phule Pune University
- GitHub: [@akshadj](https://github.com/akshadj)

---

## 📄 License

MIT License — feel free to use this project for learning or personal use.
