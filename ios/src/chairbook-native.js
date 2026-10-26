/* Chairbook for iPhone — native layer.
   Loaded after the app script by scripts/build-store.py. It redraws Today as a day rail and adds:
     - booking reminders and client rebooking nudges (Swift plugin BookingAlerts, UserNotifications)
     - Add to Calendar with Apple's event editor (CalendarHandoff, EventKit)
     - Siri / Shortcuts / Spotlight actions (LaunchRoute + App Intents)
     - Taptic feedback (Tactile)
     - booking length, open gaps between bookings, text-a-reminder to the client
   Data stays in the same localStorage record as the web app; new fields are optional
   (appointment.minutes, client.followUp, db.prefs), so backups and CSV stay compatible. */
(function(){
'use strict';
const Cap=window.Capacitor;
const NATIVE=!!(Cap&&Cap.isNativePlatform&&Cap.isNativePlatform());
function plugin(name){
  if(!NATIVE||!Cap.registerPlugin)return null;
  if(Cap.isPluginAvailable&&!Cap.isPluginAvailable(name))return null;
  try{return Cap.registerPlugin(name);}catch(e){return null;}
}
const Alerts=plugin('BookingAlerts'),Calendar=plugin('CalendarHandoff'),Route=plugin('LaunchRoute'),Tactile=plugin('Tactile');
const quiet=p=>{try{return Promise.resolve(p).catch(()=>null);}catch(e){return Promise.resolve(null);}};
function feel(kind){
  if(!Tactile)return;
  if(kind==='success'||kind==='warning'||kind==='error')quiet(Tactile.notify({type:kind}));
  else if(kind==='tick')quiet(Tactile.selection());
  else quiet(Tactile.impact({style:kind||'light'}));
}

/* ---------- preferences and helpers ---------- */
const SVC_MIN={Haircut:45,Color:120,Perm:120,Highlights:150,Blowout:45,Treatment:60,Style:60,Other:60};
const LENGTHS=[30,45,60,75,90,120,150,180,240];
function prefs(){
  if(!db.prefs||typeof db.prefs!=='object')db.prefs={};
  const p=db.prefs;
  if(typeof p.remind!=='number')p.remind=60;
  if(typeof p.follow!=='number')p.follow=6;
  return p;
}
const lengthOf=a=>a.minutes||SVC_MIN[a.service]||60;
const toMin=t=>{const[h,m]=String(t||'0:0').split(':').map(Number);return h*60+(m||0);};
function startMs(a){const d=parseYmd(a.date);const m=toMin(a.time);d.setHours(Math.floor(m/60),m%60,0,0);return d.getTime();}
function dur(m){if(m<60)return m+' min';const h=Math.floor(m/60),r=m%60;return h+' h'+(r?' '+r+' min':'');}
function leadLabel(m){return m===0?'Off':m<60?m+' min before':m===60?'1 hour before':(m/60)+' hours before';}
const firstName=n=>String(n||'').trim().split(/\s+/)[0]||'your client';
function lastVisit(cid){return db.appts.filter(a=>a.clientId===cid&&a.status==='done').sort((a,b)=>b.date.localeCompare(a.date))[0];}
function hasFutureBooking(cid){const t=todayStr();return db.appts.some(a=>a.clientId===cid&&a.status==='booked'&&a.date>=t);}
const ICON={
  bell:'<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/></svg>',
  cal:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>',
  msg:'<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  gear:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  spark:'<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>'
};

/* ---------- booking card (Today rail and the Calendar day list) ---------- */
apptRow=function(a){
  const paid=a.status==='done'&&a.payment;
  const amt=paid?fmt$(a.payment.amount+a.payment.tip):(a.price?fmt$(a.price):'');
  const t=nice12(a.time).split(' ');
  const badge=a.status==='done'?'Paid':a.status==='cancelled'?'Cancelled':'Booked';
  const by=whoDid(a);
  return `<div class="appt tap cb-card ${a.status}" data-id="${a.id}" role="button" tabindex="0">
    <div class="cb-when"><b>${t[0]}</b><span>${t[1]}</span></div>
    <div class="info">
      <div class="who">${esc(clientName(a.clientId))}</div>
      <div class="svc">${esc(a.service)} · ${dur(lengthOf(a))}${by?' · '+esc(by):''}${paid&&a.payment.tip?' · tip '+fmt$(a.payment.tip):''}</div>
    </div>
    <div class="cb-right"><div class="amt">${amt}</div><span class="cb-badge">${badge}</span></div>
  </div>`;
};

/* ---------- Today: hero + day rail ---------- */
renderToday=function(){
  const t=todayStr(),now=new Date();
  const appts=db.appts.filter(a=>a.date===t).sort((a,b)=>a.time.localeCompare(b.time));
  const pays=dayPayments(t);
  const svc=pays.reduce((s,a)=>s+a.payment.amount,0),tip=pays.reduce((s,a)=>s+a.payment.tip,0);
  const booked=appts.filter(a=>a.status==='booked');
  const expected=booked.reduce((s,a)=>s+(a.price||0),0);
  const taken=svc+tip,whole=Math.max(1,taken+expected);
  const fresh=!db.appts.length&&!db.clients.length&&!db.expenses.length;
  const P=prefs();
  const nowMin=now.getHours()*60+now.getMinutes();
  let rail='',prevEnd=null,nowShown=false;
  appts.forEach(a=>{
    const s=toMin(a.time);
    if(!nowShown&&s>nowMin&&appts.some(x=>toMin(x.time)<=nowMin)){
      rail+=`<li class="cb-now">Now · ${nice12(String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'))}</li>`;nowShown=true;
    }
    if(a.status!=='cancelled'){
      if(prevEnd!==null&&s-prevEnd>=30)rail+=`<li class="cb-gap">${dur(s-prevEnd)} open</li>`;
      prevEnd=Math.max(prevEnd||0,s+lengthOf(a));
    }
    rail+=`<li class="cb-slot ${a.status}">${apptRow(a)}</li>`;
  });
  const pill=P.remind>0
    ?`<button class="cb-pill" id="cbRemind">${ICON.bell}<span>Reminders ${leadLabel(P.remind)}</span><em>${booked.length?booked.length+' today':'Change'}</em></button>`
    :`<button class="cb-pill off" id="cbRemind">${ICON.bell}<span>Booking reminders are off</span><em>Turn on</em></button>`;
  main.innerHTML=`
    <header class="cb-top">
      <div><div class="cb-over">${now.toLocaleDateString('en-US',{weekday:'long'})}</div>
      <h1 class="cb-title">${now.toLocaleDateString('en-US',{month:'long',day:'numeric'})}</h1></div>
      <button class="cb-gear" id="backupBtn" aria-label="Settings">${ICON.gear}</button>
    </header>
    <section class="cb-hero" aria-label="Today's take">
      <div class="lbl">Today's take</div>
      <div class="big">${fmt$(taken)}</div>
      <div class="cb-meter" aria-hidden="true"><i style="width:${Math.round(taken/whole*100)}%"></i><i style="width:${Math.round(expected/whole*100)}%"></i></div>
      <div class="cb-meta"><span><b>${fmt$(taken)}</b> taken</span><span><b>${fmt$(expected)}</b> still booked</span></div>
      <div class="cb-stats">
        <div><span class="k">Services</span><span class="v">${fmt$(svc)}</span></div>
        <div><span class="k">Tips</span><span class="v tip">${fmt$(tip)}</span></div>
        <div><span class="k">In the chair</span><span class="v">${pays.length}/${pays.length+booked.length}</span></div>
      </div>
    </section>
    ${pill}
    <div class="sec-t">Schedule <span>${appts.length?appts.length+' booking'+(appts.length>1?'s':''):''}</span></div>
    ${appts.length?`<ol class="cb-rail">${rail}</ol>`
      :`<div class="empty">No appointments today.<br>Tap + to book one.${fresh?'<br><br><button class="chip" id="sampleBtn" style="background:var(--gold);border-color:var(--gold);color:var(--gold-ink)">See it with example data</button>':''}</div>`}
  `;
  bindApptRows(main);
  document.getElementById('backupBtn').onclick=backupSheet;
  document.getElementById('cbRemind').onclick=()=>{backupSheet();setTimeout(()=>{const r=document.getElementById('cbRemSec');if(r)r.scrollIntoView({block:'start',behavior:'smooth'});},280);};
  const sb=document.getElementById('sampleBtn');
  if(sb)sb.onclick=loadSample;
};

/* ---------- dock: selection tick ---------- */
document.querySelectorAll('nav button').forEach(b=>{const f=b.onclick;b.onclick=e=>{if(b.dataset.v!==view)feel('tick');f&&f.call(b,e);};});

/* ---------- save: rebooking nudge, haptics, reminder sync ---------- */
let doneSeen=new Set(db.appts.filter(a=>a.status==='done').map(a=>a.id));
const baseSave=save;
save=function(){
  const P=prefs();
  const yesterday=(()=>{const d=new Date();d.setDate(d.getDate()-1);return ymd(d);})();
  const done=db.appts.filter(a=>a.status==='done');
  const fresh=done.filter(a=>!doneSeen.has(a.id)&&a.date>=yesterday);
  if(fresh.length){
    feel('success');
    if(P.follow>0)fresh.forEach(a=>{
      const c=db.clients.find(x=>x.id===a.clientId);if(!c)return;
      const d=parseYmd(a.date);d.setDate(d.getDate()+P.follow*7);const k=ymd(d);
      if(!c.followUp||c.followUp<k)c.followUp=k;
    });
  }
  doneSeen=new Set(done.map(a=>a.id));
  if(!P.asked&&Alerts&&P.remind>0&&db.appts.some(a=>a.status==='booked'&&startMs(a)>Date.now())){
    P.asked=true;
    quiet(Alerts.status()).then(s=>{if(s&&s.status==='notDetermined')return quiet(Alerts.authorize()).then(syncSoon);});
  }
  baseSave();
  syncSoon();
};
const baseToast=toast;
toast=function(msg){baseToast(msg);if(!/recorded|Paid/.test(msg))feel('light');};

/* ---------- reminders: the whole schedule is rebuilt on every change ---------- */
let syncTimer=null;
function syncSoon(){clearTimeout(syncTimer);syncTimer=setTimeout(syncAlerts,250);}
function buildAlerts(){
  const P=prefs(),now=Date.now(),items=[];
  if(P.remind>0)db.appts.forEach(a=>{
    if(a.status!=='booked')return;
    const at=startMs(a)-P.remind*60000;if(at<=now)return;
    const by=whoDid(a);
    items.push({id:'b-'+a.id,at,kind:'booking',ref:a.id,
      title:`${clientName(a.clientId)} at ${nice12(a.time)}`,
      body:`${a.service} · ${dur(lengthOf(a))}${by?' with '+by:''}${a.price?' · '+fmt$(a.price):''}`});
  });
  if(P.follow>0)db.clients.forEach(c=>{
    if(!c.followUp||hasFutureBooking(c.id))return;
    const d=parseYmd(c.followUp);d.setHours(10,0,0,0);if(d.getTime()<=now)return;
    const last=lastVisit(c.id);
    items.push({id:'f-'+c.id,at:d.getTime(),kind:'followup',ref:c.id,
      title:`Time to rebook ${firstName(c.name)}?`,
      body:last?`Last visit ${niceDate(last.date,true)} · ${last.service}. Tap to book the next one.`:'Tap to book the next visit.'});
  });
  return items.sort((x,y)=>x.at-y.at);
}
async function syncAlerts(){
  const items=buildAlerts();
  if(!Alerts)return items;
  await quiet(Alerts.replaceAll({items}));
  return items;
}

/* ---------- opened from a notification ---------- */
function showDay(date){
  view=date===todayStr()?'today':'cal';
  calSel=date;calCursor=parseYmd(date);calCursor.setDate(1);
  render();
}
function openFromAlert(e){
  if(!e)return;
  closeSheet();
  if(e.kind==='booking'){
    const a=db.appts.find(x=>x.id===e.ref);
    if(!a){view='today';render();return;}
    showDay(a.date);setTimeout(()=>apptDetail(a.id),280);
  }else if(e.kind==='followup'){
    const c=db.clients.find(x=>x.id===e.ref);
    view='clients';render();
    if(c)setTimeout(()=>e.action==='book'?apptForm(null,todayStr(),c.id):clientDetail(c.id),280);
  }
}
if(Alerts)quiet(Alerts.addListener('opened',openFromAlert));

/* ---------- Siri / Shortcuts routes ---------- */
function chairNow(){
  const t=todayStr(),n=new Date(),nowMin=n.getHours()*60+n.getMinutes();
  const open=db.appts.filter(a=>a.date===t&&a.status==='booked').sort((a,b)=>a.time.localeCompare(b.time));
  let pick=open[0]||null;
  open.forEach(a=>{if(toMin(a.time)<=nowMin+15)pick=a;});
  return pick;
}
function runRoute(r){
  if(!r)return;
  closeSheet();view='today';render();
  if(r==='book')setTimeout(()=>apptForm(null,todayStr()),280);
  else if(r==='payment'){
    const a=chairNow();
    if(a)setTimeout(()=>checkout(a.id),280);
    else toast('No open bookings today');
  }
}
function takeRoute(){if(Route)quiet(Route.consume()).then(r=>{if(r&&r.route)runRoute(r.route);});}
if(Route)quiet(Route.addListener('route',e=>runRoute(e&&e.route)));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){takeRoute();syncSoon();}});

