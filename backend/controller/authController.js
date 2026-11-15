import { authenticateUser, createUser } from '../services/userService.js';
import { createSession, deleteSession, getSession } from '../services/sessionService.js';

const COOKIE_NAME = 'promptdyno_session';

function sessionCookie(request, token, clear = false) {
  const options = `Path=/; HttpOnly; SameSite=Lax${request.socket.encrypted ? '; Secure' : ''}; Max-Age=${clear ? 0 : 86400}`;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; ${options}`;
}

function readCookie(request, name) {
  const header = request.headers.cookie || '';
  const pair = header.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error('Request is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Send a valid JSON request.')); }
    });
    request.on('error', reject);
  });
}

function dbError(response, error) {
  console.error('Authentication database error:', error.name, error.code || error.cause?.code || error.message);
  const tlsFailure = /SSL|TLS|tlsv1 alert/i.test(error.message);
  sendJson(response, tlsFailure ? 502 : 503, {
    error: tlsFailure
      ? 'MongoDB rejected the TLS connection. Check Atlas Network Access and allow this server’s public IP.'
      : 'Could not connect to MongoDB. Check the URI, Atlas IP access list, and cluster status.',
  });
}

export async function handleSignup(request, response) {
  let input;
  try { input = await readBody(request); }
  catch (error) { return sendJson(response, 400, { error: error.message }); }
  if (typeof input.username !== 'string' || typeof input.email !== 'string' || typeof input.password !== 'string') {
    return sendJson(response, 400, { error: 'Username, email, and password are required.' });
  }

  try {
    const user = await createUser(input);
    const token = createSession(user);
    return sendJson(response, 201, { user }, { 'Set-Cookie': sessionCookie(request, token) });
  } catch (error) {
    if (error.code === 11000) return sendJson(response, 409, { error: 'That username or email is already registered.' });
    if (/^(Username|Enter a valid email|Password must)/.test(error.message)) return sendJson(response, 400, { error: error.message });
    return dbError(response, error);
  }
}

export async function handleLogin(request, response) {
  let input;
  try { input = await readBody(request); }
  catch (error) { return sendJson(response, 400, { error: error.message }); }
  if (typeof input.email !== 'string' || typeof input.password !== 'string') {
    return sendJson(response, 400, { error: 'Email and password are required.' });
  }

  try {
    const user = await authenticateUser(input);
    if (!user) return sendJson(response, 401, { error: 'Email or password is incorrect.' });
    const token = createSession(user);
    return sendJson(response, 200, { user }, { 'Set-Cookie': sessionCookie(request, token) });
  } catch (error) {
    return dbError(response, error);
  }
}

export function handleCurrentUser(request, response) {
  const session = getSession(readCookie(request, COOKIE_NAME));
  return sendJson(response, session ? 200 : 401, session ? { user: session.user } : { error: 'Not logged in.' });
}

export function handleLogout(request, response) {
  deleteSession(readCookie(request, COOKIE_NAME));
  return sendJson(response, 200, { ok: true }, { 'Set-Cookie': sessionCookie(request, '', true) });
}
