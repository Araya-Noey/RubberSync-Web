const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const app = $('#app');
const state = {
  token: localStorage.getItem('rubbersync_token') || '',
  user: null,
  view: 'home',
  audience: 'all',
  requestStep: 1,
  requestDraft: { category:'ค่าน้ำมัน', amount:'', date:new Date().toISOString().slice(0,10), note:'' },
  settings: null,
  metrics: null,
  announcements: [],
  requests: [],
  payments: [],
};

const ESC = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function h(v=''){ return String(v).replace(/[&<>"']/g,c=>ESC[c]); }
function money(v){ return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',minimumFractionDigits:2}).format(Number(v||0)); }
function dt(v){ try{return new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}catch{return v||'-';} }
function dateOnly(v){ try{return new Intl.DateTimeFormat('th-TH',{dateStyle:'medium'}).format(new Date(v+'T00:00:00'));}catch{return v||'-';} }
function statusText(s){ return ({pending:'รอตรวจสอบ',approved:'อนุมัติแล้ว',rejected:'ไม่อนุมัติ',paid:'จ่ายแล้ว'})[s]||s; }
function toast(msg,type=''){ const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=msg; $('#toast-root').appendChild(el); setTimeout(()=>el.remove(),2800); }
function modal(html){ const b=document.createElement('div'); b.className='modal-backdrop'; b.innerHTML=`<div class="modal">${html}</div>`; b.addEventListener('click',e=>{if(e.target===b)b.remove()}); document.body.appendChild(b); return b; }

async function api(url, opts={}){
  const headers = {'Content-Type':'application/json', ...(opts.headers||{})};
  if(state.token) headers.Authorization=`Bearer ${state.token}`;
  const r = await fetch(url,{...opts,headers});
  let data={}; try{data=await r.json()}catch{}
  if(r.status===401 && url!='/api/auth/login'){ logout(false); throw new Error('กรุณาเข้าสู่ระบบใหม่'); }
  if(!r.ok){
    const map={invalid_credentials:'เบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง',phone_exists:'เบอร์โทรศัพท์นี้ถูกใช้แล้ว',invalid_input:'ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง',forbidden:'ไม่มีสิทธิ์ใช้งาน',users_only:'ฟังก์ชันนี้สำหรับผู้ใช้ทั่วไป',request_not_approved:'รายการนี้ยังไม่ได้รับอนุมัติ',invalid_image:'ไฟล์สลิปไม่ถูกต้อง',image_too_large:'รูปใหญ่เกิน 5 MB'};
    throw new Error(map[data.error]||data.error||`เกิดข้อผิดพลาด ${r.status}`);
  }
  return data;
}

function setToken(token,user){ state.token=token; state.user=user; localStorage.setItem('rubbersync_token',token); }
function logout(render=true){ state.token=''; state.user=null; localStorage.removeItem('rubbersync_token'); if(render) renderLogin(); }

function brand(){ return `<div class="brand"><img class="brand-logo" src="/assets/rubbersync-logo-user.png" alt="RubberSync"><h1>RubberSync</h1><p>ระบบจัดการสวนยางพาราที่ปลอดภัย</p></div>`; }
function renderLogin(){
  app.innerHTML=`<main class="auth-page"><div class="auth-wrap">${brand()}<section class="card auth-card">
    <form id="login-form">
      <div class="field"><label>ชื่อผู้ใช้หรือเบอร์โทรศัพท์</label><input class="input" name="phone" inputmode="tel" autocomplete="username" placeholder="กรอกเบอร์โทรศัพท์" required></div>
      <div class="field"><div class="spread"><label>รหัสผ่าน</label><button class="text-link" type="button" data-action="forgot">ลืมรหัสผ่าน?</button></div><input class="input" name="password" type="password" autocomplete="current-password" placeholder="กรุณากรอกรหัสผ่าน" required></div>
      <label class="remember"><input type="checkbox" name="remember" checked> จดจำฉันในอุปกรณ์นี้</label>
      <div class="auth-actions"><button class="btn btn-primary btn-block" type="submit">เข้าสู่ระบบ</button><button class="btn btn-outline btn-block" type="button" data-action="register">สมัครสมาชิกใหม่</button></div>
    </form>
    <div style="margin-top:18px;font-size:12px;color:var(--muted);text-align:center">บัญชีทดสอบ User: 0800000001 / 12345678<br>Admin: 0800000000 / 12345678</div>
  </section></div></main>`;
  $('#login-form').addEventListener('submit', onLogin);
}
async function onLogin(e){
  e.preventDefault(); const f=new FormData(e.currentTarget);
  try{ const d=await api('/api/auth/login',{method:'POST',body:JSON.stringify({phone:f.get('phone'),password:f.get('password')})}); setToken(d.token,d.user); state.view='home'; await loadCore(); render(); }
  catch(err){toast(err.message,'error')}
}
function renderRegister(){
  app.innerHTML=`<main class="auth-page"><div class="auth-wrap"><section class="card auth-card">
    <div class="spread" style="margin-bottom:18px"><button class="text-link" data-action="login">← ย้อนกลับ</button><strong style="color:var(--primary)">RubberSync</strong></div>
    <div style="text-align:center;margin-bottom:20px"><img class="brand-logo" src="/assets/rubbersync-logo-user.png" alt=""><h2 style="color:var(--primary);margin:8px 0">สร้างบัญชีผู้ใช้</h2><p class="muted">เริ่มต้นการทำงานสวนยางพาราของคุณอย่างมีประสิทธิภาพ</p></div>
    <form id="register-form"><div class="field"><label>ชื่อ - นามสกุล</label><input class="input" name="fullName" placeholder="กรอกชื่อและนามสกุลของคุณ" required></div>
    <div class="field"><label>เบอร์โทรศัพท์</label><input class="input" name="phone" inputmode="tel" placeholder="08xxxxxxxx" required></div>
    <div class="field"><label>รหัสผ่าน</label><input class="input" name="password" type="password" minlength="8" placeholder="อย่างน้อย 8 ตัวอักษร" required><div class="hint">รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร</div></div>
    <button class="btn btn-primary btn-block" type="submit">เสร็จสิ้น</button></form>
    <div style="text-align:center;margin-top:18px">มีบัญชีผู้ใช้แล้ว? <button class="text-link" data-action="login">เข้าสู่ระบบ</button></div>
  </section></div></main>`;
  $('#register-form').addEventListener('submit', async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api('/api/auth/register',{method:'POST',body:JSON.stringify({fullName:f.get('fullName'),phone:f.get('phone'),password:f.get('password')})});setToken(d.token,d.user);await loadCore();state.view='home';render();toast('สมัครสมาชิกสำเร็จ')}catch(err){toast(err.message,'error')}});
}

function shell(content,active='home'){
  const u=state.user;
  return `<div class="page app-shell">
    <header class="topbar"><div class="topbar-inner"><div class="profile-mini"><div class="avatar">${h((u?.fullName||'R').trim()[0]||'R')}</div><div><div class="topbar-title">${h(u?.fullName||'RubberSync')}</div><div class="meta">${u?.role==='admin'?'เจ้าของสวน / ผู้ดูแล':'คนงานสวนยาง'}</div></div></div><button class="text-link" data-action="refresh">รีเฟรช</button></div></header>
    <main class="content">${content}</main>
    <nav class="bottomnav"><div class="bottomnav-inner">
      <button class="nav-btn ${active==='home'?'active':''}" data-view="home"><span class="nav-icon">⌂</span><span>หน้าหลัก</span></button>
      <button class="nav-btn ${active==='community'?'active':''}" data-view="community"><span class="nav-icon">♟</span><span>ชุมชน</span></button>
      <button class="nav-btn ${active==='settings'?'active':''}" data-view="settings"><span class="nav-icon">⚙</span><span>ตั้งค่า</span></button>
    </div></nav>
  </div>`;
}
function hero(title,sub){ return `<section class="hero"><h2>${h(title)}</h2><p>${h(sub)}</p></section>`; }
function actionCard(icon,title,sub,view,accent){ return `<button class="action-card" data-view="${view}" style="--accent:${accent}"><div><div class="action-icon">${icon}</div><h3>${h(title)}</h3><p>${h(sub)}</p></div></button>`; }

async function loadCore(){
  const [d,s,a,r,p]=await Promise.all([api('/api/dashboard'),api('/api/settings'),api('/api/announcements'),api('/api/requests'),api('/api/payments')]);
  state.metrics=d;state.settings=s.settings;state.announcements=a.announcements;state.requests=r.requests;state.payments=p.payments;
}
function metricCards(){const m=state.metrics||{counts:{},total:0,totalAmount:0};return `<div class="summary-grid"><div class="card metric"><div class="value">${m.counts?.pending||0}</div><div class="label">รอตรวจสอบ</div></div><div class="card metric"><div class="value">${m.counts?.approved||0}</div><div class="label">อนุมัติแล้ว</div></div><div class="card metric"><div class="value">${m.counts?.paid||0}</div><div class="label">จ่ายแล้ว</div></div><div class="card metric"><div class="value">${h(money(m.totalAmount||0))}</div><div class="label">ยอดอนุมัติ/จ่าย</div></div></div>`}
function renderHome(){
  const admin=state.user.role==='admin';
  const cards=admin?
    `${actionCard('▣','ตรวจสอบการร้องขอ','ตรวจสอบและอนุมัติรายการเบิกจ่าย','admin-requests','#3f6653')}${actionCard('▰','ชุมชน Discord','พูดคุยและรับการแจ้งเตือน','community','#5865f2')}${actionCard('◖','สร้างประกาศ','กระจายข่าวสารให้ทีมงานในสวน','announcement','#7f5539')}${actionCard('▤','โอนและส่งสลิป','แนบหลักฐานเพื่อยืนยันการทำรายการ','payroll','#012d1d')}`:
    `${actionCard('▣','สร้างคำขอเบิกจ่าย','สร้างคำขอเบิกจ่ายสำหรับค่าใช้จ่ายในสวน','request','#3f6653')}${actionCard('▰','ชุมชน Discord','พูดคุยและรับการแจ้งเตือน','community','#5865f2')}${actionCard('≡','ประวัติคำขอ','ติดตามสถานะรายการย้อนหลัง','history','#7f5539')}`;
  app.innerHTML=shell(`${hero('เลือกฟังก์ชันการใช้งาน','จัดการสวนยางพาราของคุณได้อย่างมีประสิทธิภาพ')}${metricCards()}<div class="action-grid ${admin?'admin-grid':''}">${cards}</div>`,'home');
}

function renderRequest(){
  const d=state.requestDraft,s=state.requestStep;
  const steps=`<div class="steps"><div class="step ${s>1?'done':s===1?'active':''}"><div class="step-dot">${s>1?'✓':'1'}</div>เลือกประเภท</div><div class="connector ${s>1?'done':''}"></div><div class="step ${s>2?'done':s===2?'active':''}"><div class="step-dot">${s>2?'✓':'2'}</div>รายละเอียด</div><div class="connector ${s>2?'done':''}"></div><div class="step ${s===3?'active':''}"><div class="step-dot">3</div>ยืนยัน</div></div>`;
  let body='';
  if(s===1){ body=`${hero('เลือกประเภทค่าใช้จ่าย','เลือกหมวดหมู่ที่ต้องการขอเบิก')}<section class="card form-card"><div class="audience-grid">${['ค่าอุปกรณ์','ค่าน้ำมัน','ค่าน้ำกรด','อื่นๆ'].map(x=>`<button class="audience-btn ${d.category===x?'active':''}" data-category="${x}">${x}</button>`).join('')}</div></section><div style="margin-top:20px"><button class="btn btn-primary btn-block" data-action="request-next">ถัดไป →</button></div>`; }
  if(s===2){ body=`${hero('กรอกรายละเอียด','โปรดระบุจำนวนและข้อมูลที่เกี่ยวข้องให้ครบถ้วน')}<section class="card form-card"><form id="request-detail-form"><div class="field"><label>หัวข้อ *</label><select class="select" name="category">${['ค่าอุปกรณ์','ค่าน้ำมัน','ค่าน้ำกรด','อื่นๆ'].map(x=>`<option ${d.category===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>จำนวนเงิน *</label><input class="input" name="amount" type="number" min="1" step="0.01" value="${h(d.amount)}" placeholder="0.00" required><div class="hint">ระบุจำนวนเงินที่ต้องการบันทึก</div></div><div class="field"><label>วันที่ *</label><input class="input" name="date" type="date" value="${h(d.date)}" required></div><div class="field"><label>หมายเหตุ</label><textarea class="textarea" name="note" placeholder="ระบุรายละเอียดเพิ่มเติม หรือหมายเหตุ (ถ้ามี)...">${h(d.note)}</textarea></div><button class="btn btn-primary btn-block" type="submit">ถัดไป →</button><button class="btn btn-outline btn-block" style="margin-top:10px" type="button" data-action="request-back">← ย้อนกลับ</button></form></section>`; }
  if(s===3){ body=`${hero('ยืนยันคำขอ','ตรวจสอบข้อมูลก่อนส่งคำขอ')}<section class="card form-card"><h3>สรุปรายการคำร้อง</h3><div class="setting-row"><span>หมวดหมู่</span><strong>${h(d.category)}</strong></div><div class="setting-row"><span>จำนวนเงิน</span><strong>${h(money(d.amount))}</strong></div><div class="setting-row"><span>วันที่</span><strong>${h(dateOnly(d.date))}</strong></div><div class="setting-row"><span>หมายเหตุ</span><strong>${h(d.note||'-')}</strong></div><button class="btn btn-primary btn-block" style="margin-top:18px" data-action="request-submit">ส่งคำขอ</button><button class="btn btn-outline btn-block" style="margin-top:10px" data-action="request-back">← ย้อนกลับ</button></section>`; }
  app.innerHTML=shell(`${steps}${body}`,'home');
  if(s===2) $('#request-detail-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);state.requestDraft={category:f.get('category'),amount:f.get('amount'),date:f.get('date'),note:f.get('note')};state.requestStep=3;renderRequest();});
}
async function submitRequest(){ try{const d=state.requestDraft;const r=await api('/api/requests',{method:'POST',body:JSON.stringify({category:d.category,amount:Number(d.amount),date:d.date,note:d.note})});state.requestStep=1;state.requestDraft={category:'ค่าน้ำมัน',amount:'',date:new Date().toISOString().slice(0,10),note:''};await loadCore();modal(`<div style="text-align:center"><div style="font-size:54px;color:var(--success)">✓</div><h3>ส่งคำร้องสำเร็จ</h3><p>รหัสอ้างอิง <strong>${h(r.request.ref)}</strong></p><p>${h(r.request.category)} · ${h(money(r.request.amount))}</p><div class="modal-actions"><button class="btn btn-primary" data-view="home">ไปที่หน้าหลัก</button><button class="btn btn-outline" data-view="history">ดูสถานะ</button></div></div>`); }catch(e){toast(e.message,'error')} }

function requestCard(r,admin=false){ return `<article class="card request-item"><div class="request-head"><div><span class="status ${r.status}">${statusText(r.status)}</span><h4>${h(r.category)}</h4><div class="meta">${h(r.ref)} · ${h(dateOnly(r.date))}</div><div class="meta">${h(r.user?.fullName||'')}</div></div><div class="amount">${h(money(r.amount))}</div></div>${r.note?`<p class="muted">${h(r.note)}</p>`:''}${admin&&r.status==='pending'?`<div class="request-actions"><button class="btn btn-danger" data-reject="${r.id}">ปฏิเสธ</button><button class="btn btn-primary" data-review="${r.id}">ตรวจสอบ</button></div>`:''}${!admin&&r.payment?.slipUrl?`<div style="margin-top:12px"><a href="${h(r.payment.slipUrl)}" target="_blank" class="text-link">ดูหลักฐานการจ่ายเงิน</a></div>`:''}</article>`; }
function renderHistory(){ const list=state.requests; app.innerHTML=shell(`${hero('ประวัติคำขอ','ติดตามสถานะคำขอเบิกจ่ายทั้งหมด')}<div class="section-title"><h3>รายการของฉัน</h3><button class="btn btn-primary" data-view="request">+ สร้างคำขอ</button></div><div class="list">${list.length?list.map(r=>requestCard(r)).join(''):`<div class="card empty">ยังไม่มีรายการ</div>`}</div>`,'home'); }
function renderAdminRequests(){ const pending=state.requests.filter(r=>r.status==='pending'), done=state.requests.filter(r=>r.status!=='pending'); app.innerHTML=shell(`${hero('รายการขอเบิกเงิน','ตรวจสอบและอนุมัติคำขอจากคนงาน')}<div class="section-title"><h3>คำขอใหม่ (รอตรวจสอบ)</h3><span class="status pending">${pending.length} รายการ</span></div><div class="list">${pending.length?pending.map(r=>requestCard(r,true)).join(''):`<div class="card empty">ไม่มีคำขอรอตรวจสอบ</div>`}</div><div class="section-title" style="margin-top:30px"><h3>รายการที่อนุมัติและยกเลิกแล้ว</h3></div><div class="list">${done.length?done.map(r=>requestCard(r,false)).join(''):`<div class="card empty">ยังไม่มีประวัติ</div>`}</div>`,'home'); }
function openReview(id){ const r=state.requests.find(x=>x.id===id); if(!r)return; const m=modal(`<h3>ตรวจสอบใบเสร็จและรายการเบิก</h3><div class="meta">รหัสอ้างอิง: ${h(r.ref)}</div><div class="setting-row"><span>ผู้ขอเบิก</span><strong>${h(r.user?.fullName||'-')}</strong></div><div class="setting-row"><span>หมวดหมู่</span><strong>${h(r.category)}</strong></div><div class="setting-row"><span>รายละเอียด</span><strong>${h(r.note||'-')}</strong></div><div class="setting-row"><span>ยอดเงินขอเบิก</span><strong>${h(money(r.amount))}</strong></div><div class="modal-actions"><button class="btn btn-danger" data-reject="${r.id}">ไม่อนุมัติ</button><button class="btn btn-success" data-approve="${r.id}">อนุมัติ</button></div>`); }
async function updateStatus(id,status){ try{await api(`/api/requests/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}); document.querySelector('.modal-backdrop')?.remove(); await loadCore(); renderAdminRequests(); toast(status==='approved'?'อนุมัติสำเร็จ':'ปฏิเสธรายการแล้ว');}catch(e){toast(e.message,'error')} }

function renderAnnouncement(){
  app.innerHTML=shell(`${hero('สร้างประกาศใหม่','ส่งข้อความแจ้งเตือนถึงทีมงานผ่านระบบและ Discord')}<section class="card form-card"><h3>♟ กลุ่มเป้าหมาย</h3><div class="audience-grid">${[['all','ทุกคน'],['workers','เฉพาะคนงานกรีดยาง'],['admin','เฉพาะผู้ดูแล/หัวหน้าคนงาน']].map(([v,t])=>`<button class="audience-btn ${state.audience===v?'active':''}" data-audience="${v}">${t}</button>`).join('')}</div></section><section class="card form-card" style="margin-top:20px"><h3>▣ เนื้อหาประกาศ</h3><form id="announce-form"><div class="field"><label>หัวข้อประกาศ *</label><input class="input" name="title" placeholder="กรอกข้อความ" required></div><div class="field"><label>รายละเอียด *</label><textarea class="textarea" name="body" placeholder="ระบุรายละเอียดที่ต้องการแจ้งให้ทราบ..." required></textarea></div><label class="remember"><input type="checkbox" name="sendDiscord"> ส่งเข้า Discord Webhook ด้วย ${state.settings?.discordWebhookConfigured?'(เชื่อมต่อแล้ว)':'(ยังไม่ได้ตั้งค่า)'}</label><button class="btn btn-primary btn-block" type="submit">ตกลง</button><button class="btn btn-brown btn-block" style="margin-top:12px" type="button" data-view="home">ยกเลิก</button></form></section>`,'home');
  $('#announce-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api('/api/announcements',{method:'POST',body:JSON.stringify({title:f.get('title'),body:f.get('body'),audience:state.audience,sendDiscord:f.get('sendDiscord')==='on'})});await loadCore();toast(d.discord?.ok?'สร้างประกาศและส่ง Discord แล้ว':'สร้างประกาศสำเร็จ');state.view='community';renderCommunity();}catch(err){toast(err.message,'error')}});
}

function renderCommunity(){ const invite=state.settings?.discordInviteUrl; const anns=state.announcements; app.innerHTML=shell(`${hero('ชุมชน RubberSync','ข่าวสาร ประกาศ และการเชื่อมต่อ Discord')}${invite?`<section class="card" style="padding:20px;margin-bottom:22px"><div class="spread"><div><h3 style="margin:0;color:var(--primary)">Discord Community</h3><div class="muted">เปิดชุมชนเพื่อพูดคุยกับทีมงาน</div></div><a class="btn btn-discord" href="${h(invite)}" target="_blank" rel="noopener">เปิด Discord</a></div></section>`:`<section class="card" style="padding:20px;margin-bottom:22px"><div class="muted">ยังไม่ได้ตั้งลิงก์ Discord Community${state.user.role==='admin'?' — ตั้งค่าได้ที่หน้า ตั้งค่า':''}</div></section>`}<div class="section-title"><h3>ประกาศล่าสุด</h3>${state.user.role==='admin'?`<button class="btn btn-primary" data-view="announcement">+ สร้างประกาศ</button>`:''}</div><div class="list">${anns.length?anns.map(a=>`<article class="card announcement-item"><span class="status approved">${a.audience==='all'?'ทุกคน':a.audience==='workers'?'คนงาน':'ผู้ดูแล'}</span><h4>${h(a.title)}</h4><p>${h(a.body)}</p><div class="announcement-author">โดย ${h(a.author?.fullName||'ระบบ')} · ${h(dt(a.createdAt))}</div></article>`).join(''):`<div class="card empty">ยังไม่มีประกาศ</div>`}</div>`,'community'); }

function renderPayroll(){ const approved=state.requests.filter(r=>r.status==='approved'), paid=state.requests.filter(r=>r.status==='paid'); app.innerHTML=shell(`${hero('Worker Payroll','โอนเงินและแนบหลักฐานการจ่าย')}<div class="section-title"><h3>รายการรอจ่าย</h3><span class="status pending">${approved.length} รายการ</span></div><div class="list">${approved.length?approved.map(r=>`<article class="card payment-item"><div class="payment-head"><div><h4>${h(r.user?.fullName||'-')}</h4><div class="meta">${h(r.category)} · ${h(r.ref)}</div></div><div class="amount">${h(money(r.amount))}</div></div><div class="request-actions"><span class="status pending">รอโอน</span><button class="btn btn-primary" data-pay="${r.id}">จ่ายเงิน</button></div></article>`).join(''):`<div class="card empty">ไม่มีรายการรอจ่าย</div>`}</div><div class="section-title" style="margin-top:30px"><h3>จ่ายแล้ว</h3></div><div class="list">${paid.length?paid.map(r=>`<article class="card payment-item"><div class="payment-head"><div><span class="status paid">จ่ายแล้ว</span><h4>${h(r.user?.fullName||'-')}</h4><div class="meta">${h(r.category)} · ${h(r.ref)}</div></div><div class="amount">${h(money(r.amount))}</div></div>${r.payment?.slipUrl?`<div style="margin-top:12px"><a class="text-link" href="${h(r.payment.slipUrl)}" target="_blank">ดูหลักฐาน</a></div>`:''}</article>`).join(''):`<div class="card empty">ยังไม่มีประวัติการจ่าย</div>`}</div>`,'home'); }
function openPay(id){ const r=state.requests.find(x=>x.id===id); if(!r)return; const m=modal(`<h3>บันทึกการเบิก</h3><div class="setting-row"><span>ผู้รับเงิน</span><strong>${h(r.user?.fullName||'-')}</strong></div><div class="setting-row"><span>ยอดเงิน</span><strong>${h(money(r.amount))}</strong></div><form id="pay-form"><div class="field"><label>แนบสลิป *</label><div class="file-box"><input id="slip-file" type="file" accept="image/png,image/jpeg,image/webp" required><img id="slip-preview" class="file-preview hidden" alt="ตัวอย่างสลิป"></div><div class="hint">PNG/JPG/WebP ไม่เกิน 5 MB</div></div><div class="field"><label>หมายเหตุ (ถ้ามี)</label><textarea class="textarea" name="note" placeholder="ระบุข้อมูลเพิ่มเติมเกี่ยวกับการโอนเงิน..."></textarea></div><button class="btn btn-primary btn-block" type="submit">ยืนยันการจ่ายเงิน</button></form>`);
  let dataUrl=''; $('#slip-file',m).addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;if(file.size>5*1024*1024){toast('รูปใหญ่เกิน 5 MB','error');e.target.value='';return;}const reader=new FileReader();reader.onload=()=>{dataUrl=reader.result;const im=$('#slip-preview',m);im.src=dataUrl;im.classList.remove('hidden')};reader.readAsDataURL(file)});
  $('#pay-form',m).addEventListener('submit',async e=>{e.preventDefault();if(!dataUrl)return toast('กรุณาเลือกสลิป','error');const f=new FormData(e.currentTarget);try{await api(`/api/payments/${id}/slip`,{method:'POST',body:JSON.stringify({dataUrl,note:f.get('note')})});m.remove();await loadCore();renderPayroll();toast('บันทึกการจ่ายเงินสำเร็จ')}catch(err){toast(err.message,'error')}});
}

