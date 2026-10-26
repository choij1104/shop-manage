// Pre-upload check for the Chairbook App Store bundle (ios/www).
// Serves the shipping bundle (with capacitor.js) behind a simulated Capacitor iOS bridge, so every
// plugin call goes through Capacitor's real registerPlugin -> nativePromise / nativeCallback path,
// then walks the user flows, including the 1.1 native paths (reminders, Add to Calendar,
// Siri / Shortcuts routes, notification taps, haptics). Exit code 1 on any failure.
// Usage: node ios/qa/preflight.mjs [runs]
import { chromium } from 'playwright';
import path from 'path'; import fs from 'fs'; import http from 'http';
const WWW = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../www');
const RUNS = +(process.argv[2] || 6);
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.json':'application/json'};
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': mime[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r); }).listen(0);
const PAGE = `http://127.0.0.1:${srv.address().port}/index.html`;

const BRIDGE = (permission, route) => `(() => {
  const calls = window.__calls = []; const listeners = window.__listeners = {};
  window.__alerts = null; window.__perm = '${permission}'; window.__route = '${route}';
  const M = n => n.map(x => ({name:x, rtype: /Listener$/.test(x) ? 'callback' : 'promise'}));
  const H = [
    {name:'Filesystem', methods:M(['writeFile'])}, {name:'Share', methods:M(['share'])},
    {name:'App', methods:M(['addListener','removeListener','removeAllListeners'])},
    {name:'BookingAlerts', methods:M(['status','authorize','replaceAll','pending','addListener','removeListener','removeAllListeners'])},
    {name:'CalendarHandoff', methods:M(['access','add'])},
    {name:'LaunchRoute', methods:M(['consume','addListener','removeListener','removeAllListeners'])},
    {name:'Tactile', methods:M(['impact','selection','notify'])}];
  const h = {
    'Filesystem.writeFile': o => ({uri:'file:///cache/' + o.path}),
    'Share.share': () => ({}),
    'BookingAlerts.status': () => ({status: window.__perm}),
    'BookingAlerts.authorize': () => { window.__perm = 'granted'; return {status:'granted'}; },
    'BookingAlerts.replaceAll': o => { window.__alerts = o.items; return {scheduled: Math.min(60, o.items.length)}; },
    'BookingAlerts.pending': () => ({count: (window.__alerts || []).length, next: 0}),
    'CalendarHandoff.access': () => ({status:'notNeeded'}),
    'CalendarHandoff.add': o => { window.__calEvent = o; return {result:'saved'}; },
    'LaunchRoute.consume': () => { const r = window.__route; window.__route = ''; return {route:r}; },
    'Tactile.impact': () => ({}), 'Tactile.selection': () => ({}), 'Tactile.notify': o => { window.__lastNotify = o.type; return {}; }};
  window.webkit = { messageHandlers: { bridge: { postMessage: () => {} } } };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', platform: 'ios',
    PluginHeaders: H, Plugins: {},
    nativeCallback: (p, m, o, cb) => { calls.push(p + '.' + m); if (m === 'addListener' && o) listeners[p + '.' + o.eventName] = cb; return String(calls.length); },
    nativePromise: (p, m, o) => { calls.push(p + '.' + m); if (m === 'addListener' && o) { listeners[p + '.' + o.eventName] = o.callback || listeners[p + '.' + o.eventName]; }
      const f = h[p + '.' + m]; return f ? Promise.resolve(f(o || {})) : Promise.resolve({}); } };
})();`;

const fails = []; let run = 0;
const check = (cond, msg) => { if (!cond) fails.push(`run ${run}: ${msg}`); };
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome'].find(f => fs.existsSync(f));
const b = await chromium.launch(exe ? {executablePath: exe} : {});
const fire = (p, name, data) => p.evaluate(([n, d]) => { const cb = window.__listeners[n]; if (!cb) throw new Error('no listener for ' + n); cb(d); }, [name, data]);
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

