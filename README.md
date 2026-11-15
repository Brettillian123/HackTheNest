# PromptDyno

A browser prototype for practicing prompts by recreating progressively more complex target designs and receiving deterministic feedback.

## Start the app

Requirements: Node.js, npm, and Playwright Chromium. Put `MONGODB_URI=...` in the root `.env` file if you use the account or MongoDB features, then run:

```sh
npm install
npm install --prefix grader
npx --prefix grader playwright install chromium
npm run dev
```

Open `http://localhost:3000`. `npm run dev` starts both the web app and local grader service. The home page is at `/home`; `/` redirects there.

## Challenges

Challenge references live in `frontend/testHtml/`, with one numbered folder per generic target and its own HTML/CSS files. Browse the five targets—from a simple shape through a login form—with the arrows or selector; the active target and its rubric update together. Your selected target is saved in the browser.

The challenge order is in `frontend/scripts/app.js`; references live in `frontend/testHtml/`. Write a prompt for your model, paste its generated HTML and CSS, and select **Render & grade**. The Playwright grader compares the rendered page against the selected target using content, layout, style, and screenshot similarity. Model generation is not connected yet. See [grader integration](docs/grader-integration.md) for local and deployment setup.

## Account pages

- `/signup` creates a MongoDB user with a unique username and email.
- `/login` validates email and password, then starts a session.
- `/api/auth/me` returns the current signed-in user; `/api/auth/logout` ends the session.

Passwords are stored as salted scrypt hashes. Session cookies are HttpOnly and SameSite=Lax. Sessions are held in memory for 24 hours, so restarting the server logs users out. Both routes require a working MongoDB connection.

## MongoDB test button

On the home page, **Create test object** sends `POST /api/test-objects`. The backend inserts a document in `testObjects` containing MongoDB's generated `_id` plus a `randomString` of 4�10 alphanumeric characters. The URI stays server-side.

## Structure

Each root-level HTML file in `frontend/pages/` is served at its matching clean URL (for example, `login.html` ? `/login`). Keep shared files under `frontend/scripts/`, `frontend/styles/`, and `frontend/assets/`.

The backend separates route handling, controllers, services, models, and database configuration under `backend/`. Keep secrets in ignored local `.env` files and safe variable names in `.env.example`.
