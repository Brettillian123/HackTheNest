import { runApi } from '../../lib/vercel-handler.js';

export default function handler(req, res) {
  return runApi(req, res, '/api/auth/login');
}
