import { handleCreateTestObject } from '../controller/testObjectController.js';
import { handleCurrentUser, handleLogin, handleLogout, handleSignup } from '../controller/authController.js';

export function handleApiRequest(request, response, pathname) {
  if (request.method === 'POST' && pathname === '/api/auth/signup') return handleSignup(request, response);
  if (request.method === 'POST' && pathname === '/api/auth/login') return handleLogin(request, response);
  if (request.method === 'GET' && pathname === '/api/auth/me') return handleCurrentUser(request, response);
  if (request.method === 'POST' && pathname === '/api/auth/logout') return handleLogout(request, response);
  if (request.method === 'POST' && pathname === '/api/test-objects') {
    return handleCreateTestObject(request, response);
  }
  response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'API route not found.' }));
}
