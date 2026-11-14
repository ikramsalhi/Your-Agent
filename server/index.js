import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { makeSystemPrompt, normalizeAgentReply, normalizeChatInput, replySchema } from './lib.js';

const publicDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.env.PORT) || 3000;
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const maxBodyBytes = 48_000;
const requestCounts = new Map();

const staticRoutes = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/workspace-utils.js': ['workspace-utils.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
};

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function rateLimited(remoteAddress) {
  const now = Date.now();
  const ip = remoteAddress || 'unknown';
  const prior = requestCounts.get(ip);
  if (!prior || now - prior.start > 60_000) {
    requestCounts.set(ip, { start: now, count: 1 });
    return false;
  }
  prior.count += 1;
  return prior.count > 20;
}

async function readJsonBody(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBodyBytes) {
      const error = new Error('Request is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON.');
    error.status = 400;
    throw error;
  }
}

async function handleChat(req, res) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    return json(res, 503, { error: 'Add OPENAI_API_KEY to your .env file to enable AI chat.', code: 'SETUP_REQUIRED' });
  }
  if (rateLimited(req.socket.remoteAddress)) {
    return json(res, 429, { error: 'Too many requests. Please try again shortly.' });
  }
  let data;
  try {
    data = normalizeChatInput(await readJsonBody(req));
  } catch (error) {
    return json(res, error.status || 400, { error: error.message });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const providerResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [{ role: 'system', content: makeSystemPrompt(data.tasks, data.notes) }, ...data.messages],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'your_agent_reply', strict: true, schema: replySchema },
        },
      }),
    });
    if (!providerResponse.ok) {
      console.error('OpenAI request failed', providerResponse.status);
      return json(res, 502, { error: 'The AI provider could not complete this request. Check the API key and model.' });
    }
    const result = await providerResponse.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) return json(res, 502, { error: 'The AI provider returned an empty response.' });
    return json(res, 200, normalizeAgentReply(JSON.parse(content), data.tasks));
  } catch (error) {
    console.error('Chat error', error.name);
    return json(res, 502, { error: 'Could not reach the AI provider. Please try again.' });
  } finally {
    clearTimeout(timeout);
  }
}

export const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");

  const path = new URL(req.url || '/', 'http://localhost').pathname;
  if (req.method === 'GET' && path === '/api/health') {
    return json(res, 200, {
      ok: true,
      aiConfigured: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here'),
    });
  }
  if (req.method === 'POST' && path === '/api/chat') return handleChat(req, res);
  if (req.method === 'GET' && Object.hasOwn(staticRoutes, path)) {
    const [filename, contentType] = staticRoutes[path];
    try {
      const file = await readFile(join(publicDirectory, filename));
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
      return res.end(file);
    } catch {
      return json(res, 500, { error: 'Could not read application file.' });
    }
  }
  return json(res, 404, { error: 'Not found.' });
});

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  server.listen(port, () => console.log(`Your-Agent running at http://localhost:${port}`));
}
