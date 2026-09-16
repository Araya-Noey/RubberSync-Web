const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const ROOT = __dirname;
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const DB_FILE = path.join(ROOT, 'data', 'db.json');
const FRONTEND_PUBLIC = path.resolve(ROOT, '../Frontend/public');
const PORT = Number(process.env.PORT || 8080);
const AUTH_SECRET = process.env.AUTH_SECRET || 'rubbersync-dev-secret-change-me';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function now() { return new Date().toISOString(); }
function id(prefix='id') { return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`; }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, expected) {
  const actual = crypto.scryptSync(password, salt, 64);
  const exp = Buffer.from(expected, 'hex');
  return exp.length === actual.length && crypto.timingSafeEqual(exp, actual);
}
function b64url(data) { return Buffer.from(data).toString('base64url'); }
function signToken(user) {
  const payload = b64url(JSON.stringify({ sub: user.id, role: user.role, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 }));
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function parseToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

function initialDb() {
  const userPass = hashPassword('12345678');
  const adminPass = hashPassword('12345678');
  const userId = 'usr_demo_user';
  const adminId = 'usr_demo_admin';
  return {
    version: 1,
    users: [
      { id: userId, fullName: 'สมจิตร เดือนอิน', phone: '0800000001', lineId: '', contactNote: '', bankName: '', bankAccountName: '', bankAccountNumber: '', role: 'user', passwordSalt: userPass.salt, passwordHash: userPass.hash, createdAt: now() },
      { id: adminId, fullName: 'ธนกฤต ศุภทรัพย์', phone: '0800000000', lineId: '', contactNote: '', bankName: '', bankAccountName: '', bankAccountNumber: '', role: 'admin', passwordSalt: adminPass.salt, passwordHash: adminPass.hash, createdAt: now() }
    ],
    requests: [
      { id: 'req_demo_1', ref: 'TXN-5678-RUBB', userId, category: 'ค่าน้ำมัน', amount: 2000, date: '2026-08-21', note: 'โซน A น้ำมันไม่พอ', status: 'pending', createdAt: now(), updatedAt: now() }
    ],
    announcements: [
      { id: 'ann_demo_1', title: 'เตรียมตัวเก็บยาง', body: 'จะเริ่มประมูลยางในวันที่ 25 สิงหาคม 2569 จะแจ้งราคาประมูลและวันเก็บให้ทราบอีกครั้ง', audience: 'all', createdBy: adminId, createdAt: now() }
    ],
    payments: [],
    messages: [{ id: 'msg_welcome', userId: adminId, text: 'ยินดีต้อนรับเข้าสู่ห้องสนทนาสวนยางครับ', createdAt: now() }],
    settings: {
      appName: 'RubberSync',
      version: '1.0.0'
    }
  };
}
function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const db = initialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    return db;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
let db = loadDb();
function saveDb() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function json(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': FRONTEND_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
  });
  res.end(JSON.stringify(obj));
}
function getBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (Buffer.byteLength(data) > limit) {
        reject(new Error('payload_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}
function auth(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = parseToken(token);
  if (!payload) return null;
  return db.users.find(u => u.id === payload.sub) || null;
}
function safeUser(u) { return { id: u.id, fullName: u.fullName, phone: u.phone, lineId: u.lineId || '', contactNote: u.contactNote || '', role: u.role, createdAt: u.createdAt }; }
function requestUser(u) { return { ...safeUser(u), bankName: u.bankName || '', bankAccountName: u.bankAccountName || '', bankAccountNumber: u.bankAccountNumber || '' }; }
function requestView(r) {
  const user = db.users.find(u => u.id === r.userId);
  const payment = db.payments.find(p => p.requestId === r.id);
  return { ...r, user: user ? requestUser(user) : null, payment: payment || null };
}
function requireAuth(req, res, role) {
  const user = auth(req);
  if (!user) { json(res, 401, { error: 'unauthorized' }); return null; }
  if (role && user.role !== role) { json(res, 403, { error: 'forbidden' }); return null; }
  return user;
}
async function sendDiscordMessage(content) {
  if (!DISCORD_WEBHOOK_URL) return { ok: false, configured: false };
  try {
    const resp = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content })
    });
    return { ok: resp.ok, configured: true, status: resp.status };
  } catch (e) { return { ok: false, configured: true, error: e.message }; }
}
async function handleApi(req, res, url) {
  const method = req.method;
  const p = url.pathname;

  if (p === '/api/health' && method === 'GET') return json(res, 200, { ok: true, app: 'RubberSync', time: now() });

  if (p === '/api/auth/login' && method === 'POST') {
    const body = await getBody(req);
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    const user = db.users.find(u => u.phone === phone);
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) return json(res, 401, { error: 'invalid_credentials' });
    return json(res, 200, { token: signToken(user), user: requestUser(user) });
  }

  if (p === '/api/auth/register' && method === 'POST') {
    const body = await getBody(req);
    const fullName = String(body.fullName || '').trim();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    if (fullName.length < 2 || !/^0\d{9}$/.test(phone) || password.length < 8) return json(res, 400, { error: 'invalid_input' });
    if (db.users.some(u => u.phone === phone)) return json(res, 409, { error: 'phone_exists' });
    const ph = hashPassword(password);
    const user = { id: id('usr'), fullName, phone, lineId: '', contactNote: '', bankName: '', bankAccountName: '', bankAccountNumber: '', role: 'user', passwordSalt: ph.salt, passwordHash: ph.hash, createdAt: now() };
    db.users.push(user); saveDb();
    return json(res, 201, { token: signToken(user), user: requestUser(user) });
  }

  if (p === '/api/auth/reset-password' && method === 'POST') {
    const body = await getBody(req);
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    if (!/^0\d{9}$/.test(phone) || password.length < 8) return json(res, 400, { error: 'invalid_input' });
    const user = db.users.find(u => u.phone === phone);
    if (!user) return json(res, 404, { error: 'phone_not_found' });
    const ph = hashPassword(password);
    user.passwordSalt = ph.salt;
    user.passwordHash = ph.hash;
    user.passwordChangedAt = now();
    saveDb();
    return json(res, 200, { ok: true });
  }

  if (p === '/api/me' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return json(res, 200, { user: requestUser(user) });
  }

  if (p === '/api/me' && method === 'PATCH') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await getBody(req);
    if (typeof body.lineId === 'string') user.lineId = body.lineId.trim().slice(0,100);
    if (typeof body.contactNote === 'string') user.contactNote = body.contactNote.trim().slice(0,300);
    if (typeof body.bankName === 'string') user.bankName = body.bankName.trim().slice(0,100);
    if (typeof body.bankAccountName === 'string') user.bankAccountName = body.bankAccountName.trim().slice(0,150);
    if (typeof body.bankAccountNumber === 'string') user.bankAccountNumber = body.bankAccountNumber.trim().replace(/[^0-9-]/g, '').slice(0,30);
    saveDb();
    return json(res, 200, { user: requestUser(user) });
  }

  if (p === '/api/users' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return json(res, 200, { users: db.users.map(safeUser).sort((a,b) => a.fullName.localeCompare(b.fullName, 'th')) });
  }

  if (p === '/api/dashboard' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const list = user.role === 'admin' ? db.requests : db.requests.filter(r => r.userId === user.id);
    const counts = { pending: 0, approved: 0, rejected: 0, paid: 0 };
    list.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const totalAmount = list.filter(r => ['approved','paid'].includes(r.status)).reduce((s,r)=>s+Number(r.amount||0),0);
    return json(res, 200, { counts, total: list.length, totalAmount, announcements: db.announcements.length });
  }

  if (p === '/api/requests' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const list = user.role === 'admin' ? db.requests : db.requests.filter(r => r.userId === user.id);
    return json(res, 200, { requests: list.slice().sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).map(requestView) });
  }

  if (p === '/api/requests' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    if (user.role !== 'user') return json(res, 403, { error: 'users_only' });
    const body = await getBody(req);
    const category = String(body.category || '').trim();
    const amount = Number(body.amount);
    const date = String(body.date || '');
    const note = String(body.note || '').trim();
    if (!['ค่าอุปกรณ์','ค่าน้ำมัน','ค่าน้ำกรด','อื่นๆ'].includes(category) || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'invalid_input' });
    const dataUrl = String(body.receiptDataUrl || '');
    const image = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (!image) return json(res, 400, { error: 'receipt_required' });
    const receipt = Buffer.from(image[2], 'base64');
    if (!receipt.length || receipt.length > 5 * 1024 * 1024) return json(res, 413, { error: 'image_too_large' });
    const imageSignatureValid = (image[1] === 'image/png' && receipt.subarray(0,4).equals(Buffer.from([0x89,0x50,0x4e,0x47]))) || (image[1] === 'image/jpeg' && receipt.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]))) || (image[1] === 'image/webp' && receipt.subarray(0,4).toString() === 'RIFF' && receipt.subarray(8,12).toString() === 'WEBP');
    if (!imageSignatureValid) return json(res, 400, { error: 'invalid_image' });
    const requestId = id('req');
    const ext = image[1] === 'image/jpeg' ? 'jpg' : image[1].split('/')[1];
    const filename = `${requestId}-receipt-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), receipt);
    const r = { id: requestId, ref: `TXN-${String(Date.now()).slice(-4)}-RUBB`, userId: user.id, category, amount: Math.round(amount*100)/100, date, note, receiptUrl: `/uploads/${filename}`, receiptVerification: { category, fileType: image[1], checkedAt: now() }, status: 'pending', createdAt: now(), updatedAt: now() };
    db.requests.push(r); saveDb();
    return json(res, 201, { request: requestView(r) });
  }

  const requestStatusMatch = p.match(/^\/api\/requests\/([^/]+)\/status$/);
  if (requestStatusMatch && method === 'PATCH') {
    const admin = requireAuth(req, res, 'admin'); if (!admin) return;
    const r = db.requests.find(x => x.id === requestStatusMatch[1]);
    if (!r) return json(res, 404, { error: 'not_found' });
    const body = await getBody(req);
    if (!['approved','rejected'].includes(body.status)) return json(res, 400, { error: 'invalid_status' });
    r.status = body.status; r.reviewedBy = admin.id; r.reviewedAt = now(); r.updatedAt = now();
    if (body.reason) r.reviewReason = String(body.reason).slice(0,500);
    saveDb();
    return json(res, 200, { request: requestView(r) });
  }

  const requestDetailMatch = p.match(/^\/api\/requests\/([^/]+)$/);
  if (requestDetailMatch && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const r = db.requests.find(x => x.id === requestDetailMatch[1]);
    if (!r || (user.role !== 'admin' && r.userId !== user.id)) return json(res, 404, { error: 'not_found' });
    return json(res, 200, { request: requestView(r) });
  }

  if (p === '/api/announcements' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const list = db.announcements.filter(a => a.audience === 'all' || a.audience === user.role || (a.audience === 'workers' && user.role === 'user'));
    return json(res, 200, { announcements: list.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(a => ({...a, author: safeUser(db.users.find(u=>u.id===a.createdBy) || {id:'',fullName:'ระบบ',phone:'',role:'admin',createdAt:''})})) });
  }

  if (p === '/api/announcements' && method === 'POST') {
    const admin = requireAuth(req, res, 'admin'); if (!admin) return;
    const body = await getBody(req);
    const title = String(body.title || '').trim();
    const text = String(body.body || '').trim();
    const audience = String(body.audience || 'all');
    if (title.length < 2 || text.length < 2 || !['all','workers','admin'].includes(audience)) return json(res, 400, { error: 'invalid_input' });
    const a = { id: id('ann'), title, body: text, audience, createdBy: admin.id, createdAt: now() };
    db.announcements.push(a); saveDb();
    let discord = { ok:false, configured:Boolean(DISCORD_WEBHOOK_URL) };
    if (body.sendDiscord) discord = await sendDiscordMessage(`📢 **${title}**\n${text}`);
    return json(res, 201, { announcement: a, discord });
  }

  if (p === '/api/messages' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const allMessages = db.messages || [];
    const pinned = allMessages.filter(message => Date.parse(message.pinnedUntil || '') > Date.now()).sort((a,b) => b.pinnedAt.localeCompare(a.pinnedAt))[0] || null;
    const messageView = message => ({ ...message, user: safeUser(db.users.find(u => u.id === message.userId) || { id:'', fullName:'ไม่ทราบชื่อ', phone:'', role:'user', createdAt:'' }) });
    return json(res, 200, { messages: allMessages.slice(-100).map(messageView), pinnedMessage: pinned ? messageView(pinned) : null });
  }

  if (p === '/api/messages' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await getBody(req);
    const text = String(body.text || '').trim();
    if (!text || text.length > 1000) return json(res, 400, { error: 'invalid_message' });
    if (!Array.isArray(db.messages)) db.messages = [];
    const message = { id: id('msg'), userId: user.id, text, createdAt: now() };
    db.messages.push(message); saveDb();
    return json(res, 201, { message: { ...message, user: safeUser(user) } });
  }

  const pinMatch = p.match(/^\/api\/messages\/([^/]+)\/pin$/);
  if (pinMatch && method === 'POST') {
    const admin = requireAuth(req, res, 'admin'); if (!admin) return;
    const message = (db.messages || []).find(item => item.id === pinMatch[1]);
    if (!message) return json(res, 404, { error: 'not_found' });
    for (const item of db.messages) { delete item.pinnedUntil; delete item.pinnedAt; delete item.pinnedBy; }
    message.pinnedAt = now();
    message.pinnedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    message.pinnedBy = admin.id;
    saveDb();
    return json(res, 200, { message, pinnedUntil: message.pinnedUntil });
  }

  if (p === '/api/payments' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    let list = db.payments;
    if (user.role === 'user') {
      const ids = new Set(db.requests.filter(r=>r.userId===user.id).map(r=>r.id));
      list = list.filter(p=>ids.has(p.requestId));
    }
    return json(res, 200, { payments: list.map(pay => ({...pay, request: requestView(db.requests.find(r=>r.id===pay.requestId))})) });
  }

  const slipMatch = p.match(/^\/api\/payments\/([^/]+)\/slip$/);
  if (slipMatch && method === 'POST') {
    const admin = requireAuth(req, res, 'admin'); if (!admin) return;
    const r = db.requests.find(x => x.id === slipMatch[1]);
    if (!r) return json(res, 404, { error: 'not_found' });
    if (r.status !== 'approved') return json(res, 400, { error: 'request_not_approved' });
    const body = await getBody(req, 10 * 1024 * 1024);
    const dataUrl = String(body.dataUrl || '');
    const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (!m) return json(res, 400, { error: 'invalid_image' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 5 * 1024 * 1024) return json(res, 413, { error: 'image_too_large' });
    const ext = m[1] === 'image/jpeg' ? 'jpg' : m[1].split('/')[1];
    const filename = `${r.id}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
    let pay = db.payments.find(x => x.requestId === r.id);
    if (!pay) { pay = { id: id('pay'), requestId: r.id, adminId: admin.id, createdAt: now() }; db.payments.push(pay); }
    pay.slipUrl = `/uploads/${filename}`; pay.note = String(body.note || '').slice(0,500); pay.status = 'paid'; pay.paidAt = now();
    const recipient = db.users.find(u => u.id === r.userId);
    pay.recipientBank = recipient ? { bankName: recipient.bankName || '', accountName: recipient.bankAccountName || recipient.fullName, accountNumber: recipient.bankAccountNumber || '' } : null;
    r.status = 'paid'; r.updatedAt = now();
    saveDb();
    return json(res, 200, { payment: pay, request: requestView(r) });
  }

  if (p === '/api/settings' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return json(res, 200, { settings: { ...db.settings, discordWebhookConfigured: Boolean(DISCORD_WEBHOOK_URL) } });
  }

  if (p === '/api/settings' && method === 'PATCH') {
    const admin = requireAuth(req, res, 'admin'); if (!admin) return;
    const body = await getBody(req);
    if (typeof body.discordInviteUrl === 'string') db.settings.discordInviteUrl = body.discordInviteUrl.trim().slice(0,500);
    saveDb();
    return json(res, 200, { settings: { ...db.settings, discordWebhookConfigured: Boolean(DISCORD_WEBHOOK_URL) } });
  }

  if (p === '/api/discord/test' && method === 'POST') {
    const admin = requireAuth(req, res, 'admin'); if (!admin) return;
    const result = await sendDiscordMessage('✅ RubberSync เชื่อมต่อ Discord Webhook สำเร็จ');
    return json(res, result.ok ? 200 : 400, result);
  }

  return json(res, 404, { error: 'api_not_found' });
}

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webmanifest':'application/manifest+json' };
function serveUpload(req, res, url) {
  const filename = path.basename(decodeURIComponent(url.pathname));
  const file = path.join(UPLOADS_DIR, filename);
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Access-Control-Allow-Origin': FRONTEND_ORIGIN });
      return res.end('Not found');
    }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': FRONTEND_ORIGIN };
    fs.readFile(file, (e, data) => { if (e) { res.writeHead(500); return res.end('Read error'); } res.writeHead(200, headers); res.end(data); });
  });
}

function serveFrontend(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const normalized = path.normalize(rel).replace(/^([.][.][/\\])+/, '');
  const file = path.join(FRONTEND_PUBLIC, normalized);
  if (!file.startsWith(FRONTEND_PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      const index = path.join(FRONTEND_PUBLIC, 'index.html');
      return fs.readFile(index, (e, data) => { if (e) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' }); res.end(data); });
    }
    const ext = path.extname(file).toLowerCase();
    fs.readFile(file, (e, data) => { if (e) { res.writeHead(500); return res.end('Read error'); } res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }); res.end(data); });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': FRONTEND_ORIGIN,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
      });
      return res.end();
    }
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/uploads/')) return serveUpload(req, res, url);
    return serveFrontend(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, e.message === 'payload_too_large' ? 413 : 500, { error: e.message || 'server_error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  let nets = {};
  try { nets = os.networkInterfaces(); } catch { nets = {}; }
  const ips = [];
  for (const values of Object.values(nets)) for (const n of values || []) if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  console.log('\n=============================================');
  console.log(' RubberSync Backend พร้อมใช้งาน');
  console.log(` API:     http://localhost:${PORT}/api/health`);
  ips.forEach(ip => console.log(` Network: http://${ip}:${PORT}/api/health`));
  console.log('=============================================\n');
});