/* ---------- Calendar hand-off ---------- */
function icsFor(a){
  const s=new Date(startMs(a)),e=new Date(startMs(a)+lengthOf(a)*60000);
  const f=d=>d.getUTCFullYear()+String(d.getUTCMonth()+1).padStart(2,'0')+String(d.getUTCDate()).padStart(2,'0')+'T'+String(d.getUTCHours()).padStart(2,'0')+String(d.getUTCMinutes()).padStart(2,'0')+'00Z';
  const x=v=>String(v).replace(/[\\;,]/g,m=>'\\'+m).replace(/\n/g,'\\n');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Chairbook//EN','BEGIN:VEVENT','UID:'+a.id+'@chairbook','DTSTAMP:'+f(new Date()),
    'DTSTART:'+f(s),'DTEND:'+f(e),'SUMMARY:'+x(clientName(a.clientId)+' · '+a.service),'END:VEVENT','END:VCALENDAR'].join('\r\n');
}
function calNotes(a){
  const c=db.clients.find(x=>x.id===a.clientId);
  return [a.service+' · '+dur(lengthOf(a))+(a.price?' · '+fmt$(a.price):''),whoDid(a)?'Stylist: '+whoDid(a):'',c&&c.phone?'Phone: '+c.phone:'',c&&c.notes?'Notes: '+c.notes:'','Booked in Chairbook'].filter(Boolean).join('\n');
}
async function addToCalendar(a){
  if(!Calendar){
    if(typeof saveFile==='function')saveFile('chairbook-booking.ics',icsFor(a),'text/calendar');
    return;
  }
  try{
    const r=await Calendar.add({title:clientName(a.clientId)+' · '+a.service,start:startMs(a),minutes:lengthOf(a),notes:calNotes(a)});
    if(r&&r.result==='saved'){a.inCalendar=true;save();toast('Added to Calendar');}
  }catch(e){
    toast(e&&(e.code==='denied'||/access/i.test(String(e.message)))?'Calendar access is off. Turn it on in Settings > Chairbook.':'Calendar could not open');
  }
}
function textClient(a){
  const c=db.clients.find(x=>x.id===a.clientId);if(!c||!c.phone)return;
  const when=a.date===todayStr()?'today':parseYmd(a.date).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
  const body=`Hi ${firstName(c.name)}, a reminder of your ${a.service.toLowerCase()} appointment ${when} at ${nice12(a.time)}. See you then!`;
  location.href='sms:'+c.phone.replace(/[^\d+]/g,'')+'&body='+encodeURIComponent(body);
}

