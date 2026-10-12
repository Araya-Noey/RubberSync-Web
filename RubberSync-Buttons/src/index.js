import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {Client, GatewayIntentBits, Events, PermissionFlagsBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, ChannelType, MessageFlags} from 'discord.js';
import {display,parseThai,parsePrice,compareTimes,idLabel,render,log,state,getRound} from './core.js';
const {DISCORD_TOKEN,CLIENT_ID,GUILD_ID}=process.env;
if(!DISCORD_TOKEN||!CLIENT_ID||!GUILD_ID){console.error('ต้องตั้งค่า DISCORD_TOKEN, CLIENT_ID, GUILD_ID ใน .env');process.exit(1);}
const location=path.resolve(process.env.DB_PATH||'data/db.json');
fs.mkdirSync(path.dirname(location),{recursive:true});
const db=fs.existsSync(location)?JSON.parse(fs.readFileSync(location,'utf8')):{guilds:{}};
function save(){const temp=location+'.tmp';fs.writeFileSync(temp,JSON.stringify(db,null,2),{mode:0o600});fs.renameSync(temp,location);}
const ADMIN=PermissionFlagsBits.ManageGuild;
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const ephemeral=MessageFlags.Ephemeral;
const emb=(title,description,color=0x24875a)=>new EmbedBuilder().setTitle(title).setDescription(description.slice(0,4000)).setColor(color).setTimestamp();
function row(...buttons){return new ActionRowBuilder().addComponents(...buttons.map(([id,label,style=ButtonStyle.Secondary,emoji])=>new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setEmoji(emoji)));}
function menu(){return [row(['rs:new','เพิ่มรอบ',ButtonStyle.Success,'➕'],['rs:view','ดูตาราง',ButtonStyle.Primary,'📅'],['rs:history','ประวัติ',ButtonStyle.Secondary,'📜']),row(['rs:edit','แก้วัน/ชื่อ',ButtonStyle.Secondary,'✏️'],['rs:price','บันทึกราคา',ButtonStyle.Secondary,'💰'],['rs:close','ปิดรอบ',ButtonStyle.Danger,'🔒'])];}
function modal(id,title,fields){const m=new ModalBuilder().setCustomId(id).setTitle(title);m.addComponents(...fields.map(f=>new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(TextInputStyle.Short).setRequired(f.required!==false).setMaxLength(f.max||100).setPlaceholder(f.placeholder||'').setValue(f.value||''))));return m;}
const val=(i,id)=>i.fields.getTextInputValue(id).trim();
const commands=[
 new SlashCommandBuilder().setName('panel').setDescription('เปิดแผงปุ่ม RubberSync').setDefaultMemberPermissions(ADMIN),
 new SlashCommandBuilder().setName('setup').setDescription('ตั้งห้องแจ้งเตือนและเวลาเตือนล่วงหน้า').setDefaultMemberPermissions(ADMIN).addChannelOption(o=>o.setName('channel').setDescription('ห้องแจ้งเตือน').addChannelTypes(ChannelType.GuildText).setRequired(true)).addIntegerOption(o=>o.setName('hours').setDescription('แจ้งล่วงหน้า 1–168 ชั่วโมง').setMinValue(1).setMaxValue(168)),
 new SlashCommandBuilder().setName('schedule').setDescription('ดูวันเก็บและขายยาง'),
 new SlashCommandBuilder().setName('history').setDescription('ดูรอบย้อนหลัง').addIntegerOption(o=>o.setName('id').setDescription('หมายเลขรอบเพื่อดูการเปลี่ยนแปลง').setMinValue(1)),
 new SlashCommandBuilder().setName('help').setDescription('คู่มือบอท')
].map(c=>c.toJSON());
const listRounds=(g,history=false)=>history?[...g.rounds].sort((a,b)=>b.id-a.id):g.rounds.filter(r=>r.status==='active').sort((a,b)=>a.collectionAt.localeCompare(b.collectionAt));
const listing=(g,history=false)=>{const rounds=listRounds(g,history).slice(0,10);return emb(history?'📜 รอบย้อนหลัง (10 รอบล่าสุด)':'📅 รอบที่กำลังดำเนินการ',rounds.length?rounds.map(render).join('\n\n'):'ยังไม่มีข้อมูล');};
async function post(g,title,description){if(!g.channelId)return false;const channel=await client.channels.fetch(g.channelId).catch(()=>null);if(!channel?.isTextBased()||typeof channel.send!=='function')return false;await channel.send({embeds:[emb(title,description)]});return true;}
function requireAdmin(i){if(!i.memberPermissions?.has(ADMIN))throw Error('เฉพาะผู้มีสิทธิ์ Manage Server เท่านั้น');}
function choose(i,g,action){const rounds=listRounds(g,action==='history').slice(0,25);if(!rounds.length)throw Error('ไม่มีรอบให้เลือก');const select=new StringSelectMenuBuilder().setCustomId(`rs:choose:${action}`).setPlaceholder('เลือกรอบขายยาง').addOptions(rounds.map(r=>({label:`${idLabel(r)} ${r.title}`.slice(0,100),description:`${r.status==='done'?'ปิดแล้ว':'กำลังดำเนินการ'} | ${display(r.collectionAt)}`.slice(0,100),value:String(r.id)})));return i.reply({content:'เลือกรอบที่ต้องการ (เห็นเฉพาะคุณ)',components:[new ActionRowBuilder().addComponents(select)],flags:ephemeral});}
function historyEmbed(r){const logs=(r.history||[]).slice(-12).reverse().map(x=>`• ${display(x.at)} — <@${x.actor}>: ${x.description}`);return emb(`📜 ประวัติ ${idLabel(r)}`,`${render(r)}\n\n**บันทึกการเปลี่ยนแปลง**\n${logs.join('\n')||'ไม่มี'}`);}
client.on(Events.InteractionCreate,async i=>{
 if(!i.guildId)return;
 const g=state(db,i.guildId);
 try{
  if(i.isChatInputCommand()){
   if(i.commandName==='panel'){requireAdmin(i);await i.reply({embeds:[emb('🌳 RubberSync | แผงควบคุม','กดปุ่มด้านล่างเพื่อเพิ่มรอบ แก้ไขราคา จัดการกำหนดการ หรือดูประวัติ\n\n🔐 การแก้ไขสงวนสิทธิ์ผู้ดูแลเซิร์ฟเวอร์')],components:menu()});}
   else if(i.commandName==='setup'){requireAdmin(i);const channel=i.options.getChannel('channel',true);if(!channel?.isTextBased()||!channel?.send)throw Error('ต้องเป็นช่องข้อความ');g.channelId=channel.id;g.reminderHours=i.options.getInteger('hours')??g.reminderHours;save();await i.reply({content:`✅ ตั้งห้องแจ้งเตือนเป็น <#${channel.id}> ล่วงหน้า ${g.reminderHours} ชั่วโมง`,flags:ephemeral});}
   else if(i.commandName==='schedule')await i.reply({embeds:[listing(g)],flags:ephemeral});
   else if(i.commandName==='history'){const id=i.options.getInteger('id');await i.reply({embeds:[id?historyEmbed(getRound(g,id)):listing(g,true)],flags:ephemeral});}
   else if(i.commandName==='help')await i.reply({embeds:[emb('🌳 วิธีใช้ RubberSync','ผู้ดูแลใช้ `/setup` เลือกห้องเตือน แล้วใช้ `/panel` เปิดแผงกดปุ่ม\nสมาชิกดูข้อมูลด้วย `/schedule` และ `/history`\n\nฟอร์มวันที่ใช้ **ปี ค.ศ.** เช่น `2026-10-20 09:00` (เวลาไทย)\nตั้งค่าแจ้งเตือนล่วงหน้าได้ 1–168 ชั่วโมง')],flags:ephemeral});
  }else if(i.isButton()){
   if(!i.customId.startsWith('rs:'))return;
   const action=i.customId.split(':')[1];
   if(action==='view')await i.reply({embeds:[listing(g)],flags:ephemeral});
   else if(action==='history')await choose(i,g,'history');
   else{
    requireAdmin(i);
    if(action==='new')await i.showModal(modal('rs:modal:new','เพิ่มรอบขายยาง',[
      {id:'title',label:'ชื่อรอบ',placeholder:'รอบเดือนตุลาคม',max:70},
      {id:'collect',label:'วันเก็บ (YYYY-MM-DD HH:mm)',placeholder:'2026-10-20 09:00'},
      {id:'sale',label:'วันขาย (YYYY-MM-DD HH:mm)',placeholder:'2026-10-23 09:00'},
      {id:'price',label:'ราคา บาท/กก. (ไม่ใส่ก็ได้)',required:false,placeholder:'65.50'},
      {id:'type',label:'ประเภทราคา normal หรือ auction',required:false,placeholder:'normal = ราคายาง / auction = ประมูล'}]));
    else if(['edit','price','close'].includes(action))await choose(i,g,action);
   }
  }else if(i.isStringSelectMenu()&&i.customId.startsWith('rs:choose:')){
   const action=i.customId.split(':')[2],id=Number(i.values[0]);const r=getRound(g,id);
   if(action==='history'){await i.update({content:'ประวัติรอบที่เลือก',embeds:[historyEmbed(r)],components:[]});return;}
   requireAdmin(i);if(r.status==='done')throw Error('รอบนี้ปิดแล้ว');
   if(action==='edit')await i.showModal(modal(`rs:modal:edit:${id}`,`แก้ไขรอบ ${id}`,[
      {id:'title',label:'ชื่อรอบ (ว่าง = ไม่เปลี่ยน)',required:false,placeholder:r.title},
      {id:'collect',label:'วันเก็บใหม่ (ว่าง = ไม่เปลี่ยน)',required:false,placeholder:'2026-10-20 09:00'},
      {id:'sale',label:'วันขายใหม่ (ว่าง = ไม่เปลี่ยน)',required:false,placeholder:'2026-10-23 09:00'}]));
   else if(action==='price')await i.showModal(modal(`rs:modal:price:${id}`,`บันทึกราคา รอบ ${id}`,[
      {id:'price',label:'ราคา บาท/กก.',placeholder:'65.50'},
      {id:'type',label:'normal หรือ auction',placeholder:r.priceType||'normal',value:r.priceType||'normal'}]));
   else if(action==='close')await i.showModal(modal(`rs:modal:close:${id}`,`ยืนยันปิดรอบ ${id}`,[{id:'confirm',label:'พิมพ์ CLOSE เพื่อยืนยัน',placeholder:'CLOSE'}]));
  }else if(i.isModalSubmit()&&i.customId.startsWith('rs:modal:')){
   requireAdmin(i);
   const [, ,action,id]=i.customId.split(':');
   if(action==='new'){
     const title=val(i,'title');if(!title)throw Error('ชื่อรอบห้ามว่าง');const collectionAt=parseThai(val(i,'collect')),saleAt=parseThai(val(i,'sale'));compareTimes(collectionAt,saleAt);
     const raw=val(i,'price');const type=(val(i,'type')||'normal').toLowerCase();if(!['normal','auction'].includes(type))throw Error('ประเภทราคาต้องเป็น normal หรือ auction');
     const r={id:g.nextId++,title,collectionAt,saleAt,price:raw?parsePrice(raw):null,priceType:type,status:'active',sent:{},history:[]};log(r,i.user.id,'created','สร้างรอบใหม่');g.rounds.push(r);save();await i.reply({embeds:[emb('✅ เพิ่มรอบสำเร็จ',render(r))],flags:ephemeral});
   }else{
     const r=getRound(g,id);if(r.status==='done')throw Error('รอบนี้ปิดแล้ว');
     if(action==='edit'){
       const title=val(i,'title'),collect=val(i,'collect'),sale=val(i,'sale');const nextC=collect?parseThai(collect):r.collectionAt,nextS=sale?parseThai(sale):r.saleAt;compareTimes(nextC,nextS);const changes=[];
       if(title&&title!==r.title){changes.push(`ชื่อ: ${r.title} → ${title}`);r.title=title;}
       if(nextC!==r.collectionAt){changes.push(`วันเก็บ: ${display(r.collectionAt)} → ${display(nextC)}`);r.collectionAt=nextC;r.sent??={};delete r.sent.collection;}
       if(nextS!==r.saleAt){changes.push(`วันขาย: ${display(r.saleAt)} → ${display(nextS)}`);r.saleAt=nextS;r.sent??={};delete r.sent.sale;}
       if(!changes.length)throw Error('ไม่มีข้อมูลเปลี่ยนแปลง');log(r,i.user.id,'edited',changes.join(' | '));save();await i.reply({embeds:[emb('✅ แก้ไขกำหนดการแล้ว',render(r))],flags:ephemeral});await post(g,'📣 กำหนดการเปลี่ยน',`${idLabel(r)} — ${r.title}\n${changes.join('\n')}\nแก้ไขโดย <@${i.user.id}>`).catch(console.error);
     }else if(action==='price'){
       const price=parsePrice(val(i,'price')),type=val(i,'type').toLowerCase();if(!['normal','auction'].includes(type))throw Error('กรอกประเภทเป็น normal หรือ auction');const old=r.price;r.price=price;r.priceType=type;log(r,i.user.id,'price',`ราคา ${old??'ไม่ระบุ'} → ${price} บาท/กก. (${type})`);save();await i.reply({embeds:[emb('✅ บันทึกราคาแล้ว',render(r))],flags:ephemeral});await post(g,'📣 เปลี่ยนราคายาง',`${idLabel(r)} — ${r.title}\n${old??'ไม่ระบุ'} → ${price} บาท/กก. (${type})`).catch(console.error);
     }else if(action==='close'){
       if(val(i,'confirm')!=='CLOSE')throw Error('ต้องพิมพ์ CLOSE เพื่อยืนยัน');r.status='done';log(r,i.user.id,'closed','ปิดรอบแล้ว');save();await i.reply({embeds:[emb('✅ ปิดรอบและเก็บประวัติแล้ว',render(r))],flags:ephemeral});
     }
   }
  }
 }catch(e){console.error('Interaction:',e);const reply={content:`❌ ${e.message||'เกิดข้อผิดพลาด'}`,flags:ephemeral};if(i.replied||i.deferred)await i.followUp(reply).catch(console.error);else await i.reply(reply).catch(console.error);}
});
let running=false;
async function reminders(){if(running)return;running=true;try{
 const now=Date.now();for(const g of Object.values(db.guilds||{})){if(!g.channelId)continue;for(const r of g.rounds||[]){if(r.status!=='active')continue;for(const [key,at,label] of [['collection',r.collectionAt,'เก็บยาง'],['sale',r.saleAt,'ขายยาง']]){
 const diff=Date.parse(at)-now;if(!Number.isFinite(diff)||diff<=0||diff>(g.reminderHours||24)*3600000||r.sent?.[key]===at)continue;
 try{const sent=await post(g,`🔔 เตือนก่อนวัน${label}`,`${render(r)}\n⏰ เหลือประมาณ ${Math.ceil(diff/3600000)} ชั่วโมง`);if(sent){r.sent??={};r.sent[key]=at;save();}}catch(e){console.error('Reminder send failed:',e);}
 }}}}finally{running=false;}}
client.once(Events.ClientReady,c=>{console.log(`🌳 RubberSync v2 online: ${c.user.tag}`);void reminders();setInterval(()=>void reminders(),60_000);});
try{await new REST({version:'10'}).setToken(DISCORD_TOKEN).put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:commands});console.log('Commands registered');await client.login(DISCORD_TOKEN);}catch(e){console.error('Startup failed:',e);process.exitCode=1;}
