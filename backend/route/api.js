import { handleCreateTestObject } from '../controller/testObjectController.js';

export function handleApiRequest(request, response, pathname) {
  if (request.method === 'POST' && pathname === '/api/test-objects') {
    return handleCreateTestObject(request, response);
  }
  response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'API route not found.' }));
}
