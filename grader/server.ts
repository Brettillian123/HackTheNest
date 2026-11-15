import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grader } from './src/index';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targetsRoot = resolve(root, 'frontend/testHtml');
const port = Number(process.env.GRADER_PORT || 3101);
const host = process.env.GRADER_HOST || '127.0.0.1';
const token = process.env.GRADER_SERVICE_TOKEN;
const grader = new Grader();
const targets = [
  '01-simple-shape',
  '02-shape-study',
  '03-profile-card',
  '04-coffee-shop',
  '05-login-form',
];
const goals = new Map<string, Awaited<ReturnType<Grader['render']>>>();

function json(response: import('node:http').ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function inlineCss(html: string, css: string): string {
  const style = `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (head) => `${head}${style}`);
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, (tag) => `${tag}<head>${style}</head>`);
  return `<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${html}</body></html>`;
}

async function loadGoal(slug: string) {
  if (!targets.includes(slug)) throw new Error('Unknown target.');
  const folder = resolve(targetsRoot, slug);
  const html = await readFile(resolve(folder, 'index.html'), 'utf8');
  const href = html.match(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+\.css)["'][^>]*>/i)?.[1];
  if (!href || basename(href) !== href) throw new Error(`Target ${slug} has no local stylesheet.`);
  const css = await readFile(resolve(folder, href), 'utf8');
  return inlineCss(html, css);
}

async function readJson(request: import('node:http').IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 350_000) throw new Error('Submission is too large.');
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>; }
  catch { throw new Error('Send valid JSON.'); }
}

async function start() {
  for (const slug of targets) {
    const html = await loadGoal(slug);
    goals.set(slug, await grader.render(html));
  }

  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (request.method === 'GET' && pathname === '/health') return json(response, 200, { status: 'ready', version: '0.2.0', targets: goals.size });
    if (request.method !== 'POST' || pathname !== '/grade') return json(response, 404, { error: 'Route not found.' });
    if (token && request.headers.authorization !== `Bearer ${token}`) return json(response, 401, { error: 'Unauthorized grading request.' });

    let input: Record<string, unknown>;
    try { input = await readJson(request); }
    catch (error) { return json(response, 400, { error: error instanceof Error ? error.message : 'Invalid request.' }); }
    const slug = input.challenge;
    const html = input.html;
    const css = input.css;
    if (typeof slug !== 'string' || !goals.has(slug)) return json(response, 400, { error: 'Choose a valid challenge.' });
    if (typeof html !== 'string' || !html.trim()) return json(response, 400, { error: 'Add the generated HTML before grading.' });
    if (typeof css !== 'string') return json(response, 400, { error: 'CSS must be text.' });

    try {
      const candidateHtml = inlineCss(html, css);
      const { result } = await grader.grade(goals.get(slug)!, candidateHtml);
      return json(response, 200, { result });
    } catch (error) {
      console.error('Grader request failed:', error instanceof Error ? error.message : error);
      return json(response, 500, { error: 'The grader could not process this submission.' });
    }
  });

  server.listen(port, host, () => console.log(`PromptDyno grader ready at http://${host}:${port} (${goals.size} targets)`));
  const close = async () => {
    server.close();
    await grader.close();
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

start().catch(async (error) => {
  console.error('Could not start grader:', error);
  await grader.close();
  process.exit(1);
});
