const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const app = $('#app');

const state = {
  token: localStorage.getItem('rubbersync_token') || '',
  user: null,
  view: 'home',
  settings: null,
  metrics: null,
  announcements: [],
  requests: [],
  payments: [],
  saleRounds: [],
  messages: [],
  notifications: [],
  receiptDataUrl: '',
  receiptName: ''
};

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ROLE_LABELS = {
  owner: 'เจ้าของสวน',
  garden_manager: 'คนดูแลสวน',
  worker_supervisor: 'คนดูแลคนงาน',
  worker: 'คนงานกรีดยาง'
};

function h(v = '') { return String(v).replace(/[&<>"']/g, c => ESC[c]); }
function discordInviteHref(value = '') {
  let raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && ['discord.gg', 'discord.com', 'www.discord.com', 'discordapp.com'].includes(url.hostname.toLowerCase()) ? url.href : '';
  } catch { return ''; }
}
function money(v) { return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2 }).format(Number(v || 0)); }
function dt(v) { try { return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)); } catch { return v || '-'; } }
function dateOnly(v) { try { return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(`${v}T00:00:00`)); } catch { return v || '-'; } }
function statusText(s) { return ({ pending: 'รอตรวจสอบ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', paid: 'จ่ายแล้ว' })[s] || s; }
function roleLabel(role) { return ROLE_LABELS[role] || role || '-'; }
function todayLocal() { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; }
function canManageSales() { return ['owner', 'garden_manager'].includes(state.user?.role); }
function canApprove() { return state.user?.role === 'owner'; }
function canViewAllExpenses() { return ['owner', 'garden_manager'].includes(state.user?.role); }
function canPay() { return ['owner', 'garden_manager'].includes(state.user?.role); }
function canAnnounce() { return ['owner', 'garden_manager'].includes(state.user?.role); }
function isWorker() { return state.user?.role === 'worker'; }

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
function modal(html) {
  const b = document.createElement('div');
  b.className = 'modal-backdrop';
  b.innerHTML = `<div class="modal">${html}</div>`;
  b.addEventListener('click', e => { if (e.target === b) b.remove(); });
  document.body.appendChild(b);
  return b;
}

async function api(url, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const r = await fetch(url, { ...opts, headers });
  let data = {}; try { data = await r.json(); } catch {}
  if (r.status === 401 && url !== '/api/auth/login') {
    logout(false); throw new Error('กรุณาเข้าสู่ระบบใหม่');
  }
  if (!r.ok) {
    const map = {
      invalid_credentials: 'เบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง',
      phone_exists: 'เบอร์โทรศัพท์นี้ถูกใช้แล้ว',
      phone_not_found: 'ไม่พบบัญชีที่ใช้เบอร์โทรศัพท์นี้',
      invalid_or_expired_otp: 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่',
      otp_rate_limited: 'กรุณารอ 1 นาทีก่อนขอรหัสใหม่',
      sms_not_configured: 'ระบบยังไม่ได้ตั้งค่าการส่ง SMS',
      sms_delivery_failed: 'ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      invalid_bank_account: 'กรุณากรอกชื่อธนาคาร ชื่อบัญชี และเลขบัญชีให้ถูกต้อง',
      invalid_discord_url: 'กรุณาใส่ลิงก์ Discord เช่น discord.gg/รหัสเชิญ',
      invalid_input: 'ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง',
      forbidden: 'บัญชีนี้ไม่มีสิทธิ์ใช้งานฟังก์ชันนี้',
      request_not_approved: 'รายการนี้ยังไม่ได้รับอนุมัติ',
      invalid_image: 'ไฟล์รูปไม่ถูกต้อง รองรับ PNG/JPG/WebP',
      image_too_large: 'รูปมีขนาดเกิน 5 MB',
      sale_before_collection: 'วันขายยางต้องไม่มาก่อนวันเก็บยาง'
    };
    throw new Error(map[data.error] || data.error || `เกิดข้อผิดพลาด ${r.status}`);
  }
  return data;
}

function setToken(token, user) {
  state.token = token; state.user = user;
  localStorage.setItem('rubbersync_token', token);
}
function logout(render = true) {
  state.token = ''; state.user = null;
  localStorage.removeItem('rubbersync_token');
  if (render) renderLogin();
}

