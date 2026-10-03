const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(PUBLIC, 'uploads');
const PORT = Number(process.env.PORT || 8080);
const AUTH_SECRET = process.env.AUTH_SECRET || 'rubbersync-dev-secret-change-me';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '';
const DISCORD_INBOUND_SECRET = process.env.DISCORD_INBOUND_SECRET || '';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '';
const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'Asia/Bangkok';

const ROLES = ['owner', 'garden_manager', 'worker_supervisor', 'worker'];
const ROLE_LABELS = {
  owner: 'เจ้าของสวน',
  garden_manager: 'คนดูแลสวน',
  worker_supervisor: 'คนดูแลคนงาน',
  worker: 'คนงานกรีดยาง'
};

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function now() { return new Date().toISOString(); }
function id(prefix = 'id') { return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`; }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function verifyPassword(password, salt, expected) {
  try {
    const actual = crypto.scryptSync(password, salt, 64);
    const exp = Buffer.from(expected, 'hex');
    return exp.length === actual.length && crypto.timingSafeEqual(exp, actual);
  } catch { return false; }
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
  const pass = () => hashPassword('12345678');
  const ownerPass = pass(), managerPass = pass(), supervisorPass = pass(), workerPass = pass();
  const ownerId = 'usr_demo_owner';
  const managerId = 'usr_demo_manager';
  const supervisorId = 'usr_demo_supervisor';
  const workerId = 'usr_demo_worker';
  const created = now();
  return {
    version: 2,
    users: [
      { id: ownerId, fullName: 'ธนกฤต ศุภทรัพย์', phone: '0800000000', role: 'owner', passwordSalt: ownerPass.salt, passwordHash: ownerPass.hash, createdAt: created },
      { id: managerId, fullName: 'คนดูแลสวน ตัวอย่าง', phone: '0800000002', role: 'garden_manager', passwordSalt: managerPass.salt, passwordHash: managerPass.hash, createdAt: created },
      { id: supervisorId, fullName: 'คนดูแลคนงาน ตัวอย่าง', phone: '0800000003', role: 'worker_supervisor', passwordSalt: supervisorPass.salt, passwordHash: supervisorPass.hash, createdAt: created },
      { id: workerId, fullName: 'สมจิตร เดือนอิน', phone: '0800000001', role: 'worker', passwordSalt: workerPass.salt, passwordHash: workerPass.hash, createdAt: created }
    ],
    requests: [
      { id: 'req_demo_1', ref: 'TXN-5678-RUBB', userId: workerId, category: 'ค่าน้ำมัน', amount: 2000, date: '2026-08-21', note: 'โซน A น้ำมันไม่พอ', receiptUrl: '', duplicateSuspected: false, status: 'pending', createdAt: created, updatedAt: created }
    ],
    announcements: [
      { id: 'ann_demo_1', title: 'เตรียมตัวเก็บยาง', body: 'จะเริ่มประมูลยางในวันที่ 25 สิงหาคม 2569 จะแจ้งราคาประมูลและวันเก็บให้ทราบอีกครั้ง', audience: 'all', createdBy: ownerId, createdAt: created }
    ],
    saleRounds: [
      { id: 'sale_demo_1', title: 'รอบขายยาง สิงหาคม 2569', collectionDate: '2026-08-24', saleDate: '2026-08-25', price: 58.5, note: 'ราคาตัวอย่าง', createdBy: managerId, createdAt: created, updatedAt: created }
    ],
    messages: [
      { id: 'msg_demo_1', roomId: 'main', userId: ownerId, authorName: 'ธนกฤต ศุภทรัพย์', content: 'ยินดีต้อนรับสู่ห้องสื่อสาร RubberSync', source: 'system', discordMessageId: '', createdAt: created }
    ],
    notifications: [],
    payments: [],
    settings: {
      discordInviteUrl: '',
      appName: 'RubberSync',
      version: '2.0.0',
      scheduleReminderDays: 1
    }
  };
}

function normalizeDb(raw) {
  const db = raw && typeof raw === 'object' ? raw : initialDb();
  db.version = 2;
  db.users = Array.isArray(db.users) ? db.users : [];
  db.users.forEach(u => {
    if (u.role === 'admin') u.role = 'owner';
    if (u.role === 'user') u.role = 'worker';
    if (!ROLES.includes(u.role)) u.role = 'worker';
  });
  db.requests = Array.isArray(db.requests) ? db.requests : [];
  db.requests.forEach(r => {
    if (typeof r.receiptUrl !== 'string') r.receiptUrl = '';
    if (typeof r.duplicateSuspected !== 'boolean') r.duplicateSuspected = false;
  });
  db.announcements = Array.isArray(db.announcements) ? db.announcements : [];
  db.saleRounds = Array.isArray(db.saleRounds) ? db.saleRounds : [];
  db.messages = Array.isArray(db.messages) ? db.messages : [];
  db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
  db.payments = Array.isArray(db.payments) ? db.payments : [];
  db.settings = { discordInviteUrl: '', appName: 'RubberSync', version: '2.0.0', scheduleReminderDays: 1, ...(db.settings || {}) };
  return db;
}
function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const fresh = initialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  const normalized = normalizeDb(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
  fs.writeFileSync(DB_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
}
let db = loadDb();
const passwordResetOtps = new Map();
function saveDb() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function getBody(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (Buffer.byteLength(data) > limit) { reject(new Error('payload_too_large')); req.destroy(); }
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
function safeUser(u, includeBank = false) {
  if (!u) return null;
  const result = { id: u.id, fullName: u.fullName, phone: u.phone, role: u.role, roleLabel: ROLE_LABELS[u.role] || u.role, createdAt: u.createdAt };
  if (includeBank) Object.assign(result, { bankName: u.bankName || '', bankAccountName: u.bankAccountName || '', bankAccountNumber: u.bankAccountNumber || '' });
  return result;
}
function requireAuth(req, res, roles) {
  const user = auth(req);
  if (!user) { json(res, 401, { error: 'unauthorized' }); return null; }
  if (roles && ![].concat(roles).includes(user.role)) { json(res, 403, { error: 'forbidden' }); return null; }
  return user;
}
function canManageSales(user) { return ['owner', 'garden_manager'].includes(user.role); }
function canApproveExpenses(user) { return user.role === 'owner'; }
function canViewAllExpenses(user) { return ['owner', 'garden_manager'].includes(user.role); }
function canPayExpenses(user) { return ['owner', 'garden_manager'].includes(user.role); }
function canCreateAnnouncement(user) { return ['owner', 'garden_manager'].includes(user.role); }

function requestView(r) {
  const user = db.users.find(u => u.id === r.userId);
  const payment = db.payments.find(p => p.requestId === r.id);
  return { ...r, user: safeUser(user), payment: payment || null };
}
function announcementVisible(a, user) {
  if (a.audience === 'all') return true;
  if (a.audience === 'workers') return ['worker', 'worker_supervisor'].includes(user.role);
  if (a.audience === 'managers') return ['owner', 'garden_manager'].includes(user.role);
  if (a.audience === 'owner') return user.role === 'owner';
  if (a.audience === 'admin') return ['owner', 'garden_manager'].includes(user.role);
  return false;
}
function notify({ userId = null, roles = null, title, body, type = 'info', refId = '', key = '' }) {
  if (key && db.notifications.some(n => n.key === key)) return;
  db.notifications.push({ id: id('ntf'), userId, roles: roles || [], title, body, type, refId, key, createdAt: now(), readBy: [] });
}
function notificationVisible(n, user) {
  if (n.userId) return n.userId === user.id;
  return !n.roles?.length || n.roles.includes(user.role) || n.roles.includes('all');
}
function dateInTimeZone(timeZone = APP_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function ensureScheduleNotifications() {
  const reminderDays = Number(db.settings.scheduleReminderDays ?? 1);
  const todayMs = Date.parse(`${dateInTimeZone()}T00:00:00Z`);
  for (const r of db.saleRounds) {
    for (const [kind, label, value] of [['collection', 'วันเก็บยาง', r.collectionDate], ['sale', 'วันขายยาง', r.saleDate]]) {
      if (!value) continue;
      const targetMs = Date.parse(`${value}T00:00:00Z`);
      const days = Math.round((targetMs - todayMs) / 86400000);
      if (days >= 0 && days <= reminderDays) {
        const when = days === 0 ? 'วันนี้' : `อีก ${days} วัน`;
        notify({ roles: ['all'], title: `แจ้งเตือน${label}`, body: `${r.title}: ${label}${when}`, type: 'schedule', refId: r.id, key: `schedule:${r.id}:${kind}:${value}:${days}` });
      }
    }
  }
}
function saveImageDataUrl(dataUrl, prefix) {
  if (!dataUrl) return '';
  const m = String(dataUrl).match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!m) throw new Error('invalid_image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) throw new Error('image_too_large');
  const ext = m[1] === 'image/jpeg' ? 'jpg' : m[1].split('/')[1];
  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
  return `/uploads/${filename}`;
}

function webhookIdFromUrl() {
  try {
    const m = new URL(DISCORD_WEBHOOK_URL).pathname.match(/\/api\/webhooks\/(\d+)\//);
    return m ? m[1] : '';
  } catch { return ''; }
}
async function sendDiscordMessage(content) {
  if (!DISCORD_WEBHOOK_URL) return { ok: false, configured: false };
  try {
    const u = new URL(DISCORD_WEBHOOK_URL);
    u.searchParams.set('wait', 'true');
    const resp = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    let payload = null; try { payload = await resp.json(); } catch {}
    return { ok: resp.ok, configured: true, status: resp.status, messageId: payload?.id || '' };
  } catch (e) { return { ok: false, configured: true, error: e.message }; }
}
async function syncDiscordMessages() {
  if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) return { configured: false, added: 0 };
  try {
    const resp = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(DISCORD_CHANNEL_ID)}/messages?limit=50`, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
    });
    if (!resp.ok) return { configured: true, ok: false, status: resp.status, added: 0 };
    const rows = await resp.json();
    const known = new Set(db.messages.map(m => m.discordMessageId).filter(Boolean));
    const ownWebhook = webhookIdFromUrl();
    let added = 0;
    for (const m of rows.slice().reverse()) {
      if (!m?.id || known.has(m.id)) continue;
      if (ownWebhook && String(m.webhook_id || '') === ownWebhook) continue;
      const content = String(m.content || '').trim();
      if (!content) continue;
      db.messages.push({
        id: id('msg'), roomId: 'main', userId: null,
        authorName: m.author?.global_name || m.author?.username || 'Discord',
        content: content.slice(0, 2000), source: 'discord', discordMessageId: m.id,
        createdAt: m.timestamp || now()
      });
      known.add(m.id); added++;
    }
    if (added) saveDb();
    return { configured: true, ok: true, added };
  } catch (e) { return { configured: true, ok: false, error: e.message, added: 0 }; }
}

