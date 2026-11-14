# PromptDyno

A browser prototype for practicing prompts by recreating a target page, receiving deterministic feedback, and comparing scores.

## Start the app

Requirements: Node.js and npm. Put `MONGODB_URI=...` in the root `.env` file, then run:

```sh
npm install
npm run dev
```

Open the URL printed by the server (default `http://localhost:3000`). The home page is at `/home`; `/` redirects there.

## MongoDB test button

On the home page, **Create test object** sends `POST /api/test-objects`. The backend uses the root `.env` connection string and inserts a document in `testObjects` containing MongoDB's generated `_id` plus a `randomString` of 4�10 alphanumeric characters. The URI stays server-side.

## Pages and project structure

Each root-level HTML file in `frontend/pages/` is served at its matching clean URL (for example, `login.html` ? `/login`). Keep shared files under `frontend/scripts/`, `frontend/styles/`, and `frontend/assets/`; use root-relative asset URLs.

The backend separates route handling, controllers, services, models, and database configuration under `backend/`. Keep secrets in ignored local `.env` files and safe variable names in `.env.example`.

## Prototype limits

The page preview, challenge scoring, build counter, and sample leaderboard remain local demo behavior; they are not connected to an AI model or shared accounts/leaderboard.
