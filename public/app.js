const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const app = $('#app');
const state = {
  token: localStorage.getItem('rubbersync_token') || '',
  user: null,
  view: 'home',
  viewHistory: [],
  audience: 'all',
  announcementDraft: { title:'', body:'' },
  requestStep: 1,
  requestDraft: { category:'ค่าน้ำมัน', amount:'', date:new Date().toISOString().slice(0,10), note:'', receiptDataUrl:'', receiptName:'' },
  settings: null,
  metrics: null,
  announcements: [],
  requests: [],
  payments: [],
  messages: [],
  pinnedMessage: null,
  users: [],
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
    const map={invalid_credentials:'เบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง',phone_exists:'เบอร์โทรศัพท์นี้ถูกใช้แล้ว',invalid_input:'ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง',forbidden:'ไม่มีสิทธิ์ใช้งาน',users_only:'ฟังก์ชันนี้สำหรับผู้ใช้ทั่วไป',request_not_approved:'รายการนี้ยังไม่ได้รับอนุมัติ',invalid_image:'ไฟล์รูปไม่ถูกต้อง',receipt_required:'กรุณาแนบรูปใบเสร็จ',image_too_large:'รูปใหญ่เกิน 5 MB',invalid_message:'กรุณากรอกข้อความ (ไม่เกิน 1,000 ตัวอักษร)'};
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
  const backButton = state.view !== 'home'
    ? '<button class="text-link" data-action="go-back">← ย้อนกลับ</button>'
    : '';

  return `<div class="page app-shell">
    <header class="topbar"><div class="topbar-inner"><div class="profile-mini"><div class="avatar">${h((u?.fullName||'R').trim()[0]||'R')}</div><div><div class="topbar-title">${h(u?.fullName||'RubberSync')}</div><div class="meta">${u?.role==='admin'?'เจ้าของสวน / ผู้ดูแล':'คนงานสวนยาง'}</div></div></div>${backButton}</div></header>
    <main class="content">${content}</main>
    <nav class="bottomnav"><div class="bottomnav-inner">
      <button class="nav-btn ${active==='home'?'active':''}" data-view="home"><span class="nav-icon">⌂</span><span>หน้าหลัก</span></button>
      <button class="nav-btn ${active==='community'?'active':''}" data-view="community"><span class="nav-icon">☏</span><span>ชุมชน</span></button>
      <button class="nav-btn ${active==='settings'?'active':''}" data-view="settings"><span class="nav-icon">⚙</span><span>ตั้งค่า</span></button>
    </div></nav>
  </div>`;
}
function hero(title,sub){ return `<section class="hero"><h2>${h(title)}</h2><p>${h(sub)}</p></section>`; }
function actionCard(icon,title,sub,view,accent){ return `<button class="action-card" data-view="${view}" style="--accent:${accent}"><div><div class="action-icon">${icon}</div><h3>${h(title)}</h3><p>${h(sub)}</p></div></button>`; }

async function loadCore(){
  const [d,s,a,r,p,m,u]=await Promise.all([api('/api/dashboard'),api('/api/settings'),api('/api/announcements'),api('/api/requests'),api('/api/payments'),api('/api/messages'),api('/api/users')]);
  state.metrics=d;state.settings=s.settings;state.announcements=a.announcements;state.requests=r.requests;state.payments=p.payments;state.messages=m.messages;state.pinnedMessage=m.pinnedMessage;state.users=u.users;
}
function metricCards(){const m=state.metrics||{counts:{},total:0,totalAmount:0};return `<div class="summary-grid"><div class="card metric"><div class="value">${m.counts?.pending||0}</div><div class="label">รอตรวจสอบ</div></div><div class="card metric"><div class="value">${m.counts?.approved||0}</div><div class="label">อนุมัติแล้ว</div></div><div class="card metric"><div class="value">${m.counts?.paid||0}</div><div class="label">จ่ายแล้ว</div></div><div class="card metric"><div class="value">${h(money(m.totalAmount||0))}</div><div class="label">ยอดอนุมัติ/จ่าย</div></div></div>`}
function renderHome(){
  const admin=state.user.role==='admin';
  const cards=admin?
    `${actionCard('✓','ตรวจสอบการร้องขอ','ตรวจสอบและอนุมัติรายการเบิกจ่าย','admin-requests','#3f6653')}${actionCard('☏','ห้องสนทนา','พูดคุยกับทีมงานในสวน','community','#4c6fff')}${actionCard('📣','สร้างประกาศ','กระจายข่าวสารให้ทีมงานในสวน','announcement','#7f5539')}${actionCard('฿','โอนและส่งสลิป','แนบหลักฐานเพื่อยืนยันการทำรายการ','payroll','#012d1d')}`:
    `${actionCard('🧾','สร้างคำขอเบิกจ่าย','สร้างคำขอเบิกจ่ายพร้อมหลักฐานใบเสร็จ','request','#3f6653')}${actionCard('☏','ห้องสนทนา','พูดคุยกับทีมงานในสวน','community','#4c6fff')}${actionCard('◷','ประวัติคำขอ','ติดตามสถานะรายการย้อนหลัง','history','#7f5539')}`;
  app.innerHTML=shell(`${hero('เลือกฟังก์ชันการใช้งาน','จัดการสวนยางพาราของคุณได้อย่างมีประสิทธิภาพ')}${metricCards()}<div class="action-grid ${admin?'admin-grid':''}">${cards}</div>`,'home');
}