/* ---------- booking detail: calendar, text, reminder line ---------- */
const baseDetail=apptDetail;
apptDetail=function(id){
  baseDetail(id);
  const a=db.appts.find(x=>x.id===id);if(!a||a.status!=='booked')return;
  const edit=document.getElementById('edA');if(!edit)return;
  const c=db.clients.find(x=>x.id===a.clientId),P=prefs();
  const wrap=document.createElement('div');
  wrap.style.marginTop='9px';
  wrap.innerHTML=`<div class="cb-card-note">${ICON.bell}<div>${P.remind>0&&startMs(a)-P.remind*60000>Date.now()
      ?`Reminder <b>${leadLabel(P.remind)}</b> · ${dur(lengthOf(a))} booked`
      :`${dur(lengthOf(a))} booked${P.remind>0?' · reminder time has passed':' · reminders are off'}`}${a.inCalendar?' · in Calendar':''}</div></div>
    <div class="cb-two">
      <button class="btn btn-ghost" id="cbCal">${ICON.cal}Add to Calendar</button>
      <button class="btn btn-ghost" id="cbText" ${c&&c.phone?'':'disabled style="opacity:.45"'}>${ICON.msg}Text a reminder</button>
    </div>`;
  edit.parentNode.insertBefore(wrap,edit);
  document.getElementById('cbCal').onclick=()=>addToCalendar(a);
  document.getElementById('cbText').onclick=()=>textClient(a);
};