async function handleApi(req, res, url) {
  const method = req.method;
  const p = url.pathname;

  if (p === '/api/health' && method === 'GET') return json(res, 200, { ok: true, app: 'RubberSync', time: now(), version: db.settings.version });

  if (p === '/api/auth/login' && method === 'POST') {
    const body = await getBody(req);
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    const user = db.users.find(u => u.phone === phone);
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) return json(res, 401, { error: 'invalid_credentials' });
    return json(res, 200, { token: signToken(user), user: safeUser(user) });
  }

  if (p === '/api/auth/password-reset/request' && method === 'POST') {
    const body = await getBody(req);
    const phone = String(body.phone || '').trim();
    if (!/^0\d{9}$/.test(phone)) return json(res, 400, { error: 'invalid_input' });
    const user = db.users.find(u => u.phone === phone);
    if (!user) return json(res, 404, { error: 'phone_not_found' });
    const previous = passwordResetOtps.get(phone);
    if (previous && Date.now() - previous.createdAt < 60_000) return json(res, 429, { error: 'otp_rate_limited' });
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER) {
      const form = new URLSearchParams({ To: `+66${phone.slice(1)}`, From: TWILIO_FROM_NUMBER, Body: `RubberSync: รหัสยืนยันเปลี่ยนรหัสผ่าน ${code} (หมดอายุใน 5 นาที)` });
      const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
      try {
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
        if (!response.ok) return json(res, 502, { error: 'sms_delivery_failed' });
      } catch { return json(res, 502, { error: 'sms_delivery_failed' }); }
    } else if (process.env.NODE_ENV === 'production') {
      return json(res, 503, { error: 'sms_not_configured' });
    }
    passwordResetOtps.set(phone, { code, userId: user.id, createdAt: Date.now(), attempts: 0 });
    return json(res, 200, { ok: true, ...(process.env.NODE_ENV === 'production' ? {} : { developmentCode: code }) });
  }

  if (p === '/api/auth/password-reset/confirm' && method === 'POST') {
    const body = await getBody(req);
    const phone = String(body.phone || '').trim();
    const code = String(body.code || '').trim();
    const password = String(body.password || '');
    const challenge = passwordResetOtps.get(phone);
    if (!challenge || Date.now() - challenge.createdAt > 5 * 60_000 || challenge.attempts >= 5) {
      passwordResetOtps.delete(phone);
      return json(res, 400, { error: 'invalid_or_expired_otp' });
    }
    if (!/^\d{6}$/.test(code) || password.length < 8) return json(res, 400, { error: 'invalid_input' });
    if (code !== challenge.code) { challenge.attempts++; return json(res, 400, { error: 'invalid_or_expired_otp' }); }
    const user = db.users.find(u => u.id === challenge.userId && u.phone === phone);
    if (!user) { passwordResetOtps.delete(phone); return json(res, 400, { error: 'invalid_or_expired_otp' }); }
    const hash = hashPassword(password);
    user.passwordSalt = hash.salt; user.passwordHash = hash.hash;
    saveDb(); passwordResetOtps.delete(phone);
    return json(res, 200, { ok: true });
  }

  if (p === '/api/auth/register' && method === 'POST') {
    const body = await getBody(req);
    const fullName = String(body.fullName || '').trim();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    if (fullName.length < 2 || !/^0\d{9}$/.test(phone) || password.length < 8) return json(res, 400, { error: 'invalid_input' });
    if (db.users.some(u => u.phone === phone)) return json(res, 409, { error: 'phone_exists' });
    const ph = hashPassword(password);
    const user = { id: id('usr'), fullName, phone, role: 'worker', passwordSalt: ph.salt, passwordHash: ph.hash, createdAt: now() };
    db.users.push(user); saveDb();
    return json(res, 201, { token: signToken(user), user: safeUser(user) });
  }

  if (p === '/api/me' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return json(res, 200, { user: safeUser(user, true) });
  }

  if (p === '/api/me/bank-account' && method === 'PATCH') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await getBody(req);
    const bankName = String(body.bankName || '').trim().slice(0, 80);
    const bankAccountName = String(body.bankAccountName || '').trim().slice(0, 100);
    const bankAccountNumber = String(body.bankAccountNumber || '').replace(/[\s-]/g, '');
    if (!/^\d{10,16}$/.test(bankAccountNumber) || bankName.length < 2 || bankAccountName.length < 2) return json(res, 400, { error: 'invalid_bank_account' });
    user.bankName = bankName; user.bankAccountName = bankAccountName; user.bankAccountNumber = bankAccountNumber;
    saveDb();
    return json(res, 200, { user: safeUser(user, true) });
  }

  if (p === '/api/dashboard' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    ensureScheduleNotifications(); saveDb();
    const list = canViewAllExpenses(user) ? db.requests : db.requests.filter(r => r.userId === user.id);
    const counts = { pending: 0, approved: 0, rejected: 0, paid: 0 };
    list.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const totalAmount = list.filter(r => ['approved', 'paid'].includes(r.status)).reduce((s, r) => s + Number(r.amount || 0), 0);
    const notificationCount = db.notifications.filter(n => notificationVisible(n, user) && !(n.readBy || []).includes(user.id)).length;
    return json(res, 200, {
      counts, total: list.length, totalAmount,
      announcements: db.announcements.filter(a => announcementVisible(a, user)).length,
      saleRounds: db.saleRounds.length, notificationCount,
      discordConfigured: Boolean(DISCORD_WEBHOOK_URL),
      discordInboundConfigured: Boolean(DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID)
    });
  }

  if (p === '/api/requests' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const list = canViewAllExpenses(user) ? db.requests : db.requests.filter(r => r.userId === user.id);
    return json(res, 200, { requests: list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(r => {
      const view = requestView(r);
      if (canPayExpenses(user)) {
        const recipient = db.users.find(x => x.id === r.userId);
        view.payoutAccount = recipient ? { bankName: recipient.bankName || '', accountName: recipient.bankAccountName || '', accountNumber: recipient.bankAccountNumber || '' } : null;
      }
      return view;
    }) });
  }

  if (p === '/api/requests' && method === 'POST') {
    const user = requireAuth(req, res, 'worker'); if (!user) return;
    const body = await getBody(req);
    const category = String(body.category || '').trim();
    const amount = Number(body.amount);
    const date = String(body.date || '');
    const note = String(body.note || '').trim().slice(0, 1000);
    if (!['ค่าอุปกรณ์', 'ค่าน้ำมัน', 'ค่าน้ำกรด', 'อื่นๆ'].includes(category) || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'invalid_input' });
    let receiptUrl = '';
    try { receiptUrl = saveImageDataUrl(body.receiptDataUrl, `receipt-${user.id}`); }
    catch (e) { return json(res, e.message === 'image_too_large' ? 413 : 400, { error: e.message }); }
    const duplicate = db.requests.find(r => r.userId === user.id && r.category === category && Number(r.amount) === Math.round(amount * 100) / 100 && r.date === date && r.status !== 'rejected');
    const r = {
      id: id('req'), ref: `TXN-${String(Date.now()).slice(-6)}-RUBB`, userId: user.id, category,
      amount: Math.round(amount * 100) / 100, date, note, receiptUrl,
      duplicateSuspected: Boolean(duplicate), duplicateOf: duplicate?.id || '',
      status: 'pending', createdAt: now(), updatedAt: now()
    };
    db.requests.push(r);
    notify({ roles: ['owner'], title: 'มีคำขอเบิกใหม่', body: `${user.fullName} ขอเบิก ${category} ${r.amount.toFixed(2)} บาท${r.duplicateSuspected ? ' (อาจซ้ำกับรายการเดิม)' : ''}`, type: 'expense', refId: r.id });
    saveDb();
    return json(res, 201, { request: requestView(r), duplicateSuspected: r.duplicateSuspected });
  }

  const requestStatusMatch = p.match(/^\/api\/requests\/([^/]+)\/status$/);
  if (requestStatusMatch && method === 'PATCH') {
    const owner = requireAuth(req, res, 'owner'); if (!owner) return;
    const r = db.requests.find(x => x.id === requestStatusMatch[1]);
    if (!r) return json(res, 404, { error: 'not_found' });
    const body = await getBody(req);
    if (!['approved', 'rejected'].includes(body.status)) return json(res, 400, { error: 'invalid_status' });
    r.status = body.status; r.reviewedBy = owner.id; r.reviewedAt = now(); r.updatedAt = now();
    if (body.reason) r.reviewReason = String(body.reason).slice(0, 500);
    notify({ userId: r.userId, title: 'สถานะคำขอเบิกเปลี่ยนแปลง', body: `${r.ref}: ${body.status === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ'}`, type: 'expense', refId: r.id });
    saveDb();
    return json(res, 200, { request: requestView(r) });
  }

  const requestDetailMatch = p.match(/^\/api\/requests\/([^/]+)$/);
  if (requestDetailMatch && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const r = db.requests.find(x => x.id === requestDetailMatch[1]);
    if (!r || (!canViewAllExpenses(user) && r.userId !== user.id)) return json(res, 404, { error: 'not_found' });
    return json(res, 200, { request: requestView(r) });
  }

  if (p === '/api/announcements' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const list = db.announcements.filter(a => announcementVisible(a, user));
    return json(res, 200, { announcements: list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(a => ({ ...a, author: safeUser(db.users.find(u => u.id === a.createdBy)) || { fullName: 'ระบบ' } })) });
  }

  if (p === '/api/announcements' && method === 'POST') {
    const user = requireAuth(req, res, ['owner', 'garden_manager']); if (!user) return;
    const body = await getBody(req);
    const title = String(body.title || '').trim();
    const text = String(body.body || '').trim();
    const audience = String(body.audience || 'all');
    if (title.length < 2 || text.length < 2 || !['all', 'workers', 'managers', 'owner'].includes(audience)) return json(res, 400, { error: 'invalid_input' });
    const a = { id: id('ann'), title, body: text, audience, createdBy: user.id, createdAt: now() };
    db.announcements.push(a);
    const roles = audience === 'all' ? ['all'] : audience === 'workers' ? ['worker', 'worker_supervisor'] : audience === 'managers' ? ['owner', 'garden_manager'] : ['owner'];
    notify({ roles, title: `ประกาศ: ${title}`, body: text.slice(0, 180), type: 'announcement', refId: a.id });
    saveDb();
    let discord = { ok: false, configured: Boolean(DISCORD_WEBHOOK_URL) };
    if (body.sendDiscord) discord = await sendDiscordMessage(`📢 **${title}**\n${text}`);
    return json(res, 201, { announcement: a, discord });
  }

  if (p === '/api/sale-rounds' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    ensureScheduleNotifications(); saveDb();
    return json(res, 200, { saleRounds: db.saleRounds.slice().sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || '')) });
  }

  if (p === '/api/sale-rounds' && method === 'POST') {
    const user = requireAuth(req, res, ['owner', 'garden_manager']); if (!user) return;
    const body = await getBody(req);
    const title = String(body.title || '').trim();
    const collectionDate = String(body.collectionDate || '');
    const saleDate = String(body.saleDate || '');
    const price = body.price === '' || body.price == null ? null : Number(body.price);
    const note = String(body.note || '').trim().slice(0, 1000);
    if (title.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(collectionDate) || !/^\d{4}-\d{2}-\d{2}$/.test(saleDate) || (price != null && (!Number.isFinite(price) || price < 0))) return json(res, 400, { error: 'invalid_input' });
    if (saleDate < collectionDate) return json(res, 400, { error: 'sale_before_collection' });
    const r = { id: id('sale'), title, collectionDate, saleDate, price: price == null ? null : Math.round(price * 100) / 100, note, createdBy: user.id, createdAt: now(), updatedAt: now() };
    db.saleRounds.push(r);
    notify({ roles: ['all'], title: 'เพิ่มรอบขายยาง', body: `${title}: เก็บ ${collectionDate} / ขาย ${saleDate}`, type: 'schedule', refId: r.id });
    saveDb();
    return json(res, 201, { saleRound: r });
  }

  const saleMatch = p.match(/^\/api\/sale-rounds\/([^/]+)$/);
  if (saleMatch && method === 'PATCH') {
    const user = requireAuth(req, res, ['owner', 'garden_manager']); if (!user) return;
    const r = db.saleRounds.find(x => x.id === saleMatch[1]);
    if (!r) return json(res, 404, { error: 'not_found' });
    const body = await getBody(req);
    const before = { collectionDate: r.collectionDate, saleDate: r.saleDate };
    if (typeof body.title === 'string' && body.title.trim().length >= 2) r.title = body.title.trim();
    if (typeof body.collectionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.collectionDate)) r.collectionDate = body.collectionDate;
    if (typeof body.saleDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.saleDate)) r.saleDate = body.saleDate;
    if (body.price === '' || body.price == null) r.price = null;
    else if (Number.isFinite(Number(body.price)) && Number(body.price) >= 0) r.price = Math.round(Number(body.price) * 100) / 100;
    if (typeof body.note === 'string') r.note = body.note.trim().slice(0, 1000);
    if (r.saleDate < r.collectionDate) return json(res, 400, { error: 'sale_before_collection' });
    r.updatedAt = now(); r.updatedBy = user.id;
    if (before.collectionDate !== r.collectionDate || before.saleDate !== r.saleDate) {
      notify({ roles: ['all'], title: 'กำหนดการรอบขายยางเปลี่ยนแปลง', body: `${r.title}: เก็บ ${r.collectionDate} / ขาย ${r.saleDate}`, type: 'schedule', refId: r.id });
    }
    saveDb();
    return json(res, 200, { saleRound: r });
  }

  if (p === '/api/messages' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const discordSync = await syncDiscordMessages();
    const messages = db.messages.filter(m => m.roomId === 'main').slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-100);
    return json(res, 200, { messages, discordSync });
  }

  if (p === '/api/messages' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await getBody(req);
    const content = String(body.content || '').trim();
    if (!content || content.length > 2000) return json(res, 400, { error: 'invalid_input' });
    const msg = { id: id('msg'), roomId: 'main', userId: user.id, authorName: user.fullName, content, source: 'system', discordMessageId: '', createdAt: now() };
    db.messages.push(msg); saveDb();
    const discord = await sendDiscordMessage(`**${user.fullName} (${ROLE_LABELS[user.role]})**\n${content}`);
    if (discord.messageId) { msg.discordMessageId = discord.messageId; saveDb(); }
    return json(res, 201, { message: msg, discord });
  }

  if (p === '/api/discord/inbound' && method === 'POST') {
    if (!DISCORD_INBOUND_SECRET || req.headers['x-rubbersync-secret'] !== DISCORD_INBOUND_SECRET) return json(res, 403, { error: 'forbidden' });
    const body = await getBody(req);
    const discordMessageId = String(body.discordMessageId || '').trim();
    const content = String(body.content || '').trim();
    const authorName = String(body.authorName || 'Discord').trim().slice(0, 100);
    if (!discordMessageId || !content || content.length > 2000) return json(res, 400, { error: 'invalid_input' });
    if (db.messages.some(m => m.discordMessageId === discordMessageId)) return json(res, 200, { ok: true, duplicate: true });
    const msg = { id: id('msg'), roomId: 'main', userId: null, authorName, content, source: 'discord', discordMessageId, createdAt: body.createdAt || now() };
    db.messages.push(msg); saveDb();
    return json(res, 201, { message: msg });
  }

  if (p === '/api/notifications' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    ensureScheduleNotifications(); saveDb();
    const list = db.notifications.filter(n => notificationVisible(n, user)).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json(res, 200, { notifications: list.map(n => ({ ...n, read: (n.readBy || []).includes(user.id) })) });
  }

  if (p === '/api/notifications/read-all' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    db.notifications.filter(n => notificationVisible(n, user)).forEach(n => { n.readBy = Array.isArray(n.readBy) ? n.readBy : []; if (!n.readBy.includes(user.id)) n.readBy.push(user.id); });
    saveDb();
    return json(res, 200, { ok: true });
  }

  if (p === '/api/payments' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    let list = db.payments;
    if (!canViewAllExpenses(user)) {
      const ids = new Set(db.requests.filter(r => r.userId === user.id).map(r => r.id));
      list = list.filter(p => ids.has(p.requestId));
    }
    return json(res, 200, { payments: list.map(pay => ({ ...pay, request: requestView(db.requests.find(r => r.id === pay.requestId)) })) });
  }

  const slipMatch = p.match(/^\/api\/payments\/([^/]+)\/slip$/);
  if (slipMatch && method === 'POST') {
    const user = requireAuth(req, res, ['owner', 'garden_manager']); if (!user) return;
    const r = db.requests.find(x => x.id === slipMatch[1]);
    if (!r) return json(res, 404, { error: 'not_found' });
    if (r.status !== 'approved') return json(res, 400, { error: 'request_not_approved' });
    const body = await getBody(req);
    let slipUrl = '';
    try { slipUrl = saveImageDataUrl(body.dataUrl, `payment-${r.id}`); }
    catch (e) { return json(res, e.message === 'image_too_large' ? 413 : 400, { error: e.message }); }
    let pay = db.payments.find(x => x.requestId === r.id);
    if (!pay) { pay = { id: id('pay'), requestId: r.id, adminId: user.id, createdAt: now() }; db.payments.push(pay); }
    pay.slipUrl = slipUrl; pay.note = String(body.note || '').slice(0, 500); pay.status = 'paid'; pay.paidAt = now(); pay.adminId = user.id;
    r.status = 'paid'; r.updatedAt = now();
    notify({ userId: r.userId, title: 'จ่ายเงินคำขอเบิกแล้ว', body: `${r.ref}: จ่ายเงินแล้ว`, type: 'expense', refId: r.id });
    saveDb();
    return json(res, 200, { payment: pay, request: requestView(r) });
  }

  if (p === '/api/settings' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return json(res, 200, { settings: { ...db.settings, discordWebhookConfigured: Boolean(DISCORD_WEBHOOK_URL), discordInboundConfigured: Boolean(DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID), discordChannelIdConfigured: Boolean(DISCORD_CHANNEL_ID) } });
  }

  if (p === '/api/settings' && method === 'PATCH') {
    const user = requireAuth(req, res, 'owner'); if (!user) return;
    const body = await getBody(req);
    if (typeof body.discordInviteUrl === 'string') {
      const rawInvite = body.discordInviteUrl.trim();
      if (rawInvite) {
        const normalized = /^https?:\/\//i.test(rawInvite) ? rawInvite : `https://${rawInvite}`;
        let invite;
        try { invite = new URL(normalized); } catch { return json(res, 400, { error: 'invalid_discord_url' }); }
        if (invite.protocol !== 'https:' || !['discord.gg', 'discord.com', 'www.discord.com', 'discordapp.com'].includes(invite.hostname.toLowerCase())) return json(res, 400, { error: 'invalid_discord_url' });
        db.settings.discordInviteUrl = invite.href.slice(0, 500);
      } else db.settings.discordInviteUrl = '';
    }
    if (Number.isFinite(Number(body.scheduleReminderDays))) db.settings.scheduleReminderDays = Math.min(7, Math.max(0, Number(body.scheduleReminderDays)));
    saveDb();
    return json(res, 200, { settings: { ...db.settings, discordWebhookConfigured: Boolean(DISCORD_WEBHOOK_URL), discordInboundConfigured: Boolean(DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID) } });
  }

  if (p === '/api/discord/test' && method === 'POST') {
    const user = requireAuth(req, res, ['owner', 'garden_manager']); if (!user) return;
    const result = await sendDiscordMessage('✅ RubberSync เชื่อมต่อ Discord Webhook สำเร็จ');
    return json(res, result.ok ? 200 : 400, result);
  }

  return json(res, 404, { error: 'api_not_found' });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const safeRel = path.normalize(rel).replace(/^([.][.][/\\])+/, '').replace(/^[/\\]+/, '');
  const file = path.join(PUBLIC, safeRel);
  if (!file.startsWith(PUBLIC + path.sep) && file !== PUBLIC) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      const index = path.join(PUBLIC, 'index.html');
      fs.readFile(index, (e, data) => { if (e) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(data); });
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    headers['Cache-Control'] = rel.startsWith('/uploads/') ? 'public, max-age=86400' : 'no-cache';
    fs.readFile(file, (e, data) => { if (e) { res.writeHead(500); return res.end('Read error'); } res.writeHead(200, headers); res.end(data); });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      const code = e.message === 'payload_too_large' ? 413 : e.message === 'invalid_json' ? 400 : 500;
      json(res, code, { error: e.message || 'server_error' });
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const values of Object.values(nets)) for (const n of values || []) if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  console.log('\n=============================================');
  console.log(' RubberSync Web พร้อมใช้งาน');
  console.log(` คอม:    http://localhost:${PORT}`);
  ips.forEach(ip => console.log(` มือถือ: http://${ip}:${PORT}`));
  console.log('=============================================\n');
});
