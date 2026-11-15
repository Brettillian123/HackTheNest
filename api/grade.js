import { runApi } from '../lib/vercel-handler.js';

export const config = { maxDuration: 60 };

export default function handler(req, res) {
  return runApi(req, res, '/api/grade');
}
