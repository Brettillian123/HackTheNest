// Fallback for any /api/... path without its own file (vercel.json rewrites them here).
// Known routes have their own files in api/; this one exists so unknown paths still get the
// router's JSON 404.
import { originalApiPath, runApi } from '../lib/vercel-handler.js';

export default function handler(req, res) {
  return runApi(req, res, originalApiPath(req));
}
