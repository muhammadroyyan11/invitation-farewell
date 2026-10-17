const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const publicDirectory = path.join(__dirname, 'public');
const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(__dirname, '.data'));
fs.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
const responsesFile = path.join(dataDirectory, 'responses.json');
const passwordFile = path.join(dataDirectory, 'admin-password');
let adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  if (!fs.existsSync(passwordFile)) {
    fs.writeFileSync(passwordFile, crypto.randomBytes(18).toString('base64url'), { mode: 0o600, flag: 'wx' });
    console.log(`Kata sandi admin dibuat. Lihat dengan: cat "${passwordFile}"`);
  }
  adminPassword = fs.readFileSync(passwordFile, 'utf8').trim();
}
if (adminPassword.length < 10) throw new Error('ADMIN_PASSWORD harus memiliki minimal 10 karakter.');
const passwordDigest = crypto.createHash('sha256').update(adminPassword).digest();
const sessions = new Map();
const rateLimits = new Map();
const statuses = new Set(['hadir', 'menyusul', 'tidak-hadir']);
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function sendJson(response, status, data, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(data));
}

function readResponses() {
  if (!fs.existsSync(responsesFile)) return [];
  const responses = JSON.parse(fs.readFileSync(responsesFile, 'utf8'));
  if (!Array.isArray(responses)) throw new Error('Format data kehadiran tidak valid.');
  return responses;
}

function saveResponses(responses) {
  const temporaryFile = `${responsesFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(responses, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, responsesFile);
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 8192) throw Object.assign(new Error('Data terlalu besar.'), { status: 413 });
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw Object.assign(new Error('Format permintaan tidak valid.'), { status: 400 });
  }
}

function isAuthenticated(request) {
  const token = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('farewell_session='))?.slice('farewell_session='.length);
  const expiration = sessions.get(token);
  return Boolean(expiration && expiration > Date.now());
}

function allowRequest(request, bucket, maximum) {
  const key = `${bucket}:${request.socket.remoteAddress}`;
  const now = Date.now();
  let entry = rateLimits.get(key);
  if (!entry || entry.expires <= now) {
    entry = { count: 0, expires: now + 15 * 60 * 1000 };
    rateLimits.set(key, entry);
  }
  entry.count += 1;
  return entry.count <= maximum;
}

function csvCell(value) {
  const text = String(value);
  const safe = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [token, expiration] of sessions) if (expiration <= now) sessions.delete(token);
  for (const [key, entry] of rateLimits) if (entry.expires <= now) rateLimits.delete(key);
}, 60_000);
cleanup.unref();

const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  try {
    const url = new URL(request.url, 'http://localhost');
    if (['POST', 'DELETE'].includes(request.method) && request.headers.origin) {
      const origin = new URL(request.headers.origin);
      if (origin.host !== request.headers.host) return sendJson(response, 403, { error: 'Permintaan lintas situs tidak diizinkan.' });
    }
    if (url.pathname === '/api/rsvp' && request.method === 'POST') {
      if (!allowRequest(request, 'rsvp', 30)) return sendJson(response, 429, { error: 'Terlalu banyak konfirmasi. Silakan coba lagi dalam 15 menit.' });
      const body = await readBody(request);
      const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) return sendJson(response, 400, { error: 'Isi nama antara 2 hingga 80 karakter.' });
      if (!statuses.has(body.status)) return sendJson(response, 400, { error: 'Pilih konfirmasi kehadiran terlebih dahulu.' });
      if (message.length > 500) return sendJson(response, 400, { error: 'Pesan maksimal 500 karakter.' });
      const responses = readResponses();
      const existing = responses.find(entry => entry.id === body.id && entry.editToken === body.editToken && typeof body.editToken === 'string');
      const entry = existing || { id: crypto.randomUUID(), editToken: crypto.randomBytes(24).toString('hex'), createdAt: new Date().toISOString() };
      Object.assign(entry, { name, status: body.status, message, updatedAt: new Date().toISOString() });
      if (!existing) responses.push(entry);
      saveResponses(responses);
      return sendJson(response, existing ? 200 : 201, { id: entry.id, editToken: entry.editToken, name, status: entry.status });
    }
    if (url.pathname === '/api/admin/login' && request.method === 'POST') {
      if (!allowRequest(request, 'login', 10)) return sendJson(response, 429, { error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
      const body = await readBody(request);
      const digest = crypto.createHash('sha256').update(typeof body.password === 'string' ? body.password : '').digest();
      if (!crypto.timingSafeEqual(digest, passwordDigest)) return sendJson(response, 401, { error: 'Kata sandi tidak sesuai. Silakan coba lagi.' });
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
      const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
      return sendJson(response, 200, { ok: true }, { 'Set-Cookie': `farewell_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}` });
    }
    if (url.pathname.startsWith('/api/admin/')) {
      if (!isAuthenticated(request)) return sendJson(response, 401, { error: 'Silakan masuk sebagai panitia.' });
      if (url.pathname === '/api/admin/logout' && request.method === 'POST') {
        const token = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('farewell_session='))?.slice('farewell_session='.length);
        sessions.delete(token);
        return sendJson(response, 200, { ok: true }, { 'Set-Cookie': 'farewell_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
      }
      if (url.pathname === '/api/admin/responses' && request.method === 'GET') {
        const responses = readResponses().map(({ editToken, ...entry }) => entry);
        return sendJson(response, 200, { responses });
      }
      if (url.pathname === '/api/admin/responses' && request.method === 'DELETE') {
        const body = await readBody(request);
        if (body.confirmation !== 'CLEAR_ALL_PARTICIPANTS') return sendJson(response, 400, { error: 'Konfirmasi penghapusan semua peserta diperlukan.' });
        const deletedCount = readResponses().length;
        saveResponses([]);
        return sendJson(response, 200, { ok: true, deletedCount });
      }
      if (url.pathname === '/api/admin/export' && request.method === 'GET') {
        const labels = { hadir: 'Hadir', menyusul: 'Menyusul (shift 2)', 'tidak-hadir': 'Berhalangan' };
        const rows = [['Nama', 'Konfirmasi', 'Pesan', 'Waktu konfirmasi (UTC)'], ...readResponses().map(entry => [entry.name, labels[entry.status], entry.message, entry.updatedAt])];
        response.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="konfirmasi-farewell-asik-royyan.csv"', 'Cache-Control': 'no-store' });
        return response.end('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'));
      }
    }
    if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'Halaman tidak ditemukan.' });
    if (!['GET', 'HEAD'].includes(request.method)) return sendJson(response, 405, { error: 'Metode tidak diizinkan.' });
    const routes = { '/': 'index.html', '/admin': 'admin.html', '/admin/': 'admin.html' };
    const filename = routes[url.pathname] || url.pathname.slice(1);
    const filePath = path.resolve(publicDirectory, filename);
    if (!filePath.startsWith(publicDirectory + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return response.end('Halaman tidak ditemukan.');
    }
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (request.method === 'HEAD') return response.end();
    fs.createReadStream(filePath).pipe(response);
  } catch (error) {
    if (!error.status) console.error(error);
    if (!response.headersSent) sendJson(response, error.status || 500, { error: error.status ? error.message : 'Konfirmasi belum tersimpan. Silakan coba lagi.' });
    else response.end();
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(`Undangan: http://localhost:${port}`);
  console.log(`Rekap panitia: http://localhost:${port}/admin`);
});