function renderRequest(){
  const d=state.requestDraft,s=state.requestStep;
  const steps=`<div class="steps"><div class="step ${s>1?'done':s===1?'active':''}"><div class="step-dot">${s>1?'✓':'1'}</div>เลือกประเภท</div><div class="connector ${s>1?'done':''}"></div><div class="step ${s>2?'done':s===2?'active':''}"><div class="step-dot">${s>2?'✓':'2'}</div>รายละเอียด</div><div class="connector ${s>2?'done':''}"></div><div class="step ${s===3?'active':''}"><div class="step-dot">3</div>ยืนยัน</div></div>`;
  let body='';
  if(s===1){ body=`${hero('เลือกประเภทค่าใช้จ่าย','เลือกหมวดหมู่ที่ต้องการขอเบิก')}<section class="card form-card"><div class="audience-grid">${['ค่าอุปกรณ์','ค่าน้ำมัน','ค่าน้ำกรด','อื่นๆ'].map(x=>`<button class="audience-btn ${d.category===x?'active':''}" data-category="${x}">${x}</button>`).join('')}</div></section><div style="margin-top:20px"><button class="btn btn-primary btn-block" data-action="request-next">ถัดไป →</button></div>`; }
  if(s===2){ body=`${hero('กรอกรายละเอียด','โปรดระบุจำนวน ข้อมูล และใบเสร็จให้ครบถ้วน')}<section class="card form-card"><form id="request-detail-form"><div class="field"><label>หัวข้อ *</label><select class="select" name="category">${['ค่าอุปกรณ์','ค่าน้ำมัน','ค่าน้ำกรด','อื่นๆ'].map(x=>`<option ${d.category===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>จำนวนเงิน *</label><input class="input" name="amount" type="number" min="1" step="0.01" value="${h(d.amount)}" placeholder="0.00" required><div class="hint">ระบุจำนวนเงินที่ต้องการบันทึก</div></div><div class="field"><label>วันที่ *</label><input class="input" name="date" type="date" value="${h(d.date)}" required></div><div class="field"><label>รูปใบเสร็จ *</label><div class="file-box"><input id="receipt-file" type="file" accept="image/png,image/jpeg,image/webp" ${d.receiptDataUrl?'':'required'}><img id="receipt-preview" class="file-preview ${d.receiptDataUrl?'':'hidden'}" ${d.receiptDataUrl?`src="${h(d.receiptDataUrl)}"`:''} alt="ตัวอย่างใบเสร็จ"></div><div class="hint">PNG/JPG/WebP ไม่เกิน 5 MB</div></div><div class="field"><label>หมายเหตุ</label><textarea class="textarea" name="note" placeholder="ระบุรายละเอียดเพิ่มเติม หรือหมายเหตุ (ถ้ามี)...">${h(d.note)}</textarea></div><button class="btn btn-primary btn-block" type="submit">ถัดไป →</button><button class="btn btn-outline btn-block" style="margin-top:10px" type="button" data-action="request-back">← ย้อนกลับ</button></form></section>`; }
  if(s===3){ body=`${hero('ยืนยันคำขอ','ตรวจสอบข้อมูลก่อนส่งคำขอ')}<section class="card form-card"><h3>สรุปรายการคำร้อง</h3><div class="setting-row"><span>หมวดหมู่</span><strong>${h(d.category)}</strong></div><div class="setting-row"><span>จำนวนเงิน</span><strong>${h(money(d.amount))}</strong></div><div class="setting-row"><span>วันที่</span><strong>${h(dateOnly(d.date))}</strong></div><div class="setting-row"><span>ใบเสร็จ</span><strong>${h(d.receiptName||'ยังไม่ได้แนบ')}</strong></div><div class="setting-row"><span>หมายเหตุ</span><strong>${h(d.note||'-')}</strong></div><button class="btn btn-primary btn-block" style="margin-top:18px" data-action="request-submit">ส่งคำขอ</button><button class="btn btn-outline btn-block" style="margin-top:10px" data-action="request-back">← ย้อนกลับ</button></section>`; }
  app.innerHTML=shell(`${steps}${body}`,'home');
  if(s===2) { $('#receipt-file').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;if(file.size>5*1024*1024){toast('รูปใหญ่เกิน 5 MB','error');e.target.value='';return;}const reader=new FileReader();reader.onload=()=>{state.requestDraft.receiptDataUrl=reader.result;state.requestDraft.receiptName=file.name;const im=$('#receipt-preview');im.src=reader.result;im.classList.remove('hidden')};reader.readAsDataURL(file)}); $('#request-detail-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(!state.requestDraft.receiptDataUrl)return toast('กรุณาแนบรูปใบเสร็จ','error');state.requestDraft={...state.requestDraft,category:f.get('category'),amount:f.get('amount'),date:f.get('date'),note:f.get('note')};state.requestStep=3;renderRequest();}); }
}
async function submitRequest(){ try{const d=state.requestDraft;const r=await api('/api/requests',{method:'POST',body:JSON.stringify({category:d.category,amount:Number(d.amount),date:d.date,note:d.note,receiptDataUrl:d.receiptDataUrl})});state.requestStep=1;state.requestDraft={category:'ค่าน้ำมัน',amount:'',date:new Date().toISOString().slice(0,10),note:'',receiptDataUrl:'',receiptName:''};await loadCore();modal(`<div style="text-align:center"><div style="font-size:54px;color:var(--success)">✓</div><h3>ส่งคำร้องสำเร็จ</h3><p>รหัสอ้างอิง <strong>${h(r.request.ref)}</strong></p><p>${h(r.request.category)} · ${h(money(r.request.amount))}</p><div class="modal-actions"><button class="btn btn-primary" data-view="home">ไปที่หน้าหลัก</button><button class="btn btn-outline" data-view="history">ดูสถานะ</button></div></div>`); }catch(e){toast(e.message,'error')} }

function requestCard(r,admin=false){ return `<article class="card request-item"><div class="request-head"><div><span class="status ${r.status}">${statusText(r.status)}</span><h4>${h(r.category)}</h4><div class="meta">${h(r.ref)} · ${h(dateOnly(r.date))}</div><div class="meta">${h(r.user?.fullName||'')}</div>${r.reviewedAt?`<div class="meta">ตรวจสอบเมื่อ ${h(dt(r.reviewedAt))}</div>`:''}</div><div class="amount">${h(money(r.amount))}</div></div>${r.note?`<p class="muted">${h(r.note)}</p>`:''}${r.receiptUrl?`<div style="margin-top:12px"><button class="text-link" data-view-receipt="${h(r.receiptUrl)}">🧾 ดูใบเสร็จที่แนบ</button></div>`:''}${admin&&r.status==='pending'?`<div class="request-actions"><button class="btn btn-danger" data-reject="${r.id}">ปฏิเสธ</button><button class="btn btn-primary" data-review="${r.id}">ตรวจสอบ</button></div>`:''}${!admin&&r.payment?.slipUrl?`<div style="margin-top:12px"><a href="${h(r.payment.slipUrl)}" target="_blank" class="text-link">ดูหลักฐานการจ่ายเงิน</a></div>`:''}</article>`; }
function renderHistory(){ const list=state.requests; app.innerHTML=shell(`${hero('ประวัติคำขอ','ติดตามสถานะคำขอเบิกจ่ายทั้งหมด')}<div class="section-title"><h3>รายการของฉัน</h3><button class="btn btn-primary" data-view="request">+ สร้างคำขอ</button></div><div class="list">${list.length?list.map(r=>requestCard(r)).join(''):`<div class="card empty">ยังไม่มีรายการ</div>`}</div>`,'home'); }
function renderAdminRequests(){ const pending=state.requests.filter(r=>r.status==='pending'), past=state.requests.filter(r=>r.status!=='pending'); app.innerHTML=shell(`${hero('รายการขอเบิกเงิน','ตรวจสอบและอนุมัติคำขอจากคนงาน')}<div class="section-title"><h3>คำขอใหม่ (รอตรวจสอบ)</h3><span class="status pending">${pending.length} รายการ</span></div><div class="list">${pending.length?pending.map(r=>requestCard(r,true)).join(''):`<div class="card empty">ไม่มีคำขอรอตรวจสอบ</div>`}</div><section class="card history-link-card"><div><h3>ประวัติการตรวจสอบ</h3><p class="muted">ดูคำขอที่อนุมัติ ไม่อนุมัติ และจ่ายเงินแล้ว</p></div><button class="btn btn-outline" data-view="admin-history">ดูย้อนหลัง (${past.length})</button></section>`,'home'); }
function renderAdminHistory(){ const past=state.requests.filter(r=>['approved','rejected','paid'].includes(r.status)).slice().sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)); const approved=past.filter(r=>r.status==='approved'||r.status==='paid').length, rejected=past.filter(r=>r.status==='rejected').length; app.innerHTML=shell(`${hero('ประวัติการตรวจสอบคำขอ','เรียงตามวันที่ในรายการใหม่ล่าสุดก่อน พร้อมใบเสร็จที่เคยส่ง')}<div class="history-summary"><span class="status approved">อนุมัติ/จ่ายแล้ว ${approved}</span><span class="status rejected">ไม่อนุมัติ ${rejected}</span></div><div class="section-title" style="margin-top:20px"><h3>รายการย้อนหลัง</h3><button class="btn btn-outline" data-view="admin-requests">← กลับไปตรวจสอบคำขอ</button></div><div class="list">${past.length?past.map(r=>requestCard(r,false)).join(''):`<div class="card empty">ยังไม่มีประวัติการตรวจสอบ</div>`}</div>`,'home'); }
function openReceipt(url){ modal(`<div class="receipt-modal-head"><h3>ใบเสร็จที่แนบ</h3><button class="text-link" data-action="close-modal">✕ ปิด</button></div><img class="receipt-review" src="${h(url)}" alt="ใบเสร็จที่แนบ"><button class="btn btn-outline btn-block" style="margin-top:16px" data-action="close-modal">← กลับไปหน้าเดิม</button>`); }
function openReview(id){ const r=state.requests.find(x=>x.id===id); if(!r)return; const m=modal(`<h3>ตรวจสอบใบเสร็จและรายการเบิก</h3><div class="meta">รหัสอ้างอิง: ${h(r.ref)}</div><div class="setting-row"><span>ผู้ขอเบิก</span><strong>${h(r.user?.fullName||'-')}</strong></div><div class="setting-row"><span>หมวดหมู่</span><strong>${h(r.category)}</strong></div><div class="setting-row"><span>รายละเอียด</span><strong>${h(r.note||'-')}</strong></div><div class="setting-row"><span>ยอดเงินขอเบิก</span><strong>${h(money(r.amount))}</strong></div>${r.receiptUrl?`<button class="btn btn-outline btn-block" style="margin-top:16px" data-view-receipt="${h(r.receiptUrl)}">🧾 เปิดดูใบเสร็จ</button>`:`<p class="muted">รายการเก่านี้ยังไม่มีใบเสร็จแนบ</p>`}<div class="modal-actions"><button class="btn btn-danger" data-reject="${r.id}">ไม่อนุมัติ</button><button class="btn btn-success" data-approve="${r.id}">อนุมัติ</button></div>`); }
async function updateStatus(id,status){ try{await api(`/api/requests/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}); document.querySelector('.modal-backdrop')?.remove(); await loadCore(); renderAdminRequests(); toast(status==='approved'?'อนุมัติสำเร็จ':'ปฏิเสธรายการแล้ว');}catch(e){toast(e.message,'error')} }

