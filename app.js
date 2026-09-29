(() => {
  const MAX_WHEELS = 8;
  const STORAGE_KEY = 'pop-wheel-v1';
  const paletteSets = {
    pop: ['#126094','#6DAACF','#1C7DB8','#8EC5E3','#174E78','#4D97C4','#A6D4EA','#2B6C98'],
    bright: ['#ff5d73','#ff9f1c','#ffd166','#06d6a0','#00b4d8','#6c63ff','#b45cff','#f72585'],
    pastel: ['#f8b4c4','#ffd6a5','#fdffb6','#caffbf','#9bf6ff','#a0c4ff','#bdb2ff','#ffc6ff'],
    dark: ['#1f2937','#374151','#4b5563','#111827','#334155','#475569','#0f172a','#2c3e50'],
    sunset: ['#ff6b6b','#f9844a','#f9c74f','#90be6d','#43aa8b','#577590','#9b5de5','#f15bb5']
  };

  const defaultEntries = ['Yes','No','Maybe','Try again','Absolutely','Not today'];
  let app = { wheels: [] };
  let spinningCount = 0;

  const el = id => document.getElementById(id);
  const grid = el('wheelsGrid');
  const template = el('wheelTemplate');
  const modal = el('winnerModal');
  const winnerLabel = el('winnerLabel');
  const winnerWheelName = el('winnerWheelName');
  const focusOverlay = el('wheelFocusOverlay');
  const focusAllOverlay = el('focusAllOverlay');
  const focusAllGrid = el('focusAllGrid');
  const focusAllTemplate = el('focusAllWheelTemplate');
  let focusWheelId = null;
  let focusSourceNode = null;
  let focusAllOpen = false;
  let enteredFullscreenForFocus = false;
  let confettiGeneration = 0;

  function uid(){ return Math.random().toString(36).slice(2,10); }
  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function makeWheel(name='My Wheel'){
    const colors = paletteSets.pop;
    return {
      id: uid(), name, rotation:0, duration:6, removeWinner:false, confetti:true, sound:true,
      theme:'pop', centerLabel:'SPIN', spinning:false, results:[],
      entries: defaultEntries.map((text,i)=>({id:uid(),text,weight:1,color:colors[i%colors.length]}))
    };
  }

  function load(){
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if(saved && Array.isArray(saved.wheels) && saved.wheels.length){ app=saved; }
      else app.wheels=[makeWheel('Decision Wheel')];
    } catch { app.wheels=[makeWheel('Decision Wheel')]; }
  }
  function persist(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(app)); }
  function toast(msg){ const t=el('toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.add('hidden'),1800); }

  function refreshAllMainCanvases(){
    app.wheels.forEach(w=>{
      const node=getWheelCardNode(w.id);
      if(node)refreshCanvas(node,w);
    });
  }

  function scheduleCanvasRedrawAfterLayout(){
    requestAnimationFrame(()=>requestAnimationFrame(refreshAllMainCanvases));
  }

  function render(){
    grid.innerHTML='';
    app.wheels.forEach(w=>grid.appendChild(renderWheel(w)));
    persist();
    scheduleCanvasRedrawAfterLayout();
    if(focusAllOpen)renderFocusAllGrid();
    if(focusWheelId){
      const w=app.wheels.find(x=>x.id===focusWheelId);
      if(!w) closeWheelFocus();
      else{ focusSourceNode=getWheelCardNode(focusWheelId); syncFocusOverlayUI(w); }
    }
  }

  function getWheelCardNode(id){ return document.querySelector(`.wheel-card[data-wheel-id="${id}"]`); }
  function getFocusAllWheelNode(id){ return focusAllGrid.querySelector(`.focus-all-item[data-wheel-id="${id}"]`); }

  function updateFocusBodyScroll(){
    if(focusWheelId||focusAllOpen)document.body.classList.add('wheel-focus-open');
    else document.body.classList.remove('wheel-focus-open');
  }

  async function requestFocusFullscreen(){
    try{
      if(!document.fullscreenElement){
        await document.documentElement.requestFullscreen();
        enteredFullscreenForFocus=true;
      }
    }catch{}
  }

  async function releaseFocusFullscreen(){
    if(!enteredFullscreenForFocus)return;
    enteredFullscreenForFocus=false;
    try{if(document.fullscreenElement)await document.exitFullscreen();}catch{}
  }

  function focusAllColumnCount(n,vw,vh){
    if(n===1)return 1;
    if(n===2)return 2;
    if(n===3)return vw>=820?3:(vh>vw?1:2);
    if(n===4)return 2;
    if(n<=6)return vw>=1000?3:2;
    return vw>=1280?4:3;
  }

  function layoutSingleWheelFocus(){
    if(!focusWheelId)return;
    const vw=window.innerWidth;
    const vh=window.innerHeight;
    const pointerReserve=28;
    const chrome=58;
    const maxStage=Math.min(720,vw-32,vh-chrome);
    const stage=Math.max(280,Math.floor(maxStage));
    const canvas=Math.max(252,stage-pointerReserve);
    focusOverlay.style.setProperty('--single-focus-size',`${stage}px`);
    focusOverlay.style.setProperty('--single-focus-canvas',`${canvas}px`);
  }

  function layoutFocusAllGrid(){
    if(!focusAllOpen)return;
    const n=app.wheels.length;
    const vw=window.innerWidth;
    const vh=window.innerHeight;
    const cols=focusAllColumnCount(n,vw,vh);
    const rows=Math.ceil(n/cols);
    const gap=24;
    const pad=28;
    const toolbarH=52;
    const titleH=24;
    const availW=vw-pad*2-gap*(cols-1);
    const availH=vh-toolbarH-pad*2-gap*(rows-1);
    const byW=Math.floor(availW/cols);
    const byH=Math.floor((availH-titleH*rows)/rows);
    const size=Math.min(720,Math.max(260,Math.min(byW,byH)));
    focusAllGrid.style.setProperty('--focus-cols',String(cols));
    focusAllGrid.style.setProperty('--focus-gap',`${gap}px`);
    focusAllGrid.style.setProperty('--focus-wheel-size',`${size}px`);
  }

  function redrawFocusViewsAfterLayout(){
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        layoutSingleWheelFocus();
        layoutFocusAllGrid();
        if(focusAllOpen){
          app.wheels.forEach(w=>{
            const tile=getFocusAllWheelNode(w.id);
            if(tile)refreshCanvas(tile,w);
          });
        }
        if(focusWheelId){
          const w=app.wheels.find(x=>x.id===focusWheelId);
          if(w)refreshCanvas(focusOverlay,w);
        }
      });
    });
  }

  function renderFocusAllGrid(){
    focusAllGrid.innerHTML='';
    app.wheels.forEach(w=>{
      const tile=focusAllTemplate.content.firstElementChild.cloneNode(true);
      tile.dataset.wheelId=w.id;
      tile.querySelector('.focus-all-title').textContent=w.name;
      tile.querySelector('.spin-center span').textContent=w.centerLabel||'SPIN';
      tile.querySelector('.spin-center').disabled=!!w.spinning;
      tile.querySelector('.spin-center').addEventListener('click',()=>spinWheel(w,tile));
      focusAllGrid.appendChild(tile);
    });
    layoutFocusAllGrid();
    redrawFocusViewsAfterLayout();
  }

  async function openFocusAll(){
    await closeWheelFocus();
    focusAllOpen=true;
    focusAllOverlay.classList.remove('hidden');
    updateFocusBodyScroll();
    renderFocusAllGrid();
    await requestFocusFullscreen();
    redrawFocusViewsAfterLayout();
  }

  async function closeFocusAll(){
    if(!focusAllOpen)return;
    focusAllOverlay.classList.add('hidden');
    focusAllOpen=false;
    updateFocusBodyScroll();
    await releaseFocusFullscreen();
    app.wheels.forEach(w=>{const card=getWheelCardNode(w.id);if(card)refreshCanvas(card,w);});
  }

  function syncFocusOverlayUI(w){
    focusOverlay.querySelector('.spin-center span').textContent=w.centerLabel||'SPIN';
    focusOverlay.querySelector('.spin-center').disabled=!!w.spinning;
    refreshCanvas(focusOverlay,w);
  }

  async function openWheelFocus(w,sourceNode){
    await closeFocusAll();
    focusWheelId=w.id;
    focusSourceNode=sourceNode;
    focusOverlay.classList.remove('hidden');
    updateFocusBodyScroll();
    syncFocusOverlayUI(w);
    await requestFocusFullscreen();
    redrawFocusViewsAfterLayout();
  }

  async function closeWheelFocus(){
    if(!focusWheelId)return;
    const w=app.wheels.find(x=>x.id===focusWheelId);
    const source=focusSourceNode||getWheelCardNode(focusWheelId);
    focusOverlay.classList.add('hidden');
    focusWheelId=null;
    focusSourceNode=null;
    updateFocusBodyScroll();
    await releaseFocusFullscreen();
    if(w&&source)refreshCanvas(source,w);
  }

  function refreshAllCanvasesForWheel(w,node){
    refreshCanvas(node,w);
    const card=getWheelCardNode(w.id);
    if(card&&node!==card)refreshCanvas(card,w);
    if(focusWheelId===w.id&&node!==focusOverlay)refreshCanvas(focusOverlay,w);
    if(focusAllOpen){
      const tile=getFocusAllWheelNode(w.id);
      if(tile&&node!==tile)refreshCanvas(tile,w);
    }
  }

  function setSpinButtonsDisabled(w,disabled){
    const card=getWheelCardNode(w.id);
    if(card){ const b=card.querySelector('.spin-center'); if(b)b.disabled=disabled; }
    if(focusWheelId===w.id){ focusOverlay.querySelector('.spin-center').disabled=disabled; }
    if(focusAllOpen){
      const tile=getFocusAllWheelNode(w.id);
      if(tile)tile.querySelector('.spin-center').disabled=disabled;
    }
  }

  function renderWheel(w){
    const node=template.content.firstElementChild.cloneNode(true);
    node.dataset.wheelId=w.id;
    const canvas=node.querySelector('.wheel-canvas');
    const ctx=canvas.getContext('2d');
    node.querySelector('.wheel-title').value=w.name;
    node.querySelector('.duration-range').value=w.duration;
    node.querySelector('.duration-range').nextElementSibling.value=`${w.duration}s`;
    node.querySelector('.remove-winner').checked=w.removeWinner;
    node.querySelector('.show-confetti').checked=w.confetti;
    node.querySelector('.sound-enabled').checked=w.sound;
    node.querySelector('.theme-select').value=w.theme;
    node.querySelector('.center-label').value=w.centerLabel;
    node.querySelector('.spin-center span').textContent=w.centerLabel || 'SPIN';

    drawWheel(w,ctx,canvas);
    renderEntries(node,w);
    renderResults(node,w);

    node.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{
      node.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===tab));
      node.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===tab.dataset.tab));
    }));

    node.querySelector('.spin-center').addEventListener('click',()=>spinWheel(w,node));
    node.querySelector('.wheel-title').addEventListener('input',e=>{
      w.name=e.target.value;persist();
      if(focusAllOpen){const tile=getFocusAllWheelNode(w.id);if(tile)tile.querySelector('.focus-all-title').textContent=w.name;}
    });
    node.querySelector('.duration-range').addEventListener('input',e=>{w.duration=+e.target.value;e.target.nextElementSibling.value=`${w.duration}s`;persist();});
    node.querySelector('.remove-winner').addEventListener('change',e=>{w.removeWinner=e.target.checked;persist();});
    node.querySelector('.show-confetti').addEventListener('change',e=>{w.confetti=e.target.checked;persist();});
    node.querySelector('.sound-enabled').addEventListener('change',e=>{w.sound=e.target.checked;persist();});
    node.querySelector('.theme-select').addEventListener('change',e=>{
      w.theme=e.target.value; const p=paletteSets[w.theme]; w.entries.forEach((en,i)=>en.color=p[i%p.length]); render();
    });
    node.querySelector('.center-label').addEventListener('input',e=>{
      w.centerLabel=e.target.value;node.querySelector('.spin-center span').textContent=w.centerLabel||'SPIN';
      if(focusWheelId===w.id)focusOverlay.querySelector('.spin-center span').textContent=w.centerLabel||'SPIN';
      if(focusAllOpen){const tile=getFocusAllWheelNode(w.id);if(tile)tile.querySelector('.spin-center span').textContent=w.centerLabel||'SPIN';}
      persist();
    });
    node.querySelector('.add-entry').addEventListener('click',()=>{ addEntry(w); render(); });
    node.querySelector('.shuffle-btn').addEventListener('click',()=>{w.entries.sort(()=>Math.random()-.5);render();});
    node.querySelector('.sort-btn').addEventListener('click',()=>{w.entries.sort((a,b)=>a.text.localeCompare(b.text));render();});
    node.querySelector('.apply-bulk').addEventListener('click',()=>applyBulk(w,node.querySelector('.bulk-text').value));
    node.querySelector('.clear-results').addEventListener('click',()=>{w.results=[];render();});
    node.querySelector('.focus-wheel').addEventListener('click',()=>openWheelFocus(w,node));
    node.querySelector('.delete-wheel').addEventListener('click',()=>{
      if(app.wheels.length===1){toast('Keep at least one wheel.');return;}
      if(focusWheelId===w.id)closeWheelFocus();
      app.wheels=app.wheels.filter(x=>x.id!==w.id);render();
    });
    node.querySelector('.duplicate-wheel').addEventListener('click',()=>{
      if(app.wheels.length>=MAX_WHEELS){toast('Maximum 8 wheels.');return;}
      const nw=clone(w);nw.id=uid();nw.name=`${w.name} Copy`;nw.spinning=false;nw.rotation=0;nw.entries=nw.entries.map(e=>({...e,id:uid()}));app.wheels.push(nw);render();
    });
    return node;
  }

  function renderEntries(node,w){
    const list=node.querySelector('.entry-list'); list.innerHTML='';
    node.querySelector('.entry-count').textContent=`${w.entries.length} entr${w.entries.length===1?'y':'ies'}`;
    w.entries.forEach((entry)=>{
      const row=document.createElement('div');row.className='entry-row';
      row.innerHTML=`<label class="entry-color"><input type="color" value="${entry.color}"></label><input class="entry-text" maxlength="100"><input class="entry-weight" type="number" min="0.01" step="0.01"><button class="remove-entry" title="Remove">✕</button>`;
      row.querySelector('.entry-text').value=entry.text;
      row.querySelector('.entry-weight').value=entry.weight;
      row.querySelector('input[type=color]').addEventListener('input',e=>{entry.color=e.target.value;refreshAllCanvasesForWheel(w,node);persist();});
      row.querySelector('.entry-text').addEventListener('input',e=>{entry.text=e.target.value;refreshAllCanvasesForWheel(w,node);persist();});
      row.querySelector('.entry-weight').addEventListener('input',e=>{entry.weight=Math.max(.01,+e.target.value||1);refreshAllCanvasesForWheel(w,node);persist();});
      row.querySelector('.remove-entry').addEventListener('click',()=>{ if(w.entries.length<=1){toast('A wheel needs at least one entry.');return;} w.entries=w.entries.filter(x=>x.id!==entry.id);render(); });
      list.appendChild(row);
    });
  }

  function renderResults(node,w){
    const box=node.querySelector('.result-list');
    if(!w.results.length){box.className='result-list empty-state';box.textContent='No spins yet.';return;}
    box.className='result-list';box.innerHTML='';
    w.results.forEach(r=>{
      const item=document.createElement('div');item.className='result-item';
      item.innerHTML=`<strong></strong><span></span>`;item.querySelector('strong').textContent=r.text;item.querySelector('span').textContent=new Date(r.time).toLocaleString();box.appendChild(item);
    });
  }

  function addEntry(w){
    const p=paletteSets[w.theme]||paletteSets.pop; const i=w.entries.length;
    w.entries.push({id:uid(),text:`Option ${i+1}`,weight:1,color:p[i%p.length]});
  }
  function applyBulk(w,text){
    const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if(!lines.length){toast('Nothing to apply.');return;}
    const p=paletteSets[w.theme]||paletteSets.pop;
    w.entries=lines.map((line,i)=>{
      const parts=line.split('|'); const weight=parts.length>1?Math.max(.01,parseFloat(parts.pop())||1):1;
      return {id:uid(),text:parts.join('|').trim(),weight,color:p[i%p.length]};
    });
    render();
  }

  function refreshCanvas(node,w){ const c=node.querySelector('.wheel-canvas');drawWheel(w,c.getContext('2d'),c); }

  function drawWheel(w,_ctx,canvas){
    if(!canvas||!w.entries.length)return;
    const dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
    const cssSize=720;
    canvas.width=cssSize*dpr;
    canvas.height=cssSize*dpr;
    canvas.style.width='100%';
    const ctx=canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,cssSize,cssSize);
    const cx=cssSize/2,cy=cssSize/2,r=330;
    const total=w.entries.reduce((s,e)=>s+(+e.weight||1),0)||1;
    let angle=-Math.PI/2 + w.rotation;
    w.entries.forEach((e)=>{
      const slice=(e.weight/total)*Math.PI*2;
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,angle,angle+slice);ctx.closePath();
      ctx.fillStyle=e.color||'#126094';ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=3;ctx.stroke();
      const mid=angle+slice/2;
      const label=truncate(e.text,22);
      if(label){
        ctx.save();
        ctx.translate(cx,cy);
        ctx.rotate(mid);
        ctx.textAlign='right';
        ctx.textBaseline='middle';
        ctx.font='700 23px system-ui,Segoe UI,sans-serif';
        ctx.fillStyle=contrast(e.color);
        ctx.fillText(label,r-26,0);
        ctx.restore();
      }
      angle+=slice;
    });
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.strokeStyle='rgba(20,30,45,.16)';ctx.lineWidth=6;ctx.stroke();
  }

  function contrast(hex){
    const h=String(hex||'').replace('#','');
    if(h.length<6)return '#fff';
    const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
    if(Number.isNaN(r+g+b))return '#fff';
    return ((r*299+g*587+b*114)/1000)>155?'#172033':'#fff';
  }
  function truncate(s,n){s=s||'';return s.length>n?s.slice(0,n-1)+'…':s;}

  function weightedPick(entries){
    const total=entries.reduce((s,e)=>s+(+e.weight||0),0);let x=Math.random()*total;
    for(let i=0;i<entries.length;i++){x-=+entries[i].weight||0;if(x<=0)return i;} return entries.length-1;
  }

  function targetRotationForIndex(w,index){
    const total=w.entries.reduce((s,e)=>s+(+e.weight||1),0);let before=0;for(let i=0;i<index;i++)before+=+w.entries[i].weight||1;
    const size=(+w.entries[index].weight||1)/total*Math.PI*2;
    const center=((before/total)*Math.PI*2)+(size/2);
    // Wheel drawing starts at -PI/2, pointer is at -PI/2. Need slice center land there.
    const current=w.rotation;
    const desired=-center;
    const two=Math.PI*2;
    const normalized=((desired-current)%two+two)%two;
    const extraSpins=(5+Math.floor(Math.random()*4))*two;
    return current+normalized+extraSpins;
  }

  function spinWheel(w,node,opts={}){
    if(w.spinning||!w.entries.length)return Promise.resolve();
    w.spinning=true; spinningCount++;
    setSpinButtonsDisabled(w,true);
    const winnerIndex=weightedPick(w.entries);const winner=clone(w.entries[winnerIndex]);
    const start=w.rotation;const end=targetRotationForIndex(w,winnerIndex);const duration=w.duration*1000;const startTime=performance.now();
    if(w.sound) beep(160,.045);
    return new Promise(resolve=>{
      function frame(now){
        const t=Math.min(1,(now-startTime)/duration);const eased=1-Math.pow(1-t,4);w.rotation=start+(end-start)*eased;refreshAllCanvasesForWheel(w,node);
        if(t<1){ if(w.sound && Math.floor((now-startTime)/130)!==Math.floor((now-startTime-16)/130) && t<.78) tick(); requestAnimationFrame(frame); }
        else {
          w.rotation=((w.rotation%(Math.PI*2))+(Math.PI*2))%(Math.PI*2);w.spinning=false;spinningCount--;setSpinButtonsDisabled(w,false);
          w.results.unshift({text:winner.text,time:Date.now()});w.results=w.results.slice(0,100);
          if(w.removeWinner && w.entries.length>1) w.entries=w.entries.filter(e=>e.id!==winner.id);
          persist();
          if(w.sound) winSound();
          if(!opts.silentModal){
            showWinner(w,winner.text);
            if(w.confetti)launchConfetti();
          }else{
            if(!opts.skipConfetti&&w.confetti)launchConfetti(50);
            render();
          }
          resolve(winner.text);
        }
      } requestAnimationFrame(frame);
    });
  }

  function resetWinnerModalStyle(){
    modal.classList.remove('spin-all-results-mode');
    winnerLabel.style.whiteSpace='';
    winnerLabel.style.fontSize='';
  }

  function showWinner(w,text){
    resetWinnerModalStyle();
    modal.querySelector('.modal-kicker').textContent='The winner is';
    winnerLabel.textContent=text;
    winnerWheelName.textContent=w.name;
    modal.classList.remove('hidden');
    render();
  }

  function showSpinAllResults(texts){
    resetWinnerModalStyle();
    modal.classList.add('spin-all-results-mode');
    modal.querySelector('.modal-kicker').textContent='Results';
    winnerWheelName.textContent=`${app.wheels.length} wheel${app.wheels.length===1?'':'s'}`;
    winnerLabel.textContent=app.wheels.map((w,i)=>`${w.name}: ${texts[i]??''}`).join('\n');
    winnerLabel.style.whiteSpace='pre-line';
    modal.classList.remove('hidden');
    render();
  }

  function closeWinner(){modal.classList.add('hidden');resetWinnerModalStyle();}

  function audioCtx(){ if(!window.__ac) window.__ac=new (window.AudioContext||window.webkitAudioContext)(); return window.__ac; }
  function beep(freq=300,dur=.06,type='sine',vol=.05){try{const ac=audioCtx(),o=ac.createOscillator(),g=ac.createGain();o.frequency.value=freq;o.type=type;g.gain.value=vol;o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+dur);}catch{}}
  function tick(){beep(500,.025,'square',.012)}
  function winSound(){beep(523,.08,'sine',.04);setTimeout(()=>beep(659,.08,'sine',.04),90);setTimeout(()=>beep(784,.13,'sine',.05),180);}

  function launchConfetti(count=120){
    const gen=++confettiGeneration;
    const c=el('confettiCanvas');
    const dpr=window.devicePixelRatio||1;
    const w=innerWidth;
    const h=innerHeight;
    c.width=w*dpr;
    c.height=h*dpr;
    const ctx=c.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const colors=['#126094','#6DAACF','#ffcb3d','#ff6678','#49d99d','#7c6cff'];
    const ps=Array.from({length:count},()=>({
      x:Math.random()*w,
      y:-20-Math.random()*h*.2,
      vx:(Math.random()-.5)*5,
      vy:3+Math.random()*6,
      r:3+Math.random()*5,
      a:Math.random()*Math.PI,
      va:(Math.random()-.5)*.3,
      c:colors[Math.floor(Math.random()*colors.length)]
    }));
    let frames=0;
    const maxFrames=170;
    function go(){
      if(gen!==confettiGeneration)return;
      ctx.clearRect(0,0,w,h);
      let alive=0;
      ps.forEach(p=>{
        p.x+=p.vx;
        p.y+=p.vy;
        p.vy+=.06;
        p.a+=p.va;
        if(p.y>h+40)return;
        alive++;
        ctx.save();
        ctx.translate(p.x,p.y);
        ctx.rotate(p.a);
        ctx.fillStyle=p.c;
        ctx.fillRect(-p.r,-p.r/2,p.r*2,p.r);
        ctx.restore();
      });
      frames++;
      if(frames<maxFrames&&alive>0)requestAnimationFrame(go);
      else{
        if(gen===confettiGeneration)ctx.clearRect(0,0,w,h);
      }
    }
    requestAnimationFrame(go);
  }

  el('addWheelBtn').addEventListener('click',()=>{ if(app.wheels.length>=MAX_WHEELS){toast('Maximum 8 wheels.');return;} app.wheels.push(makeWheel(`Wheel ${app.wheels.length+1}`));render(); });
  async function spinAllWheels(getNodeForWheel){
    if(spinningCount)return;
    const promises=app.wheels.map(w=>spinWheel(w,getNodeForWheel(w),{silentModal:true,skipConfetti:true}));
    const results=await Promise.all(promises);
    showSpinAllResults(results);
    if(app.wheels.some(w=>w.confetti))launchConfetti(120);
  }
  el('spinAllBtn').addEventListener('click',()=>{
    const cards=[...document.querySelectorAll('.wheel-card')];
    spinAllWheels(w=>cards[app.wheels.findIndex(x=>x.id===w.id)]);
  });
  el('focusAllBtn').addEventListener('click',openFocusAll);
  el('closeFocusAll').addEventListener('click',closeFocusAll);
  el('focusAllSpinAllBtn').addEventListener('click',()=>spinAllWheels(w=>getFocusAllWheelNode(w.id)));
  el('fullscreenBtn').addEventListener('click',async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{}});
  el('menuBtn').addEventListener('click',()=>el('menuPanel').classList.toggle('hidden'));
  document.addEventListener('click',e=>{if(!el('menuPanel').contains(e.target)&&e.target!==el('menuBtn'))el('menuPanel').classList.add('hidden');});
  el('saveBtn').addEventListener('click',()=>{persist();toast('Saved in this browser.');});
  el('exportBtn').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify(app,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pop-wheel-data.json';a.click();URL.revokeObjectURL(a.href);
  });
  el('importInput').addEventListener('change',async e=>{try{const data=JSON.parse(await e.target.files[0].text());if(!data.wheels||!Array.isArray(data.wheels))throw 0;app=data;app.wheels=app.wheels.slice(0,MAX_WHEELS);render();toast('Imported.');}catch{toast('Invalid wheel file.');}e.target.value='';});
  el('resetBtn').addEventListener('click',()=>{if(confirm('Reset all wheels and results?')){app={wheels:[makeWheel('Decision Wheel')]};render();}});
  el('closeModal').addEventListener('click',closeWinner);el('modalDone').addEventListener('click',closeWinner);modal.addEventListener('click',e=>{if(e.target===modal)closeWinner();});
  el('closeWheelFocus').addEventListener('click',closeWheelFocus);
  focusOverlay.querySelector('.spin-center').addEventListener('click',()=>{const w=app.wheels.find(x=>x.id===focusWheelId);if(w)spinWheel(w,focusOverlay);});
  addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(focusAllOpen&&!focusAllOverlay.classList.contains('hidden')){closeFocusAll();return;}
    if(focusWheelId&&!focusOverlay.classList.contains('hidden')){closeWheelFocus();return;}
    closeWinner();
  });
  addEventListener('resize',()=>{
    document.querySelectorAll('.wheel-card').forEach(node=>{const w=app.wheels.find(x=>x.id===node.dataset.wheelId);if(w)refreshCanvas(node,w);});
    if(focusAllOpen||focusWheelId)redrawFocusViewsAfterLayout();
  });
  document.addEventListener('fullscreenchange',()=>{
    if(!document.fullscreenElement&&enteredFullscreenForFocus&&(focusAllOpen||focusWheelId)){
      enteredFullscreenForFocus=false;
    }
  });

  load();render();
  if(document.fonts&&document.fonts.ready){
    document.fonts.ready.then(()=>refreshAllMainCanvases());
  }
  addEventListener('load',()=>refreshAllMainCanvases(),{once:true});
})();
