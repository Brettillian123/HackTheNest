// Shared by the files in api/. Kept outside api/ so Vercel does not turn it into a function
// ("Keep shared utilities and route modules outside api/", Vercel docs: functions/runtimes/node-js).
import { handleApiRequest } from '../backend/route/api.js';

// Runs the existing router for one fixed path, with the error handling written once.
export async function runApi(req, res, pathname) {
  try {
    await handleApiRequest(req, res, pathname);
  } catch (error) {
    console.error('API handler error:', error);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Internal server error.' }));
  }
}

// Best guess at the original /api/... path for the fallback function (api/index.js).
// vercel.json rewrites unknown /api/:route* there; Vercel passes named parameters on in the
// query string, so `route` is used when present, otherwise the path in req.url.
export function originalApiPath(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const route = url.searchParams.get('route');
    if (route) return `/api/${route.replace(/^\/+/, '')}`;
    return decodeURIComponent(url.pathname);
  } catch {
    return '/api/unknown';
  }
}