/* ---------- booking form: length ---------- */
const baseForm=apptForm;
apptForm=function(id,defaultDate,defaultClient){
  baseForm(id,defaultDate,defaultClient);
  const a=id?db.appts.find(x=>x.id===id):null;
  const row=sheet.querySelector('.fld-row');const btn=document.getElementById('saveA');
  if(!row||!btn)return;
  const fld=document.createElement('div');fld.className='fld';
  fld.innerHTML=`<label>Length</label><select id="f-len"><option value="">Usual for the service</option>${LENGTHS.map(m=>`<option value="${m}" ${a&&a.minutes===m?'selected':''}>${dur(m)}</option>`).join('')}</select>`;
  row.parentNode.insertBefore(fld,row.nextSibling);
  const orig=btn.onclick;
  btn.onclick=()=>{
    const before=new Set(db.appts.map(x=>x.id));
    const len=parseInt(document.getElementById('f-len').value,10)||0;
    orig();
    if(sheet.classList.contains('open'))return;   // the form did not save (missing service, date...)
    const t=a||db.appts.find(x=>!before.has(x.id));
    if(t&&(t.minutes||0)!==len){if(len)t.minutes=len;else delete t.minutes;save();render();}
  };
};

/* ---------- client detail: rebooking reminder ---------- */
const baseClient=clientDetail;
clientDetail=function(id){
  baseClient(id);
  const c=db.clients.find(x=>x.id===id);const book=document.getElementById('bookC');
  if(!c||!book)return;
  const t=todayStr();
  const f=document.createElement('div');f.className='fld';
  f.innerHTML=`<label>Rebooking reminder</label>
    <div style="margin-bottom:8px">${c.followUp?(c.followUp>=t?`<b>${niceDate(c.followUp,true)}</b> at 10:00 AM${hasFutureBooking(c.id)?' · skipped, next visit is booked':''}`:`Was due ${niceDate(c.followUp,true)}`):'<span class="note">None set</span>'}</div>
    <div class="chips" id="cbFu">${[3,4,6,8].map(w=>`<button type="button" class="chip" data-w="${w}">${w} weeks</button>`).join('')}${c.followUp?'<button type="button" class="chip" data-w="0">Clear</button>':''}</div>`;
  book.parentNode.insertBefore(f,book);
  f.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{
    const w=+b.dataset.w;
    if(w){const d=new Date();d.setDate(d.getDate()+w*7);c.followUp=ymd(d);}else delete c.followUp;
    save();clientDetail(id);toast(w?'Reminder set for '+niceDate(c.followUp,true):'Reminder cleared');
  });
};