function renderSettings(){ const s=state.settings||{}; const admin=state.user.role==='admin'; const push=localStorage.getItem('rubbersync_push')!=='off'; app.innerHTML=shell(`${hero('ตั้งค่า','จัดการบัญชี การแจ้งเตือน และการเชื่อมต่อ')}<div class="settings-grid"><section class="card settings-card"><h3>การตั้งค่าบัญชี</h3><div class="setting-row"><span>ข้อมูลส่วนตัว</span><strong>${h(state.user.fullName)}</strong></div><div class="setting-row"><span>เบอร์โทรศัพท์</span><strong>${h(state.user.phone)}</strong></div><div class="setting-row"><span>บทบาท</span><strong>${admin?'ผู้ดูแล':'คนงาน'}</strong></div></section><section class="card settings-card"><h3>การแจ้งเตือน</h3><div class="setting-row"><span>Push Notifications</span><button class="toggle ${push?'on':''}" data-action="toggle-push" aria-label="toggle"></button></div><div class="setting-row"><span>สถานะ Discord Webhook</span><span class="status ${s.discordWebhookConfigured?'approved':'rejected'}">${s.discordWebhookConfigured?'เชื่อมต่อแล้ว':'ยังไม่เชื่อมต่อ'}</span></div></section>${admin?`<section class="card settings-card"><h3>Discord</h3><form id="discord-settings"><div class="setting-row" style="display:block"><label style="font-weight:700">ลิงก์ชุมชน Discord</label><input class="input" name="discordInviteUrl" value="${h(s.discordInviteUrl||'')}" placeholder="https://discord.gg/..."><button class="btn btn-primary btn-block" style="margin-top:12px" type="submit">บันทึก</button><button class="btn btn-discord btn-block" style="margin-top:10px" type="button" data-action="discord-test">ทดสอบ Webhook</button></div></form></section>`:''}<section class="card settings-card"><h3>ความช่วยเหลือและข้อมูล</h3><div class="setting-row"><span>เวอร์ชัน</span><strong>${h(s.version||'1.0.0')}</strong></div><div class="setting-row"><button class="btn btn-danger btn-block" data-action="logout">ออกจากระบบ</button></div></section></div>`,'settings');
  if(admin) $('#discord-settings').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api('/api/settings',{method:'PATCH',body:JSON.stringify({discordInviteUrl:f.get('discordInviteUrl')})});state.settings=d.settings;toast('บันทึกการตั้งค่าแล้ว')}catch(err){toast(err.message,'error')}});
}

