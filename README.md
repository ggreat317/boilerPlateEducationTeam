# Full-Stack Boilerplate

React + Vite frontend (Vercel), Express backend (Render), and a Supabase database.

```
backend/    Express API: /health, /api/example
frontend/   React app, which calls the API through src/api.ts
```

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste in `backend/schema.sql`, and click **Run**.
3. Go to **Project Settings → API** and copy the **Project URL** and the **service_role** key.

## 2. Run locally

**Backend**
```bash
cd backend
cp .env.example .env     # then fill in the Supabase values
npm install
npm run dev              # http://localhost:3000/health
```

**Frontend** (in a second terminal)
```bash
cd frontend
cp .env.example .env
npm install
npm run dev              # http://localhost:5173
```

## 3. Deploy

**Backend → Render** (New → Web Service)
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`
- Environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGIN`

**Frontend → Vercel** (Add New → Project)
- Root Directory: `frontend` (Vercel detects Vite automatically)
- Environment: `VITE_API_URL` = your Render URL, e.g. `https://my-api.onrender.com`

**Connect them:** in Render, set `CORS_ORIGIN` to your Vercel URL. To allow several origins, separate them with commas.

## API

| Method | Route          | Body                | Returns        |
|--------|----------------|---------------------|----------------|
| GET    | `/health`      | none                | `{ ok: true }` |
| GET    | `/api/example` | none                | array of rows  |
| POST   | `/api/example` | `{ "title": "..." }` | created row    |

## Gotchas

- **Never put the service role key in the frontend.** Every `VITE_` variable gets bundled into the browser code, where anyone can read it.
- **Never commit `.env`.** Only commit `.env.example`.
- **Render's free tier sleeps** after 15 minutes idle, so the first request then takes about 30 seconds.
- **Vite reads `VITE_API_URL` at build time.** After changing it in Vercel, redeploy.
- **Seeing a CORS error?** Check that `CORS_ORIGIN` on Render exactly matches your frontend URL, with no trailing slash.
