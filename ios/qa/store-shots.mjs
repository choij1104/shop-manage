// Builds the App Store screenshots for Chairbook 1.1 (1206x2622, iPhone 6.3" / 6.9" class).
// Renders the shipping bundle (ios/www) behind a simulated native bridge, fills it with fictional
// clients and bookings, captures six screens and frames each with a caption.
// Usage: node ios/qa/store-shots.mjs   -> ios/store/screenshots/*.png
import { chromium } from 'playwright';
import path from 'path'; import fs from 'fs'; import http from 'http';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const WWW = path.resolve(DIR, '../www'), OUT = path.resolve(DIR, '../store/screenshots');
fs.mkdirSync(OUT, {recursive: true});
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': mime[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r); }).listen(0);
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(f => fs.existsSync(f));
const b = await chromium.launch(exe ? {executablePath: exe} : {});

const BRIDGE = `(() => {
  const M = n => n.map(x => ({name:x, rtype: /Listener$/.test(x) ? 'callback' : 'promise'}));
  const H = [{name:'Filesystem',methods:M(['writeFile'])},{name:'Share',methods:M(['share'])},{name:'App',methods:M(['addListener','removeListener'])},
    {name:'BookingAlerts',methods:M(['status','authorize','replaceAll','pending','addListener','removeListener'])},
    {name:'CalendarHandoff',methods:M(['access','add'])},{name:'LaunchRoute',methods:M(['consume','addListener','removeListener'])},
    {name:'Tactile',methods:M(['impact','selection','notify'])}];
  const h = {'BookingAlerts.status':()=>({status:'granted'}),'BookingAlerts.replaceAll':o=>({scheduled:o.items.length}),
    'LaunchRoute.consume':()=>({route:''}),'CalendarHandoff.add':()=>({result:'saved'})};
  window.webkit = {messageHandlers:{bridge:{postMessage:()=>{}}}};
  window.Capacitor = {isNativePlatform:()=>true,getPlatform:()=>'ios',platform:'ios',PluginHeaders:H,Plugins:{},
    nativeCallback:()=> '1', nativePromise:(p,m,o)=>{const f=h[p+'.'+m];return Promise.resolve(f?f(o||{}):{});}};
})();`;

