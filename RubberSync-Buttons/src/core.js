export const fmt = new Intl.DateTimeFormat('th-TH-u-ca-gregory',{ timeZone:'Asia/Bangkok', dateStyle:'medium',timeStyle:'short'});
export function display(iso){return iso ? `${fmt.format(new Date(iso))} น.` : 'ยังไม่กำหนด';}
export function parseThai(value){
  const m=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec((value||'').trim());
  if(!m) throw Error('กรอกวันเวลาเป็น YYYY-MM-DD HH:mm เช่น 2026-10-20 09:00 (ปี ค.ศ.)');
  const [,ys,ms,ds,hs,ns]=m; const [y,mo,d,h,minute]=[ys,ms,ds,hs,ns].map(Number);
  if(y<2000||y>2100||h>23||minute>59) throw Error('วันหรือเวลาไม่ถูกต้อง (ใช้ปี ค.ศ.)');
  const check=new Date(Date.UTC(y,mo-1,d,h,minute));
  if(check.getUTCFullYear()!==y||check.getUTCMonth()!==mo-1||check.getUTCDate()!==d) throw Error('วันที่ไม่มีอยู่จริง');
  return new Date(Date.UTC(y,mo-1,d,h-7,minute)).toISOString();
}
export function compareTimes(collect,sale){ if(Date.parse(sale)<Date.parse(collect)) throw Error('วันขายต้องไม่ก่อนวันเก็บ'); }
export function parsePrice(value){const str=(value||'').trim(); if(!/^\d+(?:\.\d{1,2})?$/.test(str)) throw Error('ราคาต้องเป็นเลขไม่ติดลบ มีทศนิยมได้ไม่เกิน 2 ตำแหน่ง'); const price=Number(str); if(!Number.isFinite(price)||price>10000000) throw Error('ราคาสูงเกินขอบเขต'); return price;}
export function idLabel(r){return `#${String(r.id).padStart(3,'0')}`;}
export function render(r){return `**${idLabel(r)} — ${r.title}**\n🧺 เก็บยาง: ${display(r.collectionAt)}\n🚚 ขายยาง: ${display(r.saleAt)}\n💰 ${r.price===null||r.price===undefined?'ยังไม่ระบุ':`${Number(r.price).toLocaleString('th-TH')} บาท/กก.`} (${r.priceType==='auction'?'ราคาประมูล':'ราคายาง'})\n📌 ${r.status==='done'?'ปิดรอบแล้ว':'กำลังดำเนินการ'}`;}
export function log(r,actor,action,description){r.history??=[];r.history.push({at:new Date().toISOString(),actor,action,description});}
export function state(db,guildId){db.guilds??={};db.guilds[guildId]??={nextId:1,channelId:null,reminderHours:24,rounds:[]};return db.guilds[guildId];}
export function getRound(g,id){const r=g.rounds.find(x=>x.id===Number(id));if(!r)throw Error(`ไม่พบรอบ #${id}`);return r;}