function renderReport(){ const m=state.metrics||{}; const rows=state.requests.map(r=>`<tr><td>${h(r.ref)}</td><td>${h(r.user?.fullName||'-')}</td><td>${h(r.category)}</td><td>${h(money(r.amount))}</td><td><span class="status ${r.status}">${statusText(r.status)}</span></td><td>${h(dateOnly(r.date))}</td></tr>`).join(''); app.innerHTML=shell(`${hero('รายงานภาพรวม','สรุปรายการเบิกจ่ายและสถานะ')}${metricCards()}<section class="card" style="padding:18px"><div class="table-wrap"><table class="table"><thead><tr><th>อ้างอิง</th><th>ผู้ขอ</th><th>หมวดหมู่</th><th>จำนวน</th><th>สถานะ</th><th>วันที่</th></tr></thead><tbody>${rows}</tbody></table></div></section>`,'home'); }

function render(){ if(!state.user)return renderLogin(); const map={home:renderHome,request:renderRequest,history:renderHistory,'admin-requests':renderAdminRequests,announcement:renderAnnouncement,community:renderCommunity,payroll:renderPayroll,settings:renderSettings,report:renderReport}; (map[state.view]||renderHome)(); }
async function navigate(v){ state.view=v; if(v==='request'){state.requestStep=1;} if(['home','community','settings','history','admin-requests','payroll','report'].includes(v)){ try{await loadCore();}catch(e){toast(e.message,'error')} } render(); window.scrollTo({top:0,behavior:'smooth'}); }