function renderAnnouncement(){
  const d=state.announcementDraft;
  app.innerHTML=shell(`${hero('สร้างประกาศใหม่','ส่งข้อความแจ้งเตือนถึงทีมงานผ่านระบบ')}<section class="card form-card"><h3>♟ กลุ่มเป้าหมาย</h3><div class="audience-grid">${[['all','ทุกคน'],['workers','เฉพาะคนงานกรีดยาง'],['admin','เฉพาะผู้ดูแล/หัวหน้าคนงาน']].map(([v,t])=>`<button class="audience-btn ${state.audience===v?'active':''}" data-audience="${v}">${t}</button>`).join('')}</div></section><section class="card form-card" style="margin-top:20px"><h3>▣ เนื้อหาประกาศ</h3><form id="announce-form"><div class="field"><label>หัวข้อประกาศ *</label><input class="input" name="title" value="${h(d.title)}" placeholder="กรอกข้อความ" required></div><div class="field"><label>รายละเอียด *</label><textarea class="textarea" name="body" placeholder="ระบุรายละเอียดที่ต้องการแจ้งให้ทราบ..." required>${h(d.body)}</textarea></div><button class="btn btn-primary btn-block" type="submit">เผยแพร่ประกาศ</button><button class="btn btn-brown btn-block" style="margin-top:12px" type="button" data-view="home">ยกเลิก</button></form></section>`,'home');
  $('#announce-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api('/api/announcements',{method:'POST',body:JSON.stringify({title:f.get('title'),body:f.get('body'),audience:state.audience})});state.announcementDraft={title:'',body:''};await loadCore();toast('สร้างประกาศสำเร็จ');state.view='community';renderCommunity();}catch(err){toast(err.message,'error')}});
}

function renderCommunity(){ const anns=state.announcements, messages=state.messages, pinned=state.pinnedMessage, admin=state.user.role==='admin'; app.innerHTML=shell(`${hero('ห้องสนทนา RubberSync','พูดคุยกับทีมงานในสวนได้โดยตรง')}${pinned?`<section class="pinned-message"><div class="pinned-label">📌 ข้อความปักหมุด · แสดง 1 วัน</div><strong>${h(pinned.user?.fullName||'ไม่ทราบชื่อ')}</strong><p>${h(pinned.text)}</p><div class="meta">หมดอายุ ${h(dt(pinned.pinnedUntil))}</div></section>`:''}<section class="card chat-card"><div class="chat-head"><div><h3>ห้องสนทนาสวนยาง</h3><div class="muted">ข้อความล่าสุดของทุกคนในระบบ</div></div></div><div class="chat-messages">${messages.length?messages.map(m=>`<article class="chat-message ${m.userId===state.user.id?'mine':''}"><div class="chat-author">${h(m.user?.fullName||'ไม่ทราบชื่อ')} <span>${h(dt(m.createdAt))}</span></div><div>${h(m.text)}</div>${admin?`<div class="chat-actions"><button class="text-link" data-pin-message="${m.id}">📌 ปักหมุด 1 วัน</button><button class="text-link" data-create-announcement="${m.id}">สร้างประกาศ</button></div>`:''}</article>`).join(''):`<div class="muted">เริ่มต้นบทสนทนาได้เลย</div>`}</div><form id="chat-form" class="chat-form"><input class="input" name="text" maxlength="1000" placeholder="พิมพ์ข้อความถึงทีมงาน..." required><button class="btn btn-primary" type="submit">ส่ง</button></form></section><div class="section-title" style="margin-top:28px"><h3>ประกาศล่าสุด</h3>${admin?`<button class="btn btn-primary" data-view="announcement">+ สร้างประกาศ</button>`:''}</div><div class="list">${anns.length?anns.map(a=>`<article class="card announcement-item"><span class="status approved">${a.audience==='all'?'ทุกคน':a.audience==='workers'?'คนงาน':'ผู้ดูแล'}</span><h4>${h(a.title)}</h4><p>${h(a.body)}</p><div class="announcement-author">โดย ${h(a.author?.fullName||'ระบบ')} · ${h(dt(a.createdAt))}</div></article>`).join(''):`<div class="card empty">ยังไม่มีประกาศ</div>`}</div>`,'community'); $('#chat-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api('/api/messages',{method:'POST',body:JSON.stringify({text:f.get('text')})});await loadCore();renderCommunity();const box=$('.chat-messages');box.scrollTop=box.scrollHeight;}catch(err){toast(err.message,'error')}}); }

function bankInfo(bank){ return bank?.accountNumber?`${bank.bankName||'ธนาคาร'} · ${bank.accountName||'-'} · ${bank.accountNumber}`:'ยังไม่ได้ระบุข้อมูลบัญชี'; }
function renderPayroll(){ const approved=state.requests.filter(r=>r.status==='approved'), paid=state.requests.filter(r=>r.status==='paid'); app.innerHTML=shell(`${hero('Worker Payroll','โอนเงินและแนบหลักฐานการจ่าย')}<div class="section-title"><h3>รายการรอจ่าย</h3><span class="status pending">${approved.length} รายการ</span></div><div class="list">${approved.length?approved.map(r=>`<article class="card payment-item"><div class="payment-head"><div><h4>${h(r.user?.fullName||'-')}</h4><div class="meta">${h(r.category)} · ${h(r.ref)}</div><div class="bank-info">บัญชี: ${h(bankInfo({bankName:r.user?.bankName,accountName:r.user?.bankAccountName,accountNumber:r.user?.bankAccountNumber}))}</div></div><div class="amount">${h(money(r.amount))}</div></div><div class="request-actions"><span class="status pending">รอโอน</span><button class="btn btn-primary" data-pay="${r.id}">จ่ายเงิน</button></div></article>`).join(''):`<div class="card empty">ไม่มีรายการรอจ่าย</div>`}</div><div class="section-title" style="margin-top:30px"><h3>จ่ายแล้ว</h3></div><div class="list">${paid.length?paid.map(r=>`<article class="card payment-item"><div class="payment-head"><div><span class="status paid">จ่ายแล้ว</span><h4>${h(r.user?.fullName||'-')}</h4><div class="meta">${h(r.category)} · ${h(r.ref)}</div><div class="bank-info">บัญชีที่โอน: ${h(bankInfo(r.payment?.recipientBank))}</div><div class="meta">จ่ายเมื่อ ${h(dt(r.payment?.paidAt))}</div></div><div class="amount">${h(money(r.amount))}</div></div>${r.payment?.slipUrl?`<div style="margin-top:12px"><a class="text-link" href="${h(r.payment.slipUrl)}" target="_blank">ดูหลักฐานการโอน</a></div>`:''}</article>`).join(''):`<div class="card empty">ยังไม่มีประวัติการจ่าย</div>`}</div>`,'home'); }
function openPay(id){ const r=state.requests.find(x=>x.id===id); if(!r)return; const bank={bankName:r.user?.bankName,accountName:r.user?.bankAccountName,accountNumber:r.user?.bankAccountNumber}; const m=modal(`<h3>บันทึกการเบิก</h3><div class="setting-row"><span>ผู้รับเงิน</span><strong>${h(r.user?.fullName||'-')}</strong></div><div class="setting-row"><span>บัญชีธนาคาร</span><strong>${h(bankInfo(bank))}</strong></div><div class="setting-row"><span>ยอดเงิน</span><strong>${h(money(r.amount))}</strong></div><form id="pay-form"><div class="field"><label>แนบสลิป *</label><div class="file-box"><input id="slip-file" type="file" accept="image/png,image/jpeg,image/webp" required><img id="slip-preview" class="file-preview hidden" alt="ตัวอย่างสลิป"></div><div class="hint">PNG/JPG/WebP ไม่เกิน 5 MB</div></div><div class="field"><label>หมายเหตุ (ถ้ามี)</label><textarea class="textarea" name="note" placeholder="ระบุข้อมูลเพิ่มเติมเกี่ยวกับการโอนเงิน..."></textarea></div><button class="btn btn-primary btn-block" type="submit">ยืนยันการจ่ายเงิน</button></form>`);
  let dataUrl=''; $('#slip-file',m).addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;if(file.size>5*1024*1024){toast('รูปใหญ่เกิน 5 MB','error');e.target.value='';return;}const reader=new FileReader();reader.onload=()=>{dataUrl=reader.result;const im=$('#slip-preview',m);im.src=dataUrl;im.classList.remove('hidden')};reader.readAsDataURL(file)});
  $('#pay-form',m).addEventListener('submit',async e=>{e.preventDefault();if(!dataUrl)return toast('กรุณาเลือกสลิป','error');const f=new FormData(e.currentTarget);try{await api(`/api/payments/${id}/slip`,{method:'POST',body:JSON.stringify({dataUrl,note:f.get('note')})});m.remove();await loadCore();renderPayroll();toast('บันทึกการจ่ายเงินสำเร็จ')}catch(err){toast(err.message,'error')}});
}

function renderSettings(){ const s=state.settings||{}; const admin=state.user.role==='admin'; const push=localStorage.getItem('rubbersync_push')!=='off'; app.innerHTML=shell(`${hero('โปรไฟล์และตั้งค่า','จัดการข้อมูลติดต่อและบัญชีรับเงิน')}<div class="settings-grid"><section class="card settings-card"><h3>ข้อมูลติดต่อและบัญชีรับเงิน</h3><form id="profile-form"><div class="setting-row"><span>ชื่อ</span><strong>${h(state.user.fullName)}</strong></div><div class="setting-row"><span>เบอร์โทรศัพท์</span><a class="text-link" href="tel:${h(state.user.phone)}">${h(state.user.phone)}</a></div><div class="setting-row" style="display:block"><label>LINE ID</label><input class="input" name="lineId" value="${h(state.user.lineId||'')}" placeholder="ระบุ LINE ID เพื่อให้ทีมงานติดต่อได้"></div><div class="setting-row" style="display:block"><label>ข้อมูลติดต่อเพิ่มเติม</label><textarea class="textarea" name="contactNote" placeholder="เช่น เวลาที่สะดวกรับสาย">${h(state.user.contactNote||'')}</textarea></div><div class="setting-row" style="display:block"><label>ธนาคาร</label><input class="input" name="bankName" value="${h(state.user.bankName||'')}" placeholder="เช่น ธนาคารกสิกรไทย"></div><div class="setting-row" style="display:block"><label>ชื่อบัญชี</label><input class="input" name="bankAccountName" value="${h(state.user.bankAccountName||'')}" placeholder="ชื่อ-นามสกุลเจ้าของบัญชี"></div><div class="setting-row" style="display:block"><label>เลขบัญชี</label><input class="input" name="bankAccountNumber" inputmode="numeric" value="${h(state.user.bankAccountNumber||'')}" placeholder="เลขบัญชีสำหรับรับเงิน"><button class="btn btn-primary btn-block" style="margin-top:12px" type="submit">บันทึกข้อมูล</button></div></form></section><section class="card settings-card"><h3>รายชื่อผู้ใช้งาน</h3><div class="setting-row"><span>ดูข้อมูลและติดต่อสมาชิกในสวน</span><button class="btn btn-outline" data-view="contacts">รายชื่อ</button></div><div class="setting-row"><span>บทบาทของฉัน</span><strong>${admin?'ผู้ดูแล':'คนงาน'}</strong></div></section><section class="card settings-card"><h3>การแจ้งเตือน</h3><div class="setting-row"><span>Push Notifications</span><button class="toggle ${push?'on':''}" data-action="toggle-push" aria-label="toggle"></button></div></section><section class="card settings-card"><h3>ความช่วยเหลือและข้อมูล</h3><div class="setting-row"><span>เวอร์ชัน</span><strong>${h(s.version||'1.0.0')}</strong></div><div class="setting-row"><button class="btn btn-danger btn-block" data-action="logout">ออกจากระบบ</button></div></section></div>`,'settings'); $('#profile-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api('/api/me',{method:'PATCH',body:JSON.stringify({lineId:f.get('lineId'),contactNote:f.get('contactNote'),bankName:f.get('bankName'),bankAccountName:f.get('bankAccountName'),bankAccountNumber:f.get('bankAccountNumber')})});state.user=d.user;toast('บันทึกข้อมูลแล้ว');renderSettings();}catch(err){toast(err.message,'error')}}); }

function renderContacts(){ const users=state.users; app.innerHTML=shell(`${hero('รายชื่อผู้ใช้งาน','ติดต่อทีมงานและสมาชิกในสวนได้โดยตรง')}<div class="list">${users.map(u=>`<article class="card contact-item"><div class="avatar">${h((u.fullName||'R').trim()[0]||'R')}</div><div class="contact-info"><h3>${h(u.fullName)} ${u.id===state.user.id?'<span class="muted">(ฉัน)</span>':''}</h3><div class="meta">${u.role==='admin'?'ผู้ดูแล':'คนงานสวนยาง'}</div><div class="contact-links"><a class="btn btn-outline" href="tel:${h(u.phone)}">โทร ${h(u.phone)}</a>${u.lineId?`<span class="line-id">LINE: ${h(u.lineId)}</span>`:''}</div>${u.contactNote?`<p class="muted">${h(u.contactNote)}</p>`:''}</div></article>`).join('')}</div>`,'settings'); }

function renderReport(){ const m=state.metrics||{}; const rows=state.requests.map(r=>`<tr><td>${h(r.ref)}</td><td>${h(r.user?.fullName||'-')}</td><td>${h(r.category)}</td><td>${h(money(r.amount))}</td><td><span class="status ${r.status}">${statusText(r.status)}</span></td><td>${h(dateOnly(r.date))}</td></tr>`).join(''); app.innerHTML=shell(`${hero('รายงานภาพรวม','สรุปรายการเบิกจ่ายและสถานะ')}${metricCards()}<section class="card" style="padding:18px"><div class="table-wrap"><table class="table"><thead><tr><th>อ้างอิง</th><th>ผู้ขอ</th><th>หมวดหมู่</th><th>จำนวน</th><th>สถานะ</th><th>วันที่</th></tr></thead><tbody>${rows}</tbody></table></div></section>`,'home'); }

function render(){ if(!state.user)return renderLogin(); const map={home:renderHome,request:renderRequest,history:renderHistory,'admin-requests':renderAdminRequests,'admin-history':renderAdminHistory,announcement:renderAnnouncement,community:renderCommunity,payroll:renderPayroll,settings:renderSettings,contacts:renderContacts,report:renderReport}; (map[state.view]||renderHome)(); }
async function navigate(v, saveHistory = true){
  if (saveHistory && state.view !== v) state.viewHistory.push(state.view);
  state.view = v;
  if (v === 'request') state.requestStep = 1;
  if(['home','community','settings','contacts','history','admin-requests','admin-history','payroll','report'].includes(v)){
    try { await loadCore(); } catch (err) { toast(err.message,'error'); }
  }
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function goBack(){
  const previous = state.viewHistory.pop() || 'home';
  state.view = previous;
  render();
}

document.addEventListener('click',async e=>{
  const view=e.target.closest('[data-view]')?.dataset.view; if(view){e.preventDefault();if(view==='announcement')state.announcementDraft={title:'',body:''};document.querySelector('.modal-backdrop')?.remove();return navigate(view)}
  const act=e.target.closest('[data-action]')?.dataset.action;
  if(act==='register') return renderRegister();
  if(act==='login') return renderLogin();
  if(act==='forgot') return toast('สำหรับระบบจริงสามารถเชื่อม OTP/รีเซ็ตรหัสผ่านเพิ่มได้');
  if(act==='logout') return logout();
  if(act==='go-back') return goBack();
  if(act==='refresh'){try{await loadCore();render();toast('อัปเดตข้อมูลแล้ว')}catch(err){toast(err.message,'error')}return}
  if(act==='toggle-push'){const on=e.target.classList.toggle('on');localStorage.setItem('rubbersync_push',on?'on':'off');return}
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
  const receipt=e.target.closest('[data-view-receipt]')?.dataset.viewReceipt;if(receipt)return openReceipt(receipt);
  const pin=e.target.closest('[data-pin-message]')?.dataset.pinMessage;if(pin){try{await api(`/api/messages/${pin}/pin`,{method:'POST',body:'{}'});await loadCore();renderCommunity();toast('ปักหมุดข้อความแล้ว จะแสดงเป็นเวลา 1 วัน')}catch(err){toast(err.message,'error')}return}
  const createAnnouncement=e.target.closest('[data-create-announcement]')?.dataset.createAnnouncement;if(createAnnouncement){const message=state.messages.find(item=>item.id===createAnnouncement);if(!message)return;state.audience='all';state.announcementDraft={title:'ประกาศจากห้องสนทนา',body:message.text};return navigate('announcement')}
});


(async function init(){
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js').catch(()=>{}); }
  if(!state.token)return renderLogin();
  try{const me=await api('/api/me');state.user=me.user;await loadCore();render();}catch{renderLogin();}
})();
