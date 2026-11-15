# Deploying on Vercel

The repo deploys to Vercel with these added files and no change to `npm run dev`:

- `vercel.json` serves `frontend/` as static files, redirects `/` to `/home`, maps
  `/home`, `/login`, `/signup`, `/challenge` (and any future `/name`) to
  `frontend/pages/*.html`, and sends unknown `/api/...` paths to `api/index.js`.
- `api/auth/signup.js`, `api/auth/login.js`, `api/auth/me.js`, `api/auth/logout.js`,
  `api/test-objects.js`: one function per API route; each calls the same `handleApiRequest`
  the dev server uses.
- `api/index.js`: fallback, so unknown API paths get the usual JSON 404.
- `lib/vercel-handler.js`: shared helper (outside `api/` so it is not a function).

**Adding things:** a new API route needs its own file at `api/<path>.js` (for
`/api/foo/bar`, `api/foo/bar.js`, copying `api/auth/me.js`) as well as the line in
`backend/route/api.js`. A new page `frontend/pages/<name>.html` works at `/<name>` with no
config change.

## Import the repo (once)

1. In Vercel, click **Add New... > Project** and import the GitHub repository
   (Vercel's GitHub app needs access to the private repo).
2. Import screen: **Framework Preset** Other; **Root Directory** the repo root; leave Build,
   Output and Install commands at their defaults (vercel.json sets output to `frontend`).
3. **Environment Variables:** add `MONGODB_URI` (the Atlas connection string, as in your
   local `.env`), ticked for Production and Preview. Then click **Deploy**.
4. In MongoDB Atlas, **Network Access** must allow Vercel, which has no fixed IP; the usual
   choice is `0.0.0.0/0`. Without it, signup and login answer 502/503.

Optional: **Settings > Build and Deployment > Node.js Version** defaults to the newest LTS
(26.x now). Pick 24.x to match what the team runs locally.

## Branches and deployments

- A push to `main` makes a **Production** deployment (the project's main URL).
- A push to any other branch, or a pull request, makes a **Preview** deployment with its own
  URL. Vercel posts the link on the pull request.
- Environment variables are set per environment; a variable ticked only for Production is
  missing in Preview.
- Changing an environment variable needs a redeploy (**Deployments > ... > Redeploy**).

## Check it worked

Open the deployment URL and check:

1. `/` lands on `/home` and the page has its styles.
2. `/login`, `/signup`, `/challenge` load.
3. `/api/does-not-exist` shows `{"error":"API route not found."}`.
4. `/api/auth/me` shows `{"error":"Not logged in."}` when logged out.
5. Sign up, then log in. If either fails, look at **Deployments > (the deployment) > Logs**.

## Known limits on Vercel (raise with the backend owner)

- Sessions are kept in memory (`backend/services/sessionService.js`). Each Vercel instance has
  its own memory, so a login can look lost on the next request. Moving sessions into MongoDB
  (or a signed cookie) fixes this.
- The session cookie only gets `Secure` when the socket itself is TLS
  (`backend/controller/authController.js`). On Vercel TLS ends before the function, so the
  cookie works but is sent without `Secure`.
