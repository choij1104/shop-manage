/* Review demo driver. Injected ONLY into the simulator recording build (demo workflow);
   never part of the App Store build. Plays a scripted walk-through with a visible touch marker. */
(function(){
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const dot=document.createElement('div');
  dot.style.cssText='position:fixed;z-index:2147483647;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(120,120,120,.35);border:2px solid rgba(255,255,255,.9);box-shadow:0 2px 10px rgba(0,0,0,.3);pointer-events:none;opacity:0;transition:opacity .15s,transform .15s;transform:scale(.6)';
  function find(t){
    if(typeof t==='function')return t();
    if(typeof t==='string')return document.querySelector(t);
    if(t&&t.text){const re=t.text instanceof RegExp?t.text:new RegExp('^\\s*'+t.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*$','i');
      const els=[...document.querySelectorAll(t.sel||'button,a,[role=button],.tap,label,li,div,span')].filter(e=>e.getClientRects().length>0&&re.test(e.textContent.replace(/\s+/g," ").trim()));
      return els.sort((a,b)=>a.textContent.length-b.textContent.length)[0]||null;}
    return null;
  }
  async function show(x,y){if(!dot.isConnected)document.body.appendChild(dot);dot.style.left=x+'px';dot.style.top=y+'px';dot.style.opacity='1';dot.style.transform='scale(1)';await sleep(260);dot.style.transform='scale(.8)';await sleep(160);dot.style.opacity='0';}
  async function tap(t,opts={}){
    let el=null;for(let i=0;i<30&&!el;i++){el=find(t);if(!el)await sleep(200);}
    if(!el){console.warn('demo: not found',t);return false;}
    el.scrollIntoView({block:'center',behavior:'smooth'});await sleep(650);
    const r=el.getBoundingClientRect();await show(r.left+r.width/2,r.top+Math.min(r.height/2,30));
    if(opts.js){opts.js(el);}else{el.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));el.click();}
    await sleep(opts.after??1300);return true;
  }
  async function type(t,text,after=900){
    const el=find(t);if(!el)return;el.scrollIntoView({block:'center'});await sleep(400);
    const r=el.getBoundingClientRect();await show(r.left+r.width/2,r.top+r.height/2);el.focus();
    for(const ch of text){el.value+=ch;el.dispatchEvent(new Event('input',{bubbles:true}));await sleep(70);}
    el.dispatchEvent(new Event('change',{bubbles:true}));el.blur();await sleep(after);
  }
  async function scroll(px,ms=1600){const steps=24;for(let i=0;i<steps;i++){window.scrollBy(0,px/steps);document.querySelectorAll('.sheet.open,#sheet').forEach(s=>s.scrollBy&&s.scrollBy(0,0));await sleep(ms/steps);}await sleep(500);}
  async function scrollEl(sel,px,ms=1600){const el=find(sel);if(!el)return;const steps=24;for(let i=0;i<steps;i++){el.scrollTop+=px/steps;await sleep(ms/steps);}await sleep(500);}
  window.DEMO={sleep,tap,type,scroll,scrollEl,find};
  window.addEventListener('load',()=>setTimeout(()=>{if(window.DEMO_SCRIPT)window.DEMO_SCRIPT(window.DEMO).catch(e=>console.warn(e));},2500));
})();
