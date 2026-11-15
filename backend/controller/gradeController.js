function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 350_000) throw new Error('Submission is too large.');
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Send valid JSON.'); }
}

export async function handleGrade(request, response) {
  let input;
  try { input = await readBody(request); }
  catch (error) { return sendJson(response, 400, { error: error.message }); }

  const serviceUrl = process.env.GRADER_SERVICE_URL || 'http://127.0.0.1:3101/grade';
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.GRADER_SERVICE_TOKEN) headers.Authorization = `Bearer ${process.env.GRADER_SERVICE_TOKEN}`;

  try {
    const upstream = await fetch(serviceUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(60_000),
    });
    const result = await upstream.text();
    response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8' });
    response.end(result);
  } catch (error) {
    console.error('Grader service unavailable:', error.message);
    sendJson(response, 503, { error: 'The grading service is unavailable. Start the grader service and try again.' });
  }
}