document.addEventListener('click',async e=>{
  const view=e.target.closest('[data-view]')?.dataset.view; if(view){e.preventDefault();document.querySelector('.modal-backdrop')?.remove();return navigate(view)}
  const act=e.target.closest('[data-action]')?.dataset.action;
  if(act==='register') return renderRegister();
  if(act==='login') return renderLogin();
  if(act==='forgot') return toast('สำหรับระบบจริงสามารถเชื่อม OTP/รีเซ็ตรหัสผ่านเพิ่มได้');
  if(act==='logout') return logout();
  if(act==='refresh'){try{await loadCore();render();toast('อัปเดตข้อมูลแล้ว')}catch(err){toast(err.message,'error')}return}
  if(act==='toggle-push'){const on=e.target.classList.toggle('on');localStorage.setItem('rubbersync_push',on?'on':'off');return}
  if(act==='discord-test'){try{const d=await api('/api/discord/test',{method:'POST',body:'{}'});toast(d.ok?'Webhook ใช้งานได้':'Webhook ยังไม่พร้อม')}catch(err){toast(err.message,'error')}return}
  if(act==='request-next'){state.requestStep=2;return renderRequest()}
  if(act==='request-back'){state.requestStep=Math.max(1,state.requestStep-1);return renderRequest()}
  if(act==='request-submit') return submitRequest();
  const cat=e.target.closest('[data-category]')?.dataset.category; if(cat){state.requestDraft.category=cat;return renderRequest()}
  const aud=e.target.closest('[data-audience]')?.dataset.audience; if(aud){state.audience=aud;return renderAnnouncement()}
  const review=e.target.closest('[data-review]')?.dataset.review; if(review)return openReview(review);
  const approve=e.target.closest('[data-approve]')?.dataset.approve; if(approve)return updateStatus(approve,'approved');
  const reject=e.target.closest('[data-reject]')?.dataset.reject; if(reject){const m=modal(`<h3>ยืนยันไม่อนุมัติรายการ</h3><p>ต้องการปฏิเสธคำขอนี้หรือไม่?</p><div class="modal-actions"><button class="btn btn-outline" data-action="close-modal">ยกเลิก</button><button class="btn btn-danger" data-confirm-reject="${reject}">ปฏิเสธ</button></div>`);return}
  const cr=e.target.closest('[data-confirm-reject]')?.dataset.confirmReject;if(cr)return updateStatus(cr,'rejected');
  if(act==='close-modal') return e.target.closest('.modal-backdrop')?.remove();
  const pay=e.target.closest('[data-pay]')?.dataset.pay;if(pay)return openPay(pay);
});


(async function init(){
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js').catch(()=>{}); }
  if(!state.token)return renderLogin();
  try{const me=await api('/api/me');state.user=me.user;await loadCore();render();}catch{renderLogin();}
})();
