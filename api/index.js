// Vercel entry point for every /api/... request (see vercel.json).
// It hands the raw Node request and response to the same router the dev server uses.
import { handleApiRequest } from '../backend/route/api.js';

export default async function handler(req, res) {
  let pathname;
  try {
    const url = new URL(req.url, 'http://localhost');
    // vercel.json rewrites /api/<route> to /api/index?__route=<route>, so the original
    // path is rebuilt from that parameter; otherwise req.url already holds it.
    const route = url.searchParams.get('__route');
    pathname = route ? `/api/${route}` : decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  try {
    await handleApiRequest(req, res, pathname);
  } catch (error) {
    console.error('API handler error:', error);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Internal server error.' }));
  }
}