// Fictional data around a fixed "today" (Tuesday 27 October 2026, 1:20 PM).
const NOW = new Date(2026, 9, 27, 13, 20);
const SEED = () => {
  const day = n => { const d = new Date(2026, 9, 27); d.setDate(d.getDate() + n); return ymd(d); };
  let k = 0; const id = () => 'x' + (++k);
  const C = (name, phone, notes) => ({id:id(), name, phone, notes});
  const cl = [C('Dana Whitfield','210-555-0148','Color: 7N + 7G, 20 vol, 35 min. Likes a face-framing layer.'),
    C('Priya Nandakumar','210-555-0163','Gloss every 6 weeks. Fine hair, no heavy oils.'),
    C('Lena Okafor','210-555-0127','Silk press. Books Saturdays when she can.'),
    C('Carmen Ruiz','210-555-0190','Balayage, toner 9V. Sensitive scalp: use the barrier cream.'),
    C('Jules Bergström','','Short cut, #2 on the sides.'),
    C('Maya Thompson','210-555-0115','Curly cut, dry. Diffuse, no brush.'),
    C('Rosa Delgado','210-555-0172','Root touch-up every 5 weeks.'),
    C('Avery Collins','210-555-0136','Blowout before events.')];
  const st = [{id:'s1', name:'Tess'}, {id:'s2', name:'Marco'}];
  const A = (c, service, date, time, price, status, pay, extra) => Object.assign({id:id(), clientId:cl[c].id, service, date, time, price, staffId:'me', status, payment:pay}, extra || {});
  const P = (amount, tip, method) => ({amount, tip, method});
  const appts = [
    A(0,'Color',day(0),'09:00',135,'done',P(135,27,'Card')),
    A(4,'Haircut',day(0),'11:15',40,'done',P(40,10,'Cash')),
    A(5,'Haircut',day(0),'12:15',65,'booked',null,{minutes:60}),
    A(2,'Treatment',day(0),'14:30',85,'booked',null,{minutes:75}),
    A(7,'Blowout',day(0),'16:30',55,'booked',null),
    A(1,'Style',day(1),'10:00',95,'booked',null,{minutes:90}),
    A(3,'Highlights',day(2),'09:30',210,'booked',null),
    A(6,'Color',day(3),'11:00',95,'booked',null,{staffId:'s1'}),
    A(2,'Blowout',day(4),'15:00',55,'booked',null,{staffId:'s2'})];
  const past = [[1,'Color',-1,'10:00',120,22,'Venmo'],[3,'Highlights',-1,'13:00',210,40,'Card'],[6,'Color',-2,'09:30',95,15,'Zelle'],
    [7,'Blowout',-2,'15:00',55,12,'Cash App'],[5,'Haircut',-3,'11:00',65,13,'Card'],[2,'Treatment',-4,'14:00',85,17,'Cash'],
    [0,'Style',-6,'10:30',60,10,'Card'],[4,'Haircut',-7,'12:00',40,8,'Cash'],[1,'Treatment',-8,'09:00',70,14,'Card'],
    [3,'Color',-9,'11:00',130,25,'Venmo'],[6,'Haircut',-10,'15:30',45,9,'Card'],[7,'Style',-12,'10:00',75,15,'Card'],
    [0,'Color',-41,'09:00',135,27,'Card'],[1,'Color',-44,'10:00',120,20,'Card'],[2,'Treatment',-36,'14:00',85,15,'Cash']];
  for (let m = 1; m <= 5; m++) for (let j = 0; j < 9; j++) past.push([j % 8, ['Color','Haircut','Blowout','Highlights','Treatment'][j % 5], -14 - m * 28 - j * 3, '10:00', [120,45,55,190,80][j % 5], [22,9,11,35,15][j % 5], ['Card','Cash','Venmo','Zelle'][j % 4]]);
  past.forEach(([c,s,d,t,a,tip,mth], i) => appts.push(A(c,s,day(d),t,a,'done',P(a,tip,mth),{staffId: i % 5 === 3 ? 's1' : i % 7 === 4 ? 's2' : 'me'})));
  const ex = [['Supplies',142.6,-3,'Color tubes, developer, foils'],['Rent',650,-25,'Booth rent'],['Products',96,-1,'Retail gloss stock'],['Utilities',48,-10,'Water']]
    .map(([category,amount,d,note]) => ({id:id(), category, amount, date:day(d), note}));
  cl[0].followUp = day(16); cl[6].followUp = day(-2); cl[1].followUp = day(30);
  db = {appts, clients:cl, expenses:ex, staff:st, owner:{name:'Alex'}, prefs:{remind:60, follow:6, asked:true}};
  save(); render();
};

const ctx = await b.newContext({viewport:{width:402, height:874}, deviceScaleFactor:3});
const p = await ctx.newPage();
await p.clock.setFixedTime(NOW);
await p.addInitScript(BRIDGE);
await p.goto(BASE + 'index.html'); await p.waitForTimeout(600);
await p.addStyleTag({content: `#toast{display:none!important} main{padding-top:58px!important}
  .sb{position:fixed;top:0;left:0;right:0;height:50px;z-index:200;display:flex;align-items:center;justify-content:space-between;padding:6px 30px 0 36px;
  font:700 16.5px Manrope,system-ui;color:#F3EFE8;pointer-events:none;background:linear-gradient(#111316 70%,rgba(17,19,22,0))}
  .sb i{display:inline-block;margin-left:6px;vertical-align:middle} .sb .bat{width:25px;height:12px;border:1.5px solid #F3EFE8;border-radius:4px;position:relative}
  .sb .bat::after{content:'';position:absolute;inset:1.5px;right:5px;background:#F3EFE8;border-radius:1.5px}
  .sb .sig{width:17px;height:11px;background:linear-gradient(90deg,#F3EFE8 0 3px,transparent 3px 4.5px,#F3EFE8 4.5px 7.5px,transparent 7.5px 9px,#F3EFE8 9px 12px,transparent 12px 13.5px,#F3EFE8 13.5px);clip-path:polygon(0 100%,100% 0,100% 100%)}
  .sheet{max-height:80vh}`});
await p.evaluate(() => { const s = document.createElement('div'); s.className = 'sb'; s.innerHTML = '<span>9:41</span><span><i class="sig"></i><i class="bat"></i></span>'; document.body.appendChild(s); });
await p.evaluate(SEED); await p.waitForTimeout(500);
const raw = {};
const snap = async (k) => { await p.waitForTimeout(450); raw[k] = await p.screenshot(); };

