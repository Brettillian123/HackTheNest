# Deploying on Vercel

The repo deploys to Vercel with two added files and no change to `npm run dev`:

- `vercel.json` serves `frontend/` as static files, redirects `/` to `/home`, maps
  `/home`, `/login`, `/signup`, `/challenge` to `frontend/pages/*.html`, and sends every
  `/api/...` request to one function.
- `api/index.js` is that function. It calls the same `handleApiRequest` the dev server uses.

## Import the repo (once)

1. In Vercel, click **Add New... > Project** and import the GitHub repository.
   Vercel's GitHub app needs access to the repo (it is private).
2. On the import screen:
   - **Framework Preset:** Other (vercel.json also forces this).
   - **Root Directory:** leave as the repo root.
   - **Build Command / Output Directory / Install Command:** leave the defaults.
     vercel.json sets the output directory to `frontend`; there is no build step.
3. Open **Environment Variables** and add:
   - `MONGODB_URI` - the MongoDB Atlas connection string (same one as in your local `.env`).
     Tick Production and Preview.
4. Click **Deploy**.
5. In MongoDB Atlas, **Network Access** must allow Vercel. Vercel functions do not have a
   fixed IP, so the usual choice is `0.0.0.0/0` (allow from anywhere). Without it, signup and
   login answer 502/503 with a MongoDB message.

Optional: **Settings > Build and Deployment > Node.js Version** defaults to the newest LTS
(26.x at the time of writing). Pick 24.x to match what the team runs locally.

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
