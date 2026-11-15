# Running PromptDyno locally

1. Install the app dependencies: `npm install`.
2. Install the grading service dependencies: `npm install --prefix grader`.
3. Install Chromium if this machine has not installed Playwright browsers: `npx --prefix grader playwright install chromium`.
4. Add `MONGODB_URI=...` to the root `.env` if using signup/login or the MongoDB test button.
5. Run `npm run dev` and open `http://localhost:3000`.

`npm run dev` starts the web app and the grader service. The app sends `POST /api/grade` to the local service at `http://127.0.0.1:3101/grade`. The grader pre-renders the five targets, renders submitted HTML and CSS in isolated Chromium pages with scripts/network disabled, and returns its visual/content/layout/style score.

## Deploying

The grader uses a real Chromium process and is not run inside a Vercel function. Deploy `grader/server.ts` as a separate Node service with the `grader/` dependencies and Playwright Chromium installed. Set `GRADER_HOST=0.0.0.0`, `GRADER_PORT`, and a strong `GRADER_SERVICE_TOKEN` there. Configure the same token in Vercel and set `GRADER_SERVICE_URL` to the deployed service's `/grade` URL. The Vercel `/api/grade` route proxies submissions to that service.