await p.evaluate(() => { view = 'today'; render(); }); await snap('today');
await p.evaluate(() => apptDetail(db.appts.find(a => a.time === '14:30' && a.status === 'booked').id)); await snap('detail');
await p.evaluate(() => { closeSheet(); }); await p.waitForTimeout(300);
await p.evaluate(() => { backupSheet(); }); await p.waitForTimeout(400);
await p.evaluate(() => { const s = document.getElementById('sheet'); const r = document.getElementById('cbRemSec'); s.scrollTop = r.offsetTop - 70; }); await snap('remind');
await p.evaluate(() => { closeSheet(); }); await p.waitForTimeout(300);
await p.evaluate(() => checkout(db.appts.find(a => a.time === '12:15' && a.status === 'booked').id)); await p.waitForTimeout(300);
await p.click('#tipB button[data-p="0.20"]'); await p.click('#mB .chip[data-m="Card"]'); await snap('checkout');
await p.evaluate(() => { closeSheet(); }); await p.waitForTimeout(300);
await p.evaluate(() => { view = 'clients'; render(); }); await p.waitForTimeout(200);
await p.evaluate(() => clientDetail(db.clients[0].id)); await p.waitForTimeout(300);
await p.addStyleTag({content: '.hist .h-row:nth-child(n+4){display:none}'}); await snap('client');
await p.evaluate(() => { closeSheet(); earnMode = 'week'; view = 'earn'; render(); }); await snap('money');
await ctx.close();

const frames = [
  ['today', 'Your whole day on one rail', 'Who is next, open gaps and today’s take'],
  ['detail', 'Add any booking to Calendar', 'Apple’s calendar editor, filled in for you'],
  ['remind', 'Reminders before every client', 'Plus a nudge when it’s time to rebook'],
  ['checkout', 'Checkout with the tip built in', 'Cash, card, Square, Cash App, Venmo or Zelle'],
  ['client', 'Formulas and visit history', 'Every client’s notes, spend and next rebook'],
  ['money', 'Know what the week brought in', 'Services, tips, expenses and net, per stylist']];
const fp = await b.newPage({viewport:{width:402, height:874}, deviceScaleFactor:3});
const fontCss = fs.readFileSync(path.join(WWW, 'fonts/fonts.css'), 'utf8').replace(/url\(([^)]+)\)/g, (m, f) => `url(${BASE}fonts/${f})`);
let i = 0;
for (const [k, title, sub] of frames) {
  i++;
  const img = 'data:image/png;base64,' + raw[k].toString('base64');
  await fp.setContent(`<html><head><style>${fontCss}
    html,body{margin:0;width:402px;height:874px;overflow:hidden;background:#0D0F12;font-family:Manrope,sans-serif}
    .bg{position:absolute;inset:0;background:radial-gradient(90% 55% at 85% 0%,rgba(232,184,108,.30),rgba(232,184,108,0) 70%),linear-gradient(180deg,#1B1F25 0%,#0D0F12 60%)}
    .cap{position:absolute;left:28px;right:28px;top:52px;color:#F3EFE8}
    .n{font-size:13px;font-weight:800;letter-spacing:.16em;color:#E8B86C;text-transform:uppercase}
    h1{margin:8px 0 8px;font-size:33px;line-height:1.08;font-weight:800;letter-spacing:-.03em}
    p{margin:0;font-size:16.5px;line-height:1.35;color:#B9B4AC;font-weight:600}
    .ph{position:absolute;left:50%;top:224px;width:288px;height:626px;margin-left:-144px;border-radius:40px;overflow:hidden;
      box-shadow:0 0 0 7px #23272E,0 0 0 8.5px #3A3F47,0 30px 70px rgba(0,0,0,.6)}
    .ph img{width:100%;display:block}</style></head><body><div class="bg"></div>
    <div class="cap"><div class="n">Chairbook</div><h1>${title}</h1><p>${sub}</p></div>
    <div class="ph"><img src="${img}"></div></body></html>`);
  await fp.waitForTimeout(300);
  await fp.evaluate(() => document.fonts.ready);
  await fp.screenshot({path: path.join(OUT, `${i}-${k}.png`)});
}
await b.close(); srv.close();
console.log('store-shots: wrote', fs.readdirSync(OUT).filter(f => f.endsWith('.png')).length, 'screenshots to', OUT);