function brand() {
  return `<div class="brand"><img class="brand-logo" src="/assets/rubbersync-logo-user.png" alt="RubberSync"><h1>RubberSync</h1><p>ระบบบริหารจัดการสวนยาง</p></div>`;
}
function renderLogin() {
  app.innerHTML = `<main class="auth-page"><div class="auth-wrap">${brand()}<section class="card auth-card">
    <form id="login-form">
      <div class="field"><label>เบอร์โทรศัพท์</label><input class="input" name="phone" inputmode="tel" autocomplete="username" placeholder="08xxxxxxxx" required></div>
      <div class="field"><div class="spread"><label>รหัสผ่าน</label><button class="text-link" type="button" data-action="forgot">ลืมรหัสผ่าน?</button></div><div class="password-wrap"><input id="login-password" class="input" name="password" type="password" autocomplete="current-password" placeholder="กรุณากรอกรหัสผ่าน" required><button class="password-toggle" type="button" data-action="toggle-password" data-target="login-password" aria-label="แสดงรหัสผ่าน" aria-pressed="false">แสดง</button></div></div>
      <div class="auth-actions"><button class="btn btn-primary btn-block" type="submit">เข้าสู่ระบบ</button><button class="btn btn-outline btn-block" type="button" data-action="register">สมัครสมาชิกคนงาน</button></div>
    </form>
    <div class="demo-accounts"><strong>บัญชีทดสอบ (รหัส 12345678)</strong><br>เจ้าของสวน 0800000000<br>คนดูแลสวน 0800000002<br>คนดูแลคนงาน 0800000003<br>คนงาน 0800000001</div>
  </section></div></main>`;
  $('#login-form').addEventListener('submit', onLogin);
}
async function onLogin(e) {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  try {
    const d = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone: f.get('phone'), password: f.get('password') }) });
    setToken(d.token, d.user); state.view = 'home'; await loadCore(); render();
  } catch (err) { toast(err.message, 'error'); }
}
function renderRegister() {
  app.innerHTML = `<main class="auth-page"><div class="auth-wrap"><section class="card auth-card">
    <div class="spread" style="margin-bottom:18px"><button class="text-link" data-action="login">← ย้อนกลับ</button><strong>RubberSync</strong></div>
    <h2 style="text-align:center;color:var(--primary)">สมัครบัญชีคนงานกรีดยาง</h2>
    <form id="register-form">
      <div class="field"><label>ชื่อ - นามสกุล</label><input class="input" name="fullName" required></div>
      <div class="field"><label>เบอร์โทรศัพท์</label><input class="input" name="phone" inputmode="tel" placeholder="08xxxxxxxx" required></div>
      <div class="field"><label>รหัสผ่าน</label><input class="input" name="password" type="password" minlength="8" required><div class="hint">อย่างน้อย 8 ตัวอักษร</div></div>
      <button class="btn btn-primary btn-block" type="submit">สมัครสมาชิก</button>
    </form>
  </section></div></main>`;
  $('#register-form').addEventListener('submit', async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try {
      const d = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ fullName: f.get('fullName'), phone: f.get('phone'), password: f.get('password') }) });
      setToken(d.token, d.user); await loadCore(); state.view = 'home'; render(); toast('สมัครสมาชิกสำเร็จ');
    } catch (err) { toast(err.message, 'error'); }
  });
}
let activeForgotPhone = '';
function renderForgotPassword(stage = 'phone', phone = '', devCode = '') {
  activeForgotPhone = phone;
  const phoneStep = stage === 'phone';
  app.innerHTML = `<main class="auth-page"><div class="auth-wrap"><section class="card auth-card">
    <div class="spread" style="margin-bottom:18px"><button class="text-link" data-action="login">← กลับเข้าสู่ระบบ</button><strong>RubberSync</strong></div>
    <h2 style="text-align:center;color:var(--primary)">ลืมรหัสผ่าน</h2>
    <p class="meta" style="text-align:center;margin-bottom:22px">${phoneStep ? 'ยืนยันเบอร์โทรศัพท์เพื่อเปลี่ยนรหัสผ่าน' : `กรอกรหัสยืนยันที่ส่งไปยัง ${h(phone)}`}</p>
    ${phoneStep ? `<form id="forgot-phone-form"><div class="field"><label>เบอร์โทรศัพท์ที่ใช้สมัคร</label><input class="input" name="phone" inputmode="tel" autocomplete="tel" placeholder="08xxxxxxxx" pattern="0[0-9]{9}" required></div><button class="btn btn-primary btn-block" type="submit">ส่งรหัสยืนยัน</button></form>` : `<form id="forgot-reset-form"><div class="field"><label>รหัสยืนยัน 6 หลัก</label><input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></div><div class="field"><label>รหัสผ่านใหม่</label><div class="password-wrap"><input id="reset-password" class="input" name="password" type="password" minlength="8" autocomplete="new-password" required><button class="password-toggle" type="button" data-action="toggle-password" data-target="reset-password" aria-label="แสดงรหัสผ่าน" aria-pressed="false">แสดง</button></div><div class="hint">อย่างน้อย 8 ตัวอักษร</div></div><div class="field"><label>ยืนยันรหัสผ่านใหม่</label><div class="password-wrap"><input id="reset-confirm-password" class="input" name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required><button class="password-toggle" type="button" data-action="toggle-password" data-target="reset-confirm-password" aria-label="แสดงรหัสผ่าน" aria-pressed="false">แสดง</button></div></div><button class="btn btn-primary btn-block" type="submit">เปลี่ยนรหัสผ่าน</button><button class="btn btn-outline btn-block" type="button" data-action="forgot-resend">ส่งรหัสใหม่ไปที่เบอร์เดิม</button><button class="text-link" style="display:block;margin:12px auto 0" type="button" data-action="forgot-restart">เปลี่ยนเบอร์โทรศัพท์</button><div id="dev-otp" class="hint" style="text-align:center;margin-top:12px">${devCode ? `รหัสทดสอบ (โหมดพัฒนา): <strong>${h(devCode)}</strong>` : ''}</div></form>`}
  </section></div></main>`;
  if (phoneStep) $('#forgot-phone-form').addEventListener('submit', async e => {
    e.preventDefault(); const phoneValue = String(new FormData(e.currentTarget).get('phone') || '').trim();
    try { const result = await api('/api/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ phone: phoneValue }) }); renderForgotPassword('reset', phoneValue, result.developmentCode || ''); toast('ส่งรหัสยืนยันแล้ว'); }
    catch (err) { toast(err.message, 'error'); }
  });
  else $('#forgot-reset-form').addEventListener('submit', async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const password = String(f.get('password') || '');
    if (password !== f.get('confirmPassword')) return toast('รหัสผ่านทั้งสองช่องไม่ตรงกัน', 'error');
    try { await api('/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ phone, code: f.get('code'), password }) }); renderLogin(); toast('เปลี่ยนรหัสผ่านสำเร็จ เข้าสู่ระบบด้วยรหัสผ่านใหม่'); }
    catch (err) { toast(err.message, 'error'); }
  });
}

function shell(content, active = 'home') {
  const u = state.user;
  const unread = state.metrics?.notificationCount || 0;
  return `<div class="page app-shell">
    <header class="topbar"><div class="topbar-inner"><div class="profile-mini"><div class="avatar">${h((u?.fullName || 'R').trim()[0] || 'R')}</div><div><div class="topbar-title">${h(u?.fullName || 'RubberSync')}</div><div class="meta">${h(roleLabel(u?.role))}</div></div></div><button class="text-link" data-action="refresh">รีเฟรช</button></div></header>
    <main class="content">${content}</main>
    <nav class="bottomnav"><div class="bottomnav-inner">
      <button class="nav-btn ${active === 'home' ? 'active' : ''}" data-view="home"><span class="nav-icon">⌂</span><span>หน้าหลัก</span></button>
      <button class="nav-btn ${active === 'communication' ? 'active' : ''}" data-view="communication"><span class="nav-icon">✉</span><span>สื่อสาร</span></button>
      <button class="nav-btn ${active === 'notifications' ? 'active' : ''}" data-view="notifications"><span class="nav-icon">🔔</span><span>แจ้งเตือน${unread ? ` (${unread})` : ''}</span></button>
      <button class="nav-btn ${active === 'settings' ? 'active' : ''}" data-view="settings"><span class="nav-icon">⚙</span><span>ตั้งค่า</span></button>
    </div></nav>
  </div>`;
}
function hero(title, sub) { return `<section class="hero"><h2>${h(title)}</h2><p>${h(sub)}</p></section>`; }
function actionCard(icon, title, sub, view, accent = '#3f6653') {
  return `<button class="action-card" data-view="${h(view)}" style="--accent:${accent}"><div><div class="action-icon">${icon}</div><h3>${h(title)}</h3><p>${h(sub)}</p></div></button>`;
}

async function loadCore() {
  const [d, s, a, r, p, sales, notes, me] = await Promise.all([
    api('/api/dashboard'), api('/api/settings'), api('/api/announcements'), api('/api/requests'), api('/api/payments'), api('/api/sale-rounds'), api('/api/notifications'), api('/api/me')
  ]);
  state.user = me.user;
  state.metrics = d; state.settings = s.settings; state.announcements = a.announcements;
  state.requests = r.requests; state.payments = p.payments; state.saleRounds = sales.saleRounds; state.notifications = notes.notifications;
}
function metricCards() {
  const m = state.metrics || { counts: {} };
  return `<div class="summary-grid">
    <div class="card metric"><div class="value">${m.counts?.pending || 0}</div><div class="label">รอตรวจสอบ</div></div>
    <div class="card metric"><div class="value">${m.saleRounds || 0}</div><div class="label">รอบขายยาง</div></div>
    <div class="card metric"><div class="value">${m.notificationCount || 0}</div><div class="label">แจ้งเตือนใหม่</div></div>
    <div class="card metric"><div class="value">${h(money(m.totalAmount || 0))}</div><div class="label">ยอดอนุมัติ/จ่าย</div></div>
  </div>`;
}
function renderHome() {
  const cards = [
    actionCard('💬', 'ระบบติดต่อสื่อสาร', 'สนทนาในระบบและเชื่อมโยง Discord', 'communication', '#5865f2'),
    actionCard('📅', 'รอบขายยาง', 'วันเก็บ วันขาย ราคา และกำหนดการ', 'sales', '#3f6653')
  ];
  if (isWorker()) {
    cards.push(actionCard('🧾', 'สร้างคำขอเบิก', 'บันทึกค่าใช้จ่ายและแนบหลักฐาน', 'request', '#7f5539'));
    cards.push(actionCard('≡', 'ประวัติการเบิก', 'ติดตามสถานะและดูย้อนหลัง', 'history', '#9a6b42'));
  }
  if (canViewAllExpenses()) cards.push(actionCard('✓', 'ตรวจสอบคำขอเบิก', canApprove() ? 'ตรวจหลักฐานและอนุมัติ/ไม่อนุมัติ' : 'ตรวจสอบรายการที่ได้รับอนุมัติและสถานะ', 'admin-requests', '#2e6b4b'));
  if (canPay()) cards.push(actionCard('💸', 'บันทึกการจ่ายเงิน', 'แนบสลิปหลังรายการได้รับอนุมัติ', 'payroll', '#012d1d'));
  if (canAnnounce()) cards.push(actionCard('📢', 'สร้างประกาศ', 'ส่งประกาศในระบบและเลือกส่ง Discord', 'announcement', '#936639'));
  cards.push(actionCard('🔔', 'การแจ้งเตือน', 'กำหนดการและสถานะคำขอ', 'notifications', '#b07d00'));
  app.innerHTML = shell(`${hero('ระบบบริหารจัดการสวนยาง', 'รวมการสื่อสาร รอบขายยาง และการเบิกค่าใช้จ่ายไว้ในระบบเดียว')}${metricCards()}<div class="action-grid">${cards.join('')}</div>`, 'home');
}

function renderRequest() {
  if (!isWorker()) return renderForbidden('เฉพาะคนงานกรีดยางเท่านั้นที่สร้างคำขอเบิกได้');
  app.innerHTML = shell(`${hero('สร้างคำขอเบิกค่าใช้จ่าย', 'บันทึกรายการ จำนวนเงิน วันที่ และแนบใบเสร็จหรือหลักฐาน')}
    <section class="card form-card"><form id="request-form">
      <div class="field"><label>ประเภทค่าใช้จ่าย *</label><select class="select" name="category" required>${['ค่าอุปกรณ์', 'ค่าน้ำมัน', 'ค่าน้ำกรด', 'อื่นๆ'].map(x => `<option>${x}</option>`).join('')}</select></div>
      <div class="field"><label>จำนวนเงิน *</label><input class="input" name="amount" type="number" min="0.01" step="0.01" required></div>
      <div class="field"><label>วันที่เกิดค่าใช้จ่าย *</label><input class="input" name="date" type="date" value="${todayLocal()}" required></div>
      <div class="field"><label>รายละเอียด</label><textarea class="textarea" name="note" placeholder="เช่น น้ำมันสำหรับตัดหญ้าโซน A"></textarea></div>
      <div class="field"><label>ใบเสร็จ / หลักฐาน (ถ้ามี)</label><div class="file-box"><input id="receipt-file" type="file" accept="image/png,image/jpeg,image/webp"><div id="receipt-name" class="hint">รองรับ PNG/JPG/WebP ไม่เกิน 5 MB</div><img id="receipt-preview" class="file-preview hidden" alt="ตัวอย่างหลักฐาน"></div></div>
      <button class="btn btn-primary btn-block" type="submit">ส่งคำขอเบิก</button>
    </form></section>`, 'home');
  state.receiptDataUrl = ''; state.receiptName = '';
  $('#receipt-file').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { e.target.value = ''; toast('รูปมีขนาดเกิน 5 MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => { state.receiptDataUrl = reader.result; state.receiptName = file.name; $('#receipt-name').textContent = file.name; const im = $('#receipt-preview'); im.src = reader.result; im.classList.remove('hidden'); };
    reader.readAsDataURL(file);
  });
  $('#request-form').addEventListener('submit', submitRequest);
}
async function submitRequest(e) {
  e.preventDefault(); const f = new FormData(e.currentTarget);
  try {
    const d = await api('/api/requests', { method: 'POST', body: JSON.stringify({ category: f.get('category'), amount: Number(f.get('amount')), date: f.get('date'), note: f.get('note'), receiptDataUrl: state.receiptDataUrl }) });
    await loadCore();
    modal(`<div style="text-align:center"><div class="success-mark">✓</div><h3>ส่งคำขอสำเร็จ</h3><p>รหัสอ้างอิง <strong>${h(d.request.ref)}</strong></p>${d.duplicateSuspected ? '<div class="warning-box">ระบบพบว่ารายการนี้อาจซ้ำกับรายการเดิม ผู้อนุมัติจะเห็นคำเตือนนี้</div>' : ''}<div class="modal-actions"><button class="btn btn-primary" data-view="history">ดูสถานะ</button><button class="btn btn-outline" data-view="home">หน้าหลัก</button></div></div>`);
  } catch (err) { toast(err.message, 'error'); }
}
function requestCard(r, admin = false) {
  return `<article class="card request-item">
    <div class="request-head"><div><span class="status ${r.status}">${statusText(r.status)}</span>${r.duplicateSuspected ? '<span class="status warning">อาจซ้ำ</span>' : ''}<h4>${h(r.category)}</h4><div class="meta">${h(r.ref)} · ${h(dateOnly(r.date))}</div><div class="meta">${h(r.user?.fullName || '')}</div></div><div class="amount">${h(money(r.amount))}</div></div>
    ${r.note ? `<p class="muted">${h(r.note)}</p>` : ''}
    <div class="evidence-links">${r.receiptUrl ? `<a class="text-link" href="${h(r.receiptUrl)}" target="_blank" rel="noopener">ดูใบเสร็จ/หลักฐาน</a>` : '<span class="muted">ไม่มีไฟล์หลักฐาน</span>'}${r.payment?.slipUrl ? `<a class="text-link" href="${h(r.payment.slipUrl)}" target="_blank" rel="noopener">ดูสลิปการจ่ายเงิน</a>` : ''}</div>
    ${admin && r.status === 'pending' && canApprove() ? `<div class="request-actions"><button class="btn btn-danger" data-reject="${r.id}">ไม่อนุมัติ</button><button class="btn btn-success" data-approve="${r.id}">อนุมัติ</button></div>` : ''}
  </article>`;
}
function renderHistory() {
  app.innerHTML = shell(`${hero('ประวัติการเบิกค่าใช้จ่าย', 'ตรวจสอบสถานะและหลักฐานย้อนหลัง')}<div class="section-title"><h3>รายการของฉัน</h3>${isWorker() ? '<button class="btn btn-primary" data-view="request">+ สร้างคำขอ</button>' : ''}</div><div class="list">${state.requests.length ? state.requests.map(r => requestCard(r)).join('') : '<div class="card empty">ยังไม่มีรายการ</div>'}</div>`, 'home');
}
function renderAdminRequests() {
  if (!canViewAllExpenses()) return renderForbidden('ไม่มีสิทธิ์ดูรายการเบิกทั้งหมด');
  const pending = state.requests.filter(r => r.status === 'pending');
  const done = state.requests.filter(r => r.status !== 'pending');
  app.innerHTML = shell(`${hero('ตรวจสอบรายการเบิกค่าใช้จ่าย', canApprove() ? 'เจ้าของสวนสามารถอนุมัติหรือไม่อนุมัติรายการได้' : 'คนดูแลสวนสามารถตรวจสอบรายการและดำเนินการจ่ายหลังอนุมัติ')}
    <div class="section-title"><h3>รอตรวจสอบ</h3><span class="status pending">${pending.length} รายการ</span></div><div class="list">${pending.length ? pending.map(r => requestCard(r, true)).join('') : '<div class="card empty">ไม่มีคำขอรอตรวจสอบ</div>'}</div>
    <div class="section-title section-gap"><h3>ประวัติรายการ</h3></div><div class="list">${done.length ? done.map(r => requestCard(r, true)).join('') : '<div class="card empty">ยังไม่มีประวัติ</div>'}</div>`, 'home');
}
async function updateStatus(id, status) {
  try {
    await api(`/api/requests/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    document.querySelector('.modal-backdrop')?.remove(); await loadCore(); renderAdminRequests(); toast(status === 'approved' ? 'อนุมัติรายการแล้ว' : 'ไม่อนุมัติรายการแล้ว');
  } catch (e) { toast(e.message, 'error'); }
}

function renderPayroll() {
  if (!canPay()) return renderForbidden('ไม่มีสิทธิ์บันทึกการจ่ายเงิน');
  const approved = state.requests.filter(r => r.status === 'approved');
  const paid = state.requests.filter(r => r.status === 'paid');
  app.innerHTML = shell(`${hero('บันทึกการจ่ายเงิน', 'หลังรายการได้รับอนุมัติ ให้แนบสลิปหรือหลักฐานการโอน')}
    <div class="section-title"><h3>รายการรอจ่าย</h3><span class="status pending">${approved.length} รายการ</span></div>
    <div class="list">${approved.length ? approved.map(r => `<article class="card payment-item"><div class="payment-head"><div><h4>${h(r.user?.fullName || '-')}</h4><div class="meta">${h(r.category)} · ${h(r.ref)}</div><div class="payee-bank">${r.payoutAccount?.accountNumber ? `${h(r.payoutAccount.bankName)} · ${h(r.payoutAccount.accountName)}<br><strong>เลขบัญชี ${h(r.payoutAccount.accountNumber)}</strong>` : '<span class="missing-bank">ยังไม่ได้กรอกข้อมูลบัญชีผู้รับ</span>'}</div></div><div class="amount">${h(money(r.amount))}</div></div><div class="request-actions"><button class="btn btn-primary" data-pay="${r.id}">บันทึกการจ่ายเงิน</button></div></article>`).join('') : '<div class="card empty">ไม่มีรายการรอจ่าย</div>'}</div>
    <div class="section-title section-gap"><h3>จ่ายแล้ว</h3></div><div class="list">${paid.length ? paid.map(r => requestCard(r, true)).join('') : '<div class="card empty">ยังไม่มีประวัติการจ่าย</div>'}</div>`, 'home');
}
function openPay(id) {
  const r = state.requests.find(x => x.id === id); if (!r) return;
  const account = r.payoutAccount;
  const accountHtml = account?.accountNumber ? `<div class="setting-row"><span>ธนาคาร</span><strong>${h(account.bankName)}</strong></div><div class="setting-row"><span>ชื่อบัญชี</span><strong>${h(account.accountName)}</strong></div><div class="setting-row"><span>เลขบัญชี</span><strong>${h(account.accountNumber)}</strong></div>` : '<div class="warning-box">ผู้รับยังไม่ได้บันทึกเลขบัญชี กรุณาติดต่อผู้รับก่อนโอนเงิน</div>';
  const m = modal(`<h3>บันทึกการจ่ายเงิน</h3><div class="setting-row"><span>ผู้รับเงิน</span><strong>${h(r.user?.fullName || '-')}</strong></div>${accountHtml}<div class="setting-row"><span>ยอดเงิน</span><strong>${h(money(r.amount))}</strong></div><form id="pay-form"><div class="field"><label>สลิปการโอน *</label><div class="file-box"><input id="slip-file" type="file" accept="image/png,image/jpeg,image/webp" required><div class="hint">แนบภาพเพื่อยืนยันการจ่ายเงิน รองรับ PNG/JPG/WebP ไม่เกิน 5 MB</div><img id="slip-preview" class="file-preview hidden" alt="ตัวอย่างสลิป"></div></div><div class="field"><label>หมายเหตุ</label><textarea class="textarea" name="note"></textarea></div><button class="btn btn-primary btn-block" type="submit">ยืนยันการจ่ายเงินพร้อมสลิป</button></form>`);
  let dataUrl = '';
  $('#slip-file', m).addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { e.target.value = ''; toast('รูปมีขนาดเกิน 5 MB', 'error'); return; }
    const reader = new FileReader(); reader.onload = () => { dataUrl = reader.result; const im = $('#slip-preview', m); im.src = dataUrl; im.classList.remove('hidden'); }; reader.readAsDataURL(file);
  });
  $('#pay-form', m).addEventListener('submit', async e => {
    e.preventDefault(); if (!dataUrl) return toast('กรุณาเลือกสลิป', 'error');
    const f = new FormData(e.currentTarget);
    try { await api(`/api/payments/${id}/slip`, { method: 'POST', body: JSON.stringify({ dataUrl, note: f.get('note') }) }); m.remove(); await loadCore(); renderPayroll(); toast('บันทึกการจ่ายเงินสำเร็จ'); } catch (err) { toast(err.message, 'error'); }
  });
}

function saleCard(r) {
  return `<article class="card sale-card"><div class="sale-head"><div><span class="status approved">รอบขายยาง</span><h4>${h(r.title)}</h4></div>${r.price == null ? '' : `<div class="price-chip">${h(Number(r.price).toFixed(2))} บาท</div>`}</div><div class="sale-dates"><div><span>วันเก็บยาง</span><strong>${h(dateOnly(r.collectionDate))}</strong></div><div><span>วันขายยาง</span><strong>${h(dateOnly(r.saleDate))}</strong></div></div>${r.note ? `<p class="muted">${h(r.note)}</p>` : ''}${canManageSales() ? `<div class="request-actions"><button class="btn btn-outline" data-edit-sale="${r.id}">แก้ไขกำหนดการ</button></div>` : ''}</article>`;
}
function renderSales() {
  app.innerHTML = shell(`${hero('รอบขายยางและกำหนดการ', 'แยกวันเก็บ วันขาย และราคายางออกจากข้อความสนทนา')}
    ${canManageSales() ? '<div class="section-title"><h3>รายการรอบขาย</h3><button class="btn btn-primary" data-action="new-sale">+ เพิ่มรอบขาย</button></div>' : '<div class="section-title"><h3>รายการรอบขาย</h3></div>'}
    <div class="list">${state.saleRounds.length ? state.saleRounds.map(saleCard).join('') : '<div class="card empty">ยังไม่มีข้อมูลรอบขายยาง</div>'}</div>`, 'home');
}
function openSaleForm(existing = null) {
  const r = existing || { title: '', collectionDate: '', saleDate: '', price: '', note: '' };
  const m = modal(`<h3>${existing ? 'แก้ไขรอบขายยาง' : 'เพิ่มรอบขายยาง'}</h3><form id="sale-form"><div class="field"><label>ชื่อรอบ *</label><input class="input" name="title" value="${h(r.title)}" required></div><div class="field"><label>วันเก็บยาง *</label><input class="input" name="collectionDate" type="date" value="${h(r.collectionDate)}" required></div><div class="field"><label>วันขายยาง *</label><input class="input" name="saleDate" type="date" value="${h(r.saleDate)}" required></div><div class="field"><label>ราคายาง/ราคาประมูล (บาท)</label><input class="input" name="price" type="number" min="0" step="0.01" value="${r.price == null ? '' : h(r.price)}"></div><div class="field"><label>หมายเหตุ</label><textarea class="textarea" name="note">${h(r.note || '')}</textarea></div><button class="btn btn-primary btn-block" type="submit">บันทึก</button></form>`);
  $('#sale-form', m).addEventListener('submit', async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const payload = { title: f.get('title'), collectionDate: f.get('collectionDate'), saleDate: f.get('saleDate'), price: f.get('price'), note: f.get('note') };
    try { await api(existing ? `/api/sale-rounds/${existing.id}` : '/api/sale-rounds', { method: existing ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); m.remove(); await loadCore(); renderSales(); toast(existing ? 'แก้ไขกำหนดการแล้ว' : 'เพิ่มรอบขายยางแล้ว'); } catch (err) { toast(err.message, 'error'); }
  });
}

async function loadMessages() {
  const d = await api('/api/messages'); state.messages = d.messages; return d;
}
function renderCommunication() {
  const s = state.settings || {};
  app.innerHTML = shell(`${hero('ระบบติดต่อสื่อสาร', 'ข้อความในระบบเชื่อมโยงกับ Discord และระบุแหล่งที่มาของข้อความ')}
    <section class="card comm-status"><div><strong>Discord ส่งออก:</strong> ${s.discordWebhookConfigured ? '<span class="status approved">พร้อม</span>' : '<span class="status rejected">ยังไม่ตั้งค่า</span>'}</div><div><strong>Discord รับเข้า:</strong> ${s.discordInboundConfigured ? '<span class="status approved">พร้อม</span>' : '<span class="status pending">ต้องตั้ง Bot Token + Channel ID</span>'}</div>${discordInviteHref(s.discordInviteUrl) ? `<a class="btn btn-discord" href="${h(discordInviteHref(s.discordInviteUrl))}" target="_blank" rel="noopener noreferrer">เปิด Discord</a>` : ''}</section>
    <section class="card chat-card"><div id="message-list" class="message-list">${state.messages.length ? state.messages.map(messageBubble).join('') : '<div class="empty">ยังไม่มีข้อความ</div>'}</div><form id="message-form" class="message-form"><textarea class="textarea" name="content" maxlength="2000" placeholder="พิมพ์ข้อความถึงผู้เกี่ยวข้อง..." required></textarea><button class="btn btn-primary" type="submit">ส่งข้อความ</button></form></section>
    <div class="section-title section-gap"><h3>ประกาศล่าสุด</h3>${canAnnounce() ? '<button class="btn btn-outline" data-view="announcement">+ ประกาศ</button>' : ''}</div><div class="list">${state.announcements.length ? state.announcements.map(announcementCard).join('') : '<div class="card empty">ยังไม่มีประกาศ</div>'}</div>`, 'communication');
  const list = $('#message-list'); if (list) list.scrollTop = list.scrollHeight;
  $('#message-form').addEventListener('submit', async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const content = String(f.get('content') || '').trim(); if (!content) return;
    try { const d = await api('/api/messages', { method: 'POST', body: JSON.stringify({ content }) }); e.currentTarget.reset(); await loadMessages(); renderCommunication(); toast(d.discord?.ok ? 'ส่งในระบบและ Discord แล้ว' : 'ส่งในระบบแล้ว'); } catch (err) { toast(err.message, 'error'); }
  });
}
function messageBubble(m) {
  const mine = m.userId && m.userId === state.user?.id;
  return `<div class="message ${mine ? 'mine' : ''}"><div class="message-meta"><strong>${h(m.authorName || 'ระบบ')}</strong><span class="source ${m.source}">${m.source === 'discord' ? 'Discord' : 'RubberSync'}</span><span>${h(dt(m.createdAt))}</span></div><div class="message-body">${h(m.content).replace(/\n/g, '<br>')}</div></div>`;
}
function announcementCard(a) {
  const audience = ({ all: 'ทุกคน', workers: 'คนงาน', managers: 'ผู้ดูแล', owner: 'เจ้าของสวน' })[a.audience] || a.audience;
  return `<article class="card announcement-item"><span class="status approved">${h(audience)}</span><h4>${h(a.title)}</h4><p>${h(a.body)}</p><div class="announcement-author">โดย ${h(a.author?.fullName || 'ระบบ')} · ${h(dt(a.createdAt))}</div></article>`;
}
function renderAnnouncement() {
  if (!canAnnounce()) return renderForbidden('ไม่มีสิทธิ์สร้างประกาศ');
  app.innerHTML = shell(`${hero('สร้างประกาศ', 'ประกาศจะแสดงในระบบ และสามารถเลือกส่งไป Discord ได้')}
    <section class="card form-card"><form id="announce-form"><div class="field"><label>กลุ่มเป้าหมาย *</label><select class="select" name="audience"><option value="all">ทุกคน</option><option value="workers">คนงานและคนดูแลคนงาน</option><option value="managers">เจ้าของสวนและคนดูแลสวน</option><option value="owner">เจ้าของสวน</option></select></div><div class="field"><label>หัวข้อ *</label><input class="input" name="title" required></div><div class="field"><label>รายละเอียด *</label><textarea class="textarea" name="body" required></textarea></div><label class="remember"><input type="checkbox" name="sendDiscord"> ส่งประกาศไป Discord ด้วย</label><button class="btn btn-primary btn-block" type="submit">สร้างประกาศ</button></form></section>`, 'communication');
  $('#announce-form').addEventListener('submit', async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try { const d = await api('/api/announcements', { method: 'POST', body: JSON.stringify({ audience: f.get('audience'), title: f.get('title'), body: f.get('body'), sendDiscord: f.get('sendDiscord') === 'on' }) }); await loadCore(); state.view = 'communication'; renderCommunication(); toast(d.discord?.ok ? 'สร้างประกาศและส่ง Discord แล้ว' : 'สร้างประกาศสำเร็จ'); } catch (err) { toast(err.message, 'error'); }
  });
}

function renderNotifications() {
  const unread = state.notifications.filter(n => !n.read).length;
  app.innerHTML = shell(`${hero('การแจ้งเตือน', 'กำหนดการรอบขายยาง การเปลี่ยนแปลง และสถานะคำขอเบิก')}
    <div class="section-title"><h3>รายการแจ้งเตือน</h3>${unread ? '<button class="btn btn-outline" data-action="read-all">อ่านทั้งหมด</button>' : ''}</div>
    <div class="list">${state.notifications.length ? state.notifications.map(n => `<article class="card notification-item ${n.read ? '' : 'unread'}"><div class="spread"><strong>${h(n.title)}</strong>${n.read ? '<span class="meta">อ่านแล้ว</span>' : '<span class="status pending">ใหม่</span>'}</div><p>${h(n.body)}</p><div class="meta">${h(dt(n.createdAt))}</div></article>`).join('') : '<div class="card empty">ยังไม่มีการแจ้งเตือน</div>'}</div>`, 'notifications');
}

function renderSettings() {
  const s = state.settings || {};
  const owner = state.user.role === 'owner';
  app.innerHTML = shell(`${hero('ตั้งค่า', 'ข้อมูลบัญชีและสถานะการเชื่อมต่อ')}
    <div class="settings-grid"><section class="card settings-card"><h3>บัญชี</h3><div class="setting-row"><span>ชื่อ</span><strong>${h(state.user.fullName)}</strong></div><div class="setting-row"><span>เบอร์โทร</span><strong>${h(state.user.phone)}</strong></div><div class="setting-row"><span>บทบาท</span><strong>${h(roleLabel(state.user.role))}</strong></div></section>
    <section class="card settings-card"><h3>บัญชีรับเงิน</h3><form id="bank-account-form"><div class="setting-row field-stack"><label>ธนาคาร</label><input class="input" name="bankName" value="${h(state.user.bankName || '')}" placeholder="เช่น ธนาคาร..." required></div><div class="setting-row field-stack"><label>ชื่อบัญชี</label><input class="input" name="bankAccountName" value="${h(state.user.bankAccountName || '')}" required></div><div class="setting-row field-stack"><label>เลขบัญชี</label><input class="input" name="bankAccountNumber" value="${h(state.user.bankAccountNumber || '')}" inputmode="numeric" pattern="[0-9 -]{10,20}" required></div><div class="setting-row"><button class="btn btn-primary btn-block" type="submit">บันทึกบัญชีรับเงิน</button></div><div class="hint" style="padding:0 18px 14px">ข้อมูลบัญชีจะแสดงให้เจ้าของสวนและผู้ดูแลสวนในหน้าบันทึกการจ่ายเงิน</div></form></section>
    <section class="card settings-card"><h3>Discord</h3><div class="setting-row"><span>ส่งข้อความจากระบบ</span><span class="status ${s.discordWebhookConfigured ? 'approved' : 'rejected'}">${s.discordWebhookConfigured ? 'พร้อม' : 'ยังไม่ตั้งค่า'}</span></div><div class="setting-row"><span>รับข้อความจาก Discord</span><span class="status ${s.discordInboundConfigured ? 'approved' : 'pending'}">${s.discordInboundConfigured ? 'พร้อม' : 'ยังไม่ครบ'}</span></div>${canAnnounce() ? '<div class="setting-row"><button class="btn btn-discord btn-block" data-action="discord-test">ทดสอบ Webhook</button></div>' : ''}</section>
    ${owner ? `<section class="card settings-card"><h3>ตั้งค่าระบบ</h3><form id="settings-form"><div class="setting-row field-stack"><label>ลิงก์ Discord Community</label><input class="input" name="discordInviteUrl" value="${h(s.discordInviteUrl || '')}" placeholder="https://discord.gg/..." autocomplete="url"></div><div class="setting-row field-stack"><label>แจ้งเตือนก่อนกำหนด (วัน)</label><input class="input" name="scheduleReminderDays" type="number" min="0" max="7" value="${h(s.scheduleReminderDays ?? 1)}"></div><div class="setting-row"><button class="btn btn-primary btn-block" type="submit">บันทึกการตั้งค่า</button></div></form>${discordInviteHref(s.discordInviteUrl) ? `<div class="setting-row"><a class="btn btn-discord btn-block" href="${h(discordInviteHref(s.discordInviteUrl))}" target="_blank" rel="noopener noreferrer">เปิด Discord Community ↗</a></div>` : ''}</section>` : ''}
    <section class="card settings-card"><h3>ระบบ</h3><div class="setting-row"><span>เวอร์ชัน</span><strong>${h(s.version || '2.0.0')}</strong></div><div class="setting-row"><button class="btn btn-danger btn-block" data-action="logout">ออกจากระบบ</button></div></section></div>`, 'settings');
  if (owner) $('#settings-form').addEventListener('submit', async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try { const d = await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ discordInviteUrl: f.get('discordInviteUrl'), scheduleReminderDays: Number(f.get('scheduleReminderDays')) }) }); state.settings = d.settings; toast('บันทึกการตั้งค่าแล้ว'); renderSettings(); } catch (err) { toast(err.message, 'error'); }
  });
  $('#bank-account-form').addEventListener('submit', async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try { const d = await api('/api/me/bank-account', { method: 'PATCH', body: JSON.stringify({ bankName: f.get('bankName'), bankAccountName: f.get('bankAccountName'), bankAccountNumber: f.get('bankAccountNumber') }) }); state.user = d.user; toast('บันทึกบัญชีรับเงินแล้ว'); renderSettings(); }
    catch (err) { toast(err.message, 'error'); }
  });
}
function renderForbidden(message) {
  app.innerHTML = shell(`${hero('ไม่มีสิทธิ์ใช้งาน', message)}<div class="card empty"><button class="btn btn-primary" data-view="home">กลับหน้าหลัก</button></div>`, 'home');
}

function render() {
  if (!state.user) return renderLogin();
  const map = { home: renderHome, request: renderRequest, history: renderHistory, 'admin-requests': renderAdminRequests, payroll: renderPayroll, sales: renderSales, communication: renderCommunication, announcement: renderAnnouncement, notifications: renderNotifications, settings: renderSettings };
  (map[state.view] || renderHome)();
}
async function navigate(v) {
  state.view = v;
  try {
    if (v === 'communication') { await Promise.all([loadCore(), loadMessages()]); }
    else await loadCore();
  } catch (e) { toast(e.message, 'error'); }
  render(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('click', async e => {
  const view = e.target.closest('[data-view]')?.dataset.view;
  if (view) { e.preventDefault(); document.querySelector('.modal-backdrop')?.remove(); return navigate(view); }
  const act = e.target.closest('[data-action]')?.dataset.action;
  if (act === 'register') return renderRegister();
  if (act === 'login') return renderLogin();
  if (act === 'forgot') return renderForgotPassword();
  if (act === 'forgot-restart') return renderForgotPassword();
  if (act === 'forgot-resend') {
    const phone = activeForgotPhone;
    if (!phone) return toast('ไม่พบเบอร์โทรศัพท์ กรุณาเริ่มใหม่', 'error');
    try {
      const result = await api('/api/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ phone }) });
      const line = $('#dev-otp'); if (line) line.innerHTML = result.developmentCode ? `รหัสทดสอบ (โหมดพัฒนา): <strong>${h(result.developmentCode)}</strong>` : '';
      toast('ส่งรหัสยืนยันใหม่แล้ว');
    } catch (err) { toast(err.message, 'error'); }
    return;
  }
  if (act === 'toggle-password') {
    const btn = e.target.closest('[data-target]'); const input = document.getElementById(btn?.dataset.target);
    if (!input) return;
    const show = input.type === 'password'; input.type = show ? 'text' : 'password';
    btn.textContent = show ? 'ซ่อน' : 'แสดง'; btn.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'); btn.setAttribute('aria-pressed', String(show));
    return;
  }
  if (act === 'logout') return logout();
  if (act === 'refresh') { try { if (state.view === 'communication') await loadMessages(); await loadCore(); render(); toast('อัปเดตข้อมูลแล้ว'); } catch (err) { toast(err.message, 'error'); } return; }
  if (act === 'discord-test') { try { const d = await api('/api/discord/test', { method: 'POST', body: '{}' }); toast(d.ok ? 'Discord Webhook ใช้งานได้' : 'Discord Webhook ยังไม่พร้อม'); } catch (err) { toast(err.message, 'error'); } return; }
  if (act === 'new-sale') return openSaleForm();
  if (act === 'read-all') { try { await api('/api/notifications/read-all', { method: 'POST', body: '{}' }); await loadCore(); renderNotifications(); } catch (err) { toast(err.message, 'error'); } return; }

  const approve = e.target.closest('[data-approve]')?.dataset.approve; if (approve) return updateStatus(approve, 'approved');
  const reject = e.target.closest('[data-reject]')?.dataset.reject;
  if (reject) {
    modal(`<h3>ยืนยันไม่อนุมัติ</h3><p>ต้องการไม่อนุมัติรายการนี้หรือไม่?</p><div class="modal-actions"><button class="btn btn-outline" data-action="close-modal">ยกเลิก</button><button class="btn btn-danger" data-confirm-reject="${reject}">ยืนยัน</button></div>`); return;
  }
  const cr = e.target.closest('[data-confirm-reject]')?.dataset.confirmReject; if (cr) return updateStatus(cr, 'rejected');
  if (act === 'close-modal') return e.target.closest('.modal-backdrop')?.remove();
  const pay = e.target.closest('[data-pay]')?.dataset.pay; if (pay) return openPay(pay);
  const editSale = e.target.closest('[data-edit-sale]')?.dataset.editSale; if (editSale) return openSaleForm(state.saleRounds.find(x => x.id === editSale));
});

(async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (!state.token) return renderLogin();
  try {
    const me = await api('/api/me'); state.user = me.user; await loadCore(); render();
  } catch { renderLogin(); }
})();