/* ---------- clients list: rebooking badges ---------- */
const baseClients=renderClients;
renderClients=function(){
  baseClients();
  const t=todayStr();
  main.querySelectorAll('.client[data-id]').forEach(el=>{
    const c=db.clients.find(x=>x.id===el.dataset.id);if(!c||!c.followUp||hasFutureBooking(c.id))return;
    const sub=el.querySelector('.info');if(!sub)return;
    const late=c.followUp<t;
    sub.insertAdjacentHTML('beforeend',`<span class="cb-due ${late?'late':''}">${late?'Due to rebook':'Rebook '+niceDate(c.followUp,true)}</span>`);
  });
};

/* ---------- settings: reminders and Siri ---------- */
const baseSettings=backupSheet;
backupSheet=function(){
  baseSettings();
  const team=document.getElementById('teamB');if(!team)return;
  const P=prefs();
  const sec=document.createElement('div');
  sec.innerHTML=`<div class="sec-t" id="cbRemSec" style="margin-top:22px">Reminders</div>
    <div class="note" style="margin-bottom:10px">Chairbook sets these on your iPhone itself. Nothing is sent to your clients or to any server.</div>
    <div class="fld"><label>Before each booking</label><div class="chips" id="cbLead">
      ${[0,15,30,60,120].map(m=>`<button type="button" class="chip ${P.remind===m?'on':''}" data-m="${m}">${m===0?'Off':m<60?m+' min':m===60?'1 hour':'2 hours'}</button>`).join('')}</div></div>
    <div class="fld"><label>Rebooking nudge after a visit</label><div class="chips" id="cbFollow">
      ${[0,4,6,8].map(w=>`<button type="button" class="chip ${P.follow===w?'on':''}" data-w="${w}">${w?w+' weeks':'Off'}</button>`).join('')}</div></div>
    <div class="note" id="cbAlertState" style="margin-bottom:10px"></div>
    <button class="btn btn-ghost" id="cbAllow" style="display:none">Allow notifications</button>
    ${Route?`<div class="sec-t" style="margin-top:22px">Siri & Shortcuts</div>
    <div class="cb-card-note">${ICON.spark}<div>Say <b>“Show today's bookings in Chairbook”</b>, <b>“Log a payment in Chairbook”</b> or <b>“Book an appointment in Chairbook”</b>. The same actions are in the Shortcuts app and Spotlight.</div></div>`:''}`;
  team.parentNode.insertBefore(sec,team.nextSibling);
  const state=document.getElementById('cbAlertState'),allow=document.getElementById('cbAllow');
  function refresh(){
    const items=buildAlerts();
    const nb=items.filter(i=>i.kind==='booking').length,nf=items.length-nb;
    const summary=`${nb} booking reminder${nb===1?'':'s'} and ${nf} rebooking nudge${nf===1?'':'s'} coming up.`;
    if(!Alerts){state.textContent=summary;return;}
    quiet(Alerts.status()).then(s=>{
      const st=s&&s.status;
      if(st==='granted'){state.textContent=summary;allow.style.display='none';}
      else if(st==='denied'){state.textContent='Notifications are off for Chairbook. Turn them on in Settings > Notifications > Chairbook.';allow.style.display='none';}
      else{state.textContent='Allow notifications so the reminders can appear.';allow.style.display='block';}
    });
  }
  sec.querySelectorAll('#cbLead [data-m]').forEach(b=>b.onclick=()=>{
    P.remind=+b.dataset.m;sec.querySelectorAll('#cbLead .chip').forEach(x=>x.classList.toggle('on',x===b));
    feel('tick');save();refresh();
    if(P.remind>0&&Alerts)quiet(Alerts.status()).then(s=>{if(s&&s.status==='notDetermined')quiet(Alerts.authorize()).then(()=>{syncSoon();refresh();});});
  });
  sec.querySelectorAll('#cbFollow [data-w]').forEach(b=>b.onclick=()=>{
    P.follow=+b.dataset.w;sec.querySelectorAll('#cbFollow .chip').forEach(x=>x.classList.toggle('on',x===b));
    feel('tick');save();refresh();
  });
  allow.onclick=()=>quiet(Alerts.authorize()).then(()=>{syncSoon();refresh();});
  refresh();
};

/* ---------- start ---------- */
window.chairbookNative={prefs,buildAlerts,syncAlerts,openFromAlert,runRoute,chairNow,lengthOf,startMs,icsFor};
render();
syncSoon();
takeRoute();
})();