for (run = 1; run <= RUNS; run++) { try {
  const ctx = await b.newContext({viewport:{width:402, height:874}});
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(BRIDGE(run % 2 ? 'notDetermined' : 'granted', run % 3 === 0 ? 'book' : ''));
  await p.goto(PAGE); await p.waitForTimeout(500);
  check(await p.evaluate(() => typeof Capacitor.registerPlugin === 'function'), 'capacitor.js not loaded');
  check(await p.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(17, 19, 22)', 'graphite theme not applied');
  check(await p.evaluate(() => document.fonts.check('800 20px Manrope')), 'Manrope not available');
  check(await p.isVisible('nav [data-v="earn"]'), 'dock not visible');
  check(await p.evaluate(() => ['BookingAlerts.opened','LaunchRoute.route'].every(k => window.__listeners[k])), 'native listeners not registered: ' + Object.keys(await p.evaluate(() => window.__listeners)).join(','));
  if (run % 3 === 0) { // cold-start Shortcut "Book an appointment"
    await p.waitForTimeout(400);
    check((await p.textContent('#sheet h2').catch(() => '')).includes('New appointment'), 'launch route "book" did not open a new booking');
    await p.evaluate(() => closeSheet()); await p.waitForTimeout(300);
  }
  // first run: example data
  check(await p.isVisible('#sampleBtn'), 'example data button missing');
  await p.click('#sampleBtn'); await p.waitForTimeout(500);
  check(await p.locator('.cb-rail .cb-slot').count() === 3, 'day rail does not show the 3 example bookings');
  check(await p.locator('.cb-rail .cb-gap').count() >= 1, 'open gap not shown on the rail');
  check(/\$199/.test(await p.textContent('.cb-hero .big')), 'today\'s take wrong: ' + await p.textContent('.cb-hero .big'));
  // reminders were scheduled for future bookings, follow-up for the client without a future booking
  await p.waitForTimeout(400);
  const al = await p.evaluate(() => window.__alerts || []);
  const tmr = await p.evaluate(t => db.appts.find(a => a.date === t && a.status === 'booked'), tomorrow());
  check(al.some(i => i.kind === 'booking' && i.ref === tmr.id), 'no reminder for tomorrow\'s booking');
  check(await p.evaluate(([items, id]) => { const a = db.appts.find(x => x.id === id); const i = items.find(x => x.ref === id); return i && i.at === chairbookNative.startMs(a) - 3600000 && i.title.includes('Ashley Kim'); }, [al, tmr.id]), 'reminder time/title wrong');
  const maria = await p.evaluate(() => db.clients.find(c => c.name === 'Maria Gonzalez'));
  check(maria.followUp && al.some(i => i.kind === 'followup' && i.ref === maria.id), 'rebooking nudge not scheduled for a client after a visit');
  check(!al.some(i => i.kind === 'followup' && i.ref === tmr.clientId), 'nudge scheduled although the next visit is booked');
  if (run % 2) check((await p.evaluate(() => __calls)).includes('BookingAlerts.authorize'), 'notification permission not requested after booking');
  // booking detail: Add to Calendar through EventKit
  await p.evaluate(id => apptDetail(id), tmr.id); await p.waitForTimeout(300);
  check(await p.isVisible('#cbCal'), 'Add to Calendar button missing');
  check(await p.isEnabled('#cbText'), 'Text a reminder disabled for a client with a phone number');
  await p.click('#cbCal'); await p.waitForTimeout(300);
  const ev = await p.evaluate(() => window.__calEvent);
  check(ev && ev.title === 'Ashley Kim · Treatment' && ev.minutes === 60 && ev.start === await p.evaluate(id => chairbookNative.startMs(db.appts.find(a => a.id === id)), tmr.id), 'calendar event wrong: ' + JSON.stringify(ev));
  check(await p.evaluate(id => db.appts.find(a => a.id === id).inCalendar === true, tmr.id), 'booking not marked as in Calendar');
  // checkout: 20% tip by card, success haptic, nudge for that client
  await p.evaluate(id => apptDetail(id), tmr.id); await p.waitForTimeout(300);
  await p.click('#chk'); await p.waitForTimeout(300);
  await p.click('#tipB button[data-p="0.20"]'); await p.click('#mB .chip[data-m="Card"]'); await p.click('#doneP'); await p.waitForTimeout(400);
  check(await p.evaluate(id => { const a = db.appts.find(x => x.id === id); return a.status === 'done' && a.payment.tip === 12 && a.payment.method === 'Card'; }, tmr.id), 'payment not recorded');
  check(await p.evaluate(() => window.__lastNotify) === 'success', 'success haptic missing');
  // new booking with a length
  await p.click('#fab'); await p.waitForTimeout(300);
  await p.click('#svcChips .chip[data-s="Color"]');
  await p.fill('#f-date', tomorrow()); await p.fill('#f-time', '13:30'); await p.selectOption('#f-len', '90');
  await p.click('#saveA'); await p.waitForTimeout(500);
  const nb = await p.evaluate(t => db.appts.find(a => a.date === t && a.time === '13:30'), tomorrow());
  check(nb && nb.minutes === 90 && nb.status === 'booked', 'new booking with length not saved');
  check((await p.evaluate(() => window.__alerts)).some(i => i.ref === (nb && nb.id)), 'new booking has no reminder');
  // Siri / Shortcuts routes while running
  await fire(p, 'LaunchRoute.route', {route:'today'}); await p.waitForTimeout(350);
  check(await p.evaluate(() => view === 'today'), 'route "today" did not show Today');
  await fire(p, 'LaunchRoute.route', {route:'payment'}); await p.waitForTimeout(450);
  const todayOpen = await p.evaluate(() => db.appts.some(a => a.date === todayStr() && a.status === 'booked'));
  if (todayOpen) check((await p.textContent('#sheet h2').catch(() => '')).includes('Take payment'), 'route "payment" did not open checkout');
  await fire(p, 'LaunchRoute.route', {route:'book'}); await p.waitForTimeout(450);
  check((await p.textContent('#sheet h2').catch(() => '')).includes('New appointment'), 'route "book" did not open a new booking');
  // notification taps
  await fire(p, 'BookingAlerts.opened', {kind:'followup', ref:maria.id, action:'book'}); await p.waitForTimeout(450);
  check(await p.evaluate(id => document.getElementById('f-client') && document.getElementById('f-client').value === id, maria.id), 'follow-up "Book next visit" did not open a booking for the client');
  await fire(p, 'BookingAlerts.opened', {kind:'booking', ref:nb.id, action:'open'}); await p.waitForTimeout(450);
  check(await p.evaluate(() => view === 'cal' && !!document.getElementById('cbCal')), 'booking alert tap did not open the booking');
  // settings: lead time and off
  await p.evaluate(() => closeSheet()); await p.waitForTimeout(300);
  await p.click('[data-v="today"]'); await p.waitForTimeout(200);
  await p.click('#backupBtn'); await p.waitForTimeout(300);
  check(await p.isVisible('#cbRemSec'), 'Reminders section missing from Settings');
  await p.click('#cbLead [data-m="30"]'); await p.waitForTimeout(400);
  check(await p.evaluate(id => { const i = window.__alerts.find(x => x.ref === id); return db.prefs.remind === 30 && i && i.at === chairbookNative.startMs(db.appts.find(a => a.id === id)) - 1800000; }, nb.id), 'lead time change not applied');
  await p.click('#cbLead [data-m="0"]'); await p.waitForTimeout(400);
  check(await p.evaluate(() => !window.__alerts.some(i => i.kind === 'booking')), 'booking reminders not removed when turned off');
  await p.click('#cbLead [data-m="60"]'); await p.waitForTimeout(300);
  // exports through Filesystem + Share
  await p.click('#csvOutB'); await p.waitForTimeout(300);
  await p.click('#backupBtn').catch(() => {}); await p.evaluate(() => backupSheet()); await p.waitForTimeout(300);
  await p.click('#expB'); await p.waitForTimeout(300);
  check((await p.evaluate(() => __calls.filter(c => c === 'Share.share').length)) >= 2, 'CSV / backup did not open the share sheet');
  // clients: rebooking reminder chips and badge
  await p.evaluate(() => closeSheet()); await p.waitForTimeout(300);
  await p.click('[data-v="clients"]'); await p.waitForTimeout(200);
  await p.evaluate(id => clientDetail(id), maria.id); await p.waitForTimeout(300);
  await p.click('#cbFu [data-w="4"]'); await p.waitForTimeout(300);
  check(await p.evaluate(id => { const d = new Date(); d.setDate(d.getDate() + 28); return db.clients.find(c => c.id === id).followUp === (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')); }, maria.id), 'rebooking reminder chip did not set the date');
  await p.evaluate(() => closeSheet()); await p.waitForTimeout(300);
  check(await p.locator('.client .cb-due').count() >= 1, 'rebooking badge missing on the client list');
  // other screens render
  await p.click('[data-v="earn"]'); await p.waitForTimeout(200);
  check(await p.isVisible('.earn-strip'), 'earnings not shown');
  await p.click('[data-v="cal"]'); await p.waitForTimeout(200);
  check(await p.isVisible('.cal'), 'calendar not shown');
  // persistence
  const n = await p.evaluate(() => db.appts.length);
  await p.reload(); await p.waitForTimeout(600);
  check(await p.evaluate(() => db.appts.length) === n, 'bookings lost after relaunch');
  check(await p.evaluate(() => db.prefs && db.prefs.remind === 60), 'reminder setting lost after relaunch');
  check(errs.length === 0, 'page errors: ' + errs.join(' | '));
  await ctx.close();
} catch (e) { fails.push(`run ${run}: ${e.message.split('\n').slice(0,3).join(' / ')}`); }
  process.stdout.write(fails.length ? 'x' : '.'); }

// Browser without the native bridge: same bundle must still work (ICS fallback, no plugin calls).
{ run = 'web'; const ctx = await b.newContext({viewport:{width:402, height:874}}); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(PAGE); await p.waitForTimeout(400); await p.click('#sampleBtn'); await p.waitForTimeout(300);
  await p.evaluate(() => apptDetail(db.appts.find(a => a.status === 'booked').id)); await p.waitForTimeout(300);
  const dl = p.waitForEvent('download', {timeout:3000}).catch(() => null);
  await p.click('#cbCal'); check(await dl, 'web fallback did not download an .ics file');
  check(errs.length === 0, 'page errors: ' + errs.join(' | ')); await ctx.close(); }

await b.close(); srv.close();
console.log(`\n${RUNS} native runs + 1 web run · ${fails.length ? fails.length + ' FAILURES' : 'all passed'}`);
if (fails.length) { console.log([...new Set(fails)].slice(0, 25).join('\n')); process.exit(1); }
