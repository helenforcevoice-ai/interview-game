/* Логика игры «Сценарий глубинного интервью»
   Данные и тексты лежат в content.js, настройки в config.js
   Здесь только правила и отрисовка: ни одного текста интерфейса и номера карты */

/* ===================== УТИЛИТЫ ===================== */
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function rnd(n){try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%n}catch(e){return Math.floor(Math.random()*n)}}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
const clock=m=>Math.floor(m/60)+':'+String(m%60).padStart(2,'0');
const reducedMotion=()=>window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ===================== СПРАВОЧНИКИ ===================== */
const STAGES=CASE.stages;
const stage=id=>STAGES.find(s=>s.id===id);
const stageIdx=id=>STAGES.findIndex(s=>s.id===id);
const card=id=>CASE.cards.find(c=>c.id===id);
const probe=id=>PROBES.find(p=>p.id===id);
const situation=id=>CASE.situations.find(c=>c.id===id);
const isChain=st=>!!st.hyp;
const lastStage=()=>STAGES.length-1;
const chainMinDefault=Math.min(...STAGES.filter(isChain).map(s=>s.min));
const chainCount=STAGES.filter(isChain).length;
/* На экране и в гайде только названия, коды карт остаются внутренними */
const hypName=h=>h&&CASE.hypotheses[h]?CASE.hypotheses[h].name:'';
const cardName=id=>card(id).name;
function itemLabel(it){
  if(it.off)return TEXTS.situation.offLabel;
  if(it.card)return cardName(it.card);
  const c=situation(it.case);
  return c.kind==='bad'?c.type:TEXTS.situation.briefLabel;
}

/* ===================== СОСТОЯНИЕ ===================== */
function fresh(){return{
  screen:'intro',
  consent:CASE.consent.items.map(()=>false),consentDone:false,
  opened:1,active:STAGES[0].id,
  rolls:{},pendingCase:null,deck:shuffle(CASE.situations.map(c=>c.id)),caseLog:[],
  limit:CASE.limit,chainMin:null,required:[],consentExtra:[],
  items:[],flipped:{},
  sent:null
}}
function load(){try{const r=localStorage.getItem(CONFIG.storageKey);return r?JSON.parse(r):null}catch(e){return null}}
function save(){if(S.demo)return;try{localStorage.setItem(CONFIG.storageKey,JSON.stringify(S))}catch(e){}}
let S=load()||fresh();

/* Вводная заказчика меняет правила партии так, как записано в её поле apply */
function applySituation(c,target=S){
  const a=c.apply;if(!a)return;
  if(a.limit)target.limit=a.limit;
  if(a.chainMin)target.chainMin=a.chainMin;
  if(a.require&&!target.required.some(r=>r.stage===a.require.stage&&r.card===a.require.card))target.required.push(a.require);
  if(a.consent&&!target.consentExtra.includes(a.consent))target.consentExtra.push(a.consent);
}

/* ===================== ПРАВИЛА ===================== */
const itemMins=it=>it.min+(it.probes?it.probes.length*CONFIG.probeMinutes:0);
const total=()=>CONFIG.consentMinutes+S.items.reduce((a,it)=>a+itemMins(it),0);
const minutesLeft=()=>S.limit-total();
const stageItems=id=>S.items.filter(it=>it.stage===id);
const realItems=id=>stageItems(id).filter(it=>!it.off);
const need=st=>isChain(st)&&S.chainMin?S.chainMin:st.min;
const requiredIn=id=>S.required.filter(r=>r.stage===id);
const missingRequired=id=>requiredIn(id).filter(r=>!realItems(id).some(it=>it.card===r.card));
const isRequiredCard=(id,cardId)=>requiredIn(id).some(r=>r.card===cardId);

function stageMet(st){
  const q=realItems(st.id);
  if(isChain(st))return q.length>=need(st)&&q.every(it=>it.probes.length>=1)&&!missingRequired(st.id).length;
  return q.length>=st.min;
}
function usedIds(){const u=new Set();S.items.forEach(it=>{if(it.card)u.add(it.card);(it.probes||[]).forEach(p=>u.add(p.card))});return u}
const rolled=id=>S.rolls[id]!==undefined;
function canAddTo(st){
  if(stageIdx(st.id)>=S.opened)return false;
  if(!rolled(st.id)||S.pendingCase)return false;
  return realItems(st.id).length<st.max;
}
function cardsFor(st){
  let list=CASE.cards.filter(c=>c.g===st.group);
  if(isChain(st))list=list.filter(c=>c.h.includes(st.hyp));
  return list;
}
function checklist(){
  const T=TEXTS.checklist,chains=STAGES.filter(isChain);
  const L=[
    {t:T.consent,ok:S.consentDone},
    {t:T.chains(S.chainMin||chainMinDefault,chainCount),ok:chains.every(s=>stageIdx(s.id)<S.opened&&realItems(s.id).length>=need(s))}
  ];
  S.required.forEach(r=>L.push({t:T.required(hypName(stage(r.stage).hyp),cardName(r.card),r.label),ok:realItems(r.stage).some(it=>it.card===r.card)}));
  L.push(
    {t:T.probes,ok:chains.every(s=>realItems(s.id).every(it=>it.probes.length>=1))&&chains.some(s=>realItems(s.id).length)},
    {t:T.fin,ok:realItems(STAGES[lastStage()].id).length>=1},
    {t:T.reserve(CONFIG.reserveMinutes),ok:total()<=S.limit-CONFIG.reserveMinutes},
    {t:T.offTarget,ok:!S.items.some(it=>it.off)},
    {t:T.selfCheck,ok:S.items.length>0}
  );
  return L;
}
const readyToBuild=()=>checklist().every(c=>c.ok)&&S.opened===STAGES.length;

/* ===================== ОТРИСОВКА: ОБЩЕЕ ===================== */
const app=document.getElementById('app');
function footer(){
  const k=CONFIG.links;
  return `<footer class="foot">© ${CONFIG.copyrightYear} ${esc(CONFIG.author)} · <a href="${k.license}" target="_blank" rel="noopener">${esc(k.licenseName)}</a> · <a href="${k.source}" target="_blank" rel="noopener">${esc(TEXTS.sourceCode)}</a> · <a href="${k.privacy}" target="_blank" rel="noopener">${esc(TEXTS.privacy)}</a></footer>`;
}
function render(){save();if(S.screen==='intro')return renderIntro();if(S.screen==='guide')return renderGuide();renderGame()}
function cardHTML(c){
  return `<div class="card ${c.kind}"><div class="hd"><span>${esc(c.label)}</span><span>${c.min?esc(TEXTS.game.min(c.min)):''}</span></div><div class="bd">${esc(c.text)}</div></div>`;
}

/* ===================== ЭКРАН: СТАРТ ===================== */
function renderIntro(){
  const T=TEXTS.intro;
  app.innerHTML=`
  <header class="top"><div><div class="eyebrow">${esc(TEXTS.appKicker)}</div><h1>${esc(TEXTS.appName)}</h1></div></header>
  <section class="hero">
    <div class="stack">
      <h2 class="hero-title">${esc(T.title)}</h2>
      <p>${esc(T.lead)}</p>
      <p class="note m0">${esc(T.caveat)}</p>
      <div class="levels">${T.levels.map(l=>`<div class="lvl ${l.open?'on':''}"><div><b>${esc(l.name)}</b>${l.sub?`<br><span class="lvl-sub">${esc(l.sub(CASE.title))}</span>`:''}</div><span class="st">${esc(l.status)}</span></div>`).join('')}</div>
      <div class="row-btns"><button class="btn accent" id="go">${esc(T.start)}</button><button class="btn ghost" id="demo">${esc(T.demo)}</button></div>
      <p class="fine"><a href="${CONFIG.links.privacy}" target="_blank" rel="noopener">${esc(TEXTS.privacy)}</a></p>
    </div>
    <div class="fan" aria-hidden="true">${T.fan.map(cardHTML).join('')}</div>
  </section>${footer()}`;
  document.getElementById('go').onclick=()=>{track('game_start');S.screen='game';render();if(!S.consentDone)openConsent()};
  document.getElementById('demo').onclick=startDemo;
}

/* ===================== ЭКРАН: КАНВАС ===================== */
function renderGame(){
  const G=TEXTS.game,t=total(),lim=S.limit,pct=Math.min(100,t/lim*100);
  const cur=STAGES[S.opened-1];
  app.innerHTML=`${demoBar()}
  <header class="top">
    <div><div class="eyebrow">${esc(G.level(CASE.title))}</div><h1>${esc(TEXTS.appName)}</h1>
      <p class="rq">${esc(G.rqLabel)} <b>${esc(CASE.rq)}</b></p></div>
    <div class="meter ${t>lim?'over':''}" aria-live="polite">
      <div class="row"><span class="eyebrow">${esc(G.meter)}</span><span><span class="big">${t}</span><span class="mono muted">${esc(G.of(lim))}</span></span></div>
      <div class="bar"><div class="reserve" style="left:${(lim-CONFIG.reserveMinutes)/lim*100}%;right:0"></div><div class="fill" style="width:${pct}%"></div></div>
      <div class="row meter-note"><span>${esc(G.reserveNote(CONFIG.reserveMinutes))}</span><button class="linkbtn" id="restart">${esc(G.restart)}</button></div>
    </div>
  </header>
  <div class="board">
    <aside class="panel lib" aria-label="${esc(G.libAria)}">${libHTML()}</aside>
    <main class="canvas" aria-label="${esc(G.canvasAria)}">${canvasHTML()}</main>
    <aside class="side">
      <div class="panel">${diceHTML(cur)}</div>
      <div class="panel"><div class="eyebrow">${esc(G.checklistLabel)}</div><ul class="checks">${checklist().map(c=>`<li class="${c.ok?'ok':'no'}"><span class="mk">${c.ok?'✓':'·'}</span><span>${esc(c.t)}</span></li>`).join('')}</ul>
        <button class="btn accent" id="build" ${readyToBuild()?'':'disabled'}>${esc(G.btn.build)}</button></div>
    </aside>
  </div>${footer()}`;
  bindGame();
}

function libHTML(){
  const G=TEXTS.game,st=stage(S.active),used=usedIds(),can=canAddTo(st);
  let why='';
  if(stageIdx(st.id)>=S.opened)why=G.why.locked;
  else if(!rolled(st.id))why=G.why.roll;
  else if(S.pendingCase)why=G.why.pending;
  else if(!can)why=G.why.full;
  const list=cardsFor(st);
  return `<div class="eyebrow">${esc(G.libLabel)}</div>
  <div class="tabs" role="group" aria-label="${esc(G.stageAria)}">${STAGES.slice(0,S.opened).map(s=>`<button data-tab="${s.id}" aria-pressed="${s.id===S.active}">${esc(s.name)}</button>`).join('')}</div>
  ${why?`<div class="lib empty">${esc(why)}</div>`:''}
  <div class="cards">${list.map(c=>{const u=used.has(c.id);return `<button class="card green" data-card="${c.id}" ${u||!can?'disabled':''} aria-label="${esc(G.cardAria(c.name))}"><div class="hd"><span>${esc(c.name)}${u?esc(G.played):''}</span><span>${esc(G.min(c.min))}</span></div><div class="bd">${esc(c.f)}${c.h?`<div class="tags">${c.h.filter(h=>STAGES.some(s=>s.hyp===h)).map(h=>`<span class="tag ${h===st.hyp?'on':''}">${esc(hypName(h))}</span>`).join('')}</div>`:''}</div></button>`}).join('')||`<div class="empty">${esc(G.noCards)}</div>`}</div>`;
}

function stageHTML(st,i){
  const G=TEXTS.game;
  if(i>=S.opened)return `<section class="stage locked"><div class="sh"><h3>${esc(st.name)}</h3><span class="need">${esc(G.locked)}</span></div></section>`;
  const met=stageMet(st),isCur=i===S.opened-1,have=realItems(st.id).length;
  const needTxt=isChain(st)
    ?G.needChain(have,need(st))+requiredIn(st.id).map(r=>G.needCard(cardName(r.card))).join('')
    :G.needPlain(have,st.min);
  let hyp='';
  if(isChain(st)){
    const H=CASE.hypotheses[st.hyp],f=S.flipped[st.hyp];
    hyp=`<div class="hyp"><div class="eyebrow">${esc(H.name)} · ${esc(G.hypLink)} ${esc(H.link)}</div><div class="front">${esc(H.front)}</div>
    ${f?`<div class="back"><span><b>${esc(G.hypFact)}</b> ${esc(H.fact)}</span><span><b>${esc(G.hypYes)}</b> ${esc(H.yes)}</span><span><b>${esc(G.hypNo)}</b> ${esc(H.no)}</span></div>`:''}
    <button class="linkbtn self-start" data-flip="${st.hyp}">${esc(f?G.flipBack:G.flip)}</button></div>`;
  }
  const consent=i===0?`<div class="q consent"><span class="id">✓</span><span class="txt"><b>${esc(G.consentLabel)}</b> ${esc(consentText())}</span><span class="min">${esc(G.min(CONFIG.consentMinutes))}</span></div>`:'';
  return `<section class="stage ${st.id===S.active?'active':''}" data-stage="${st.id}">
    <div class="sh"><h3>${i+1}. ${esc(st.name)}</h3><span class="need ${met?'ok':''}">${met?'✓ ':''}${esc(needTxt)}</span></div>
    ${hyp}${consent}
    ${stageItems(st.id).map(it=>qHTML(it,st)).join('')}
    ${nextStep(st,i,met,isCur)}
  </section>`;
}
/* Ветки других гипотез показаны после последней ветки кейса: в реальном гайде они шли бы здесь */
function canvasHTML(){
  const stages=STAGES.map(stageHTML),lastChain=STAGES.map(isChain).lastIndexOf(true);
  if(lastChain>=0)stages.splice(lastChain+1,0,...(CASE.otherBranches||[]).map(branchHTML));
  return stages.join('');
}
function branchHTML(h){
  const G=TEXTS.game,H=CASE.hypotheses[h];
  return `<section class="stage locked"><div class="sh"><h3>${esc(G.branchLabel(H.name))}</h3></div><p class="m0 locknote">${esc(H.front)}</p><p class="m0 note">${esc(G.branchNote)}</p></section>`;
}
const consentText=()=>CASE.consent.text+(S.consentExtra.length?' '+S.consentExtra.join('. '):'');

function nextStep(st,i,met,isCur){
  const G=TEXTS.game,H=G.hint,q=realItems(st.id),n=need(st),last=i===lastStage();
  let hint='',btns='';
  if(!rolled(st.id)){hint=H.roll;btns=`<button class="btn accent small" data-rollhere>${esc(G.btn.roll)}</button>`}
  else if(S.pendingCase&&isCur){hint=H.pending;btns=`<button class="btn small danger" data-case>${esc(G.btn.openCase)}</button>`}
  else{
    const miss=missingRequired(st.id);
    if(q.length<n)hint=H.addMore(n-q.length);
    else if(isChain(st)&&q.some(it=>!it.probes.length))hint=H.probe;
    else if(miss.length)hint=H.card(cardName(miss[0].card));
    else if(isCur&&!last)hint=H.minDone;
    else if(isCur)hint=H.finDone;
    if(canAddTo(st))btns+=`<button class="btn ghost small" data-add="${st.id}">${esc(G.btn.add)}</button>`;
    if(isCur&&!last)btns+=`<button class="btn small" data-next ${met?'':'disabled'}>${esc(G.btn.nextStage)}</button>`;
    if(isCur&&last&&met)btns+=`<button class="btn accent small" data-tobuild>${esc(G.btn.toCheck)}</button>`;
  }
  if(!isCur&&met&&rolled(st.id))hint='';
  return `${hint?`<div class="nexthint"><b>${esc(G.next)}</b> ${esc(hint)}</div>`:''}<div class="row-btns">${btns}</div>`;
}

function qHTML(it,st){
  const G=TEXTS.game,isKey=isChain(st)&&!it.off;
  return `<div class="q ${it.case?'case':''} ${it.off?'off':''}">
    <span class="id">${esc(itemLabel(it))}</span><span class="txt">${esc(it.text)}${it.off?`<br><small class="off-note">${esc(G.offTarget)}</small>`:''}</span><span class="min">${esc(G.min(itemMins(it)))}</span>
    ${it.probes&&it.probes.length?`<div class="probes">${it.probes.map(p=>`<div class="probe"><b>${esc(probe(p.card).n)}</b> ${esc(p.text)}</div>`).join('')}</div>`:''}
    <div class="acts">${isKey&&it.probes.length<CONFIG.maxProbes?`<button class="linkbtn" data-probe="${it.uid}">${esc(G.addProbe(CONFIG.probeMinutes))}</button>`:''}<button class="linkbtn muted" data-del="${it.uid}">${esc(G.remove)}</button></div>
  </div>`;
}

/* ===================== КУБИК ===================== */
const PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
const dieFaces=v=>Array.from({length:9},(_,k)=>`<i class="${v&&PIPS[v].includes(k)?'on':''}"></i>`).join('');
function diceHTML(cur){
  const D=TEXTS.dice,r=S.rolls[cur.id];
  let v;
  if(r===undefined)v=`<div class="verdict">${esc(D.start(cur.name))}</div>`;
  else if(r%2)v=`<div class="verdict"><b>${esc(D.odd)}</b> ${esc(D.oddText)}</div>`;
  else v=`<div class="verdict"><b>${esc(D.even)}</b> ${esc(S.pendingCase?D.evenPending:D.evenDone)}</div>`;
  const btn=r===undefined?`<button class="btn accent" id="roll">${esc(TEXTS.game.btn.roll)}</button>`:S.pendingCase?`<button class="btn danger" id="opencase">${esc(TEXTS.game.btn.openCase)}</button>`:'';
  return `<div class="eyebrow">${esc(D.label)}</div>
  <div class="diebox"><div class="die ${r!==undefined&&r%2===0?'even':''}" id="die" aria-label="${esc(r?D.ariaRolled(r):D.ariaIdle)}">${dieFaces(r)}</div>
  <div class="stack-sm">${btn}<span class="deckinfo">${esc(D.rule)}<br>${esc(D.deck(S.deck.length))}</span></div></div>${v}`;
}
function roll(){
  const cur=STAGES[S.opened-1],die=document.getElementById('die'),btn=document.getElementById('roll');
  if(btn)btn.disabled=true;toast(TEXTS.dice.rolling);
  const final=rnd(6)+1;
  const finish=()=>{S.rolls[cur.id]=final;if(final%2===0&&S.deck.length){S.pendingCase=S.deck.shift();render();setTimeout(()=>openSituation(S.pendingCase),350)}else render()};
  if(reducedMotion()||!die){finish();return}
  die.classList.add('rolling');let n=0;
  const iv=setInterval(()=>{die.innerHTML=dieFaces(rnd(6)+1);if(++n>8){clearInterval(iv);die.classList.remove('rolling');die.innerHTML=dieFaces(final);setTimeout(finish,250)}},80);
}

/* ===================== ОБРАБОТЧИКИ КАНВАСА ===================== */
function bindGame(){
  bindDemoBar();
  const on=(sel,fn)=>app.querySelectorAll(sel).forEach(b=>b.onclick=()=>fn(b));
  on('[data-tab]',b=>{S.active=b.dataset.tab;render()});
  on('[data-card]',b=>openCompose(b.dataset.card));
  on('[data-flip]',b=>{S.flipped[b.dataset.flip]=!S.flipped[b.dataset.flip];render()});
  on('[data-probe]',b=>openProbe(b.dataset.probe));
  on('[data-del]',b=>{S.items=S.items.filter(it=>it.uid!==b.dataset.del);render()});
  on('[data-next]',()=>{S.opened++;const st=STAGES[S.opened-1];S.active=st.id;if(st.hyp)S.flipped[st.hyp]=false;render()});
  on('#roll',roll);
  on('[data-rollhere]',b=>{b.disabled=true;roll()});
  on('[data-case],#opencase',()=>openSituation(S.pendingCase));
  on('[data-add]',b=>{S.active=b.dataset.add;openPicker(b.dataset.add)});
  on('[data-tobuild]',()=>{const bd=document.getElementById('build');if(bd){bd.scrollIntoView({behavior:'smooth',block:'center'});bd.focus()}});
  on('#restart',confirmRestart);
  on('#build',()=>{track('guide_built',S.limit+' мин');S.screen='guide';render();window.scrollTo(0,0)});
}

/* ===================== МОДАЛЬНЫЕ ОКНА ===================== */
const mroot=document.getElementById('modalRoot');let lastFocus=null;
function openModal(html,cls,onMount){
  lastFocus=document.activeElement;
  mroot.innerHTML=`<div class="overlay" role="dialog" aria-modal="true"><div class="modal ${cls}">${html}</div></div>`;
  const ov=mroot.firstChild;
  ov.addEventListener('keydown',e=>{if(e.key==='Escape'&&!ov.dataset.lock)closeModal()});
  onMount&&onMount(ov);
  const f=ov.querySelector('textarea,button,input');f&&f.focus();
}
function closeModal(){mroot.innerHTML='';lastFocus&&lastFocus.focus&&lastFocus.focus()}
let uidN=Date.now();const uid=()=>'i'+(uidN++).toString(36);
const selfChecks=list=>`<div class="selfcheck"><div class="eyebrow">${esc(TEXTS.compose.selfCheck)}</div>${list.map((t,k)=>`<label><input type="checkbox" id="sc${k}">${esc(t)}</label>`).join('')}</div>`;
const allChecked=(ov,list)=>list.every((_,k)=>ov.querySelector('#sc'+k).checked);

function openConsent(){
  const T=TEXTS.consent,items=CASE.consent.items;
  openModal(`<div class="eyebrow">${esc(T.kicker(CONFIG.consentMinutes))}</div><h2>${esc(T.title)}</h2>
  <p class="m0">${esc(T.lead)}</p>
  <div class="etalon"><div class="eyebrow">${esc(T.sounds)}</div>${esc(CASE.consent.text)}</div>
  <div class="selfcheck">${items.map((t,k)=>`<label><input type="checkbox" id="cs${k}" ${S.consent[k]?'checked':''}>${esc(t)}</label>`).join('')}</div>
  <div class="mfoot"><button class="btn accent" id="cgo" disabled>${esc(T.go)}</button></div>`,'green',ov=>{
    ov.dataset.lock='1';
    const upd=()=>{S.consent=items.map((_,k)=>ov.querySelector('#cs'+k).checked);ov.querySelector('#cgo').disabled=!S.consent.every(Boolean)};
    ov.querySelectorAll('input').forEach(i=>i.onchange=upd);upd();
    ov.querySelector('#cgo').onclick=()=>{S.consentDone=true;closeModal();render();toast(T.opened(STAGES[0].name))};
  });
}

function openCompose(id){
  const T=TEXTS.compose,c=card(id),st=stage(S.active),left=minutesLeft();
  const checks=(c.checks||STD_CHECKS).concat(isChain(st)?[T.checksHyp(st.hyp)]:[]);
  openModal(`<div class="eyebrow">${esc(c.name)} · ${esc(st.name)} · ${esc(TEXTS.game.min(c.min))}</div>
  <div class="formula">${esc(c.f)}</div>
  ${c.min>left?`<div class="etalon redbg">${esc(T.noFit(left,S.limit))}</div>`:''}
  <label for="qt" class="eyebrow">${esc(T.label)}</label>
  <textarea id="qt" placeholder="${esc(T.placeholder)}"></textarea>
  ${selfChecks(checks)}
  <div id="et" hidden class="etalon"><div class="eyebrow">${esc(T.etalon)}</div><div>${esc(c.e)}</div><div class="note"><b>${esc(T.why)}</b> ${esc(c.w)}</div></div>
  <div class="mfoot"><button class="btn ghost" id="cx">${esc(T.cancel)}</button><button class="btn ghost" id="show">${esc(T.show)}</button><button class="btn accent" id="put" disabled title="${esc(T.putTitle)}">${esc(T.put)}</button></div>`,'green',ov=>{
    const ta=ov.querySelector('#qt'),put=ov.querySelector('#put');let seen=false;
    const upd=()=>{put.disabled=!(ta.value.trim()&&seen&&allChecked(ov,checks)&&c.min<=left)};
    ta.oninput=upd;ov.querySelectorAll('input').forEach(i=>i.onchange=upd);
    ov.querySelector('#show').onclick=e=>{seen=true;ov.querySelector('#et').hidden=false;e.target.hidden=true;upd()};
    ov.querySelector('#cx').onclick=closeModal;
    put.onclick=()=>{S.items.push({uid:uid(),stage:st.id,card:c.id,text:ta.value.trim(),min:c.min,hyp:st.hyp||'',probes:[],cut:!!c.cut});closeModal();render()};
  });
}

function openPicker(stId){
  const T=TEXTS.compose,st=stage(stId),used=usedIds();
  openModal(`<div class="eyebrow">${esc(T.pickKicker(st.name))}</div><h2>${esc(T.pickTitle)}</h2>
  <div class="opts">${cardsFor(st).map(c=>`<button class="opt" data-pick="${c.id}" ${used.has(c.id)?'disabled':''}><b>${esc(c.name)}</b> · ${esc(TEXTS.game.min(c.min))}${used.has(c.id)?esc(TEXTS.game.played):''}<br>${esc(c.f)}</button>`).join('')}</div>
  <div class="mfoot"><button class="btn ghost" id="cx">${esc(T.cancel)}</button></div>`,'green',ov=>{
    ov.querySelector('#cx').onclick=closeModal;
    ov.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{closeModal();openCompose(b.dataset.pick)});
  });
}

function openProbe(itemUid){
  const T=TEXTS.probe,it=S.items.find(x=>x.uid===itemUid),used=usedIds(),left=minutesLeft(),cost=CONFIG.probeMinutes;
  openModal(`<div class="eyebrow">${esc(T.kicker(cost))}</div><h2>${esc(T.title)}</h2>
  <div class="etalon sunk"><div class="eyebrow">${esc(T.question)}</div>${esc(it.text)}</div>
  <div class="chips" role="group" aria-label="${esc(T.aria)}">${PROBES.map(p=>`<button class="chip" data-p="${p.id}" aria-pressed="false" ${used.has(p.id)?'disabled':''}>${esc(p.n)}</button>`).join('')}</div>
  <div id="pinfo" class="etalon yellowbg" hidden></div>
  ${left<cost?`<div class="etalon redbg">${esc(T.noTime)}</div>`:''}
  <label for="pt" class="eyebrow">${esc(T.label)}</label><textarea id="pt" placeholder="${esc(T.placeholder)}"></textarea>
  <div class="mfoot"><button class="btn ghost" id="cx">${esc(TEXTS.compose.cancel)}</button><button class="btn accent" id="put" disabled>${esc(T.put)}</button></div>`,'yellow',ov=>{
    let sel=null;const ta=ov.querySelector('#pt'),put=ov.querySelector('#put');
    const upd=()=>{put.disabled=!(sel&&ta.value.trim()&&left>=cost)};
    ov.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{
      ov.querySelectorAll('[data-p]').forEach(x=>x.setAttribute('aria-pressed','false'));b.setAttribute('aria-pressed','true');
      sel=b.dataset.p;const p=probe(sel),pi=ov.querySelector('#pinfo');pi.hidden=false;
      pi.innerHTML=`<div><b>${esc(T.when)}</b> ${esc(p.when)}</div><div><b>${esc(T.example)}</b> ${esc(p.ex)}</div>`;upd();
    });
    ta.oninput=upd;ov.querySelector('#cx').onclick=closeModal;
    put.onclick=()=>{it.probes.push({card:sel,text:ta.value.trim()});closeModal();render()};
  });
}

function openSituation(id){
  const c=situation(id);
  return c.kind==='bad'?openBadQuestion(c):openBrief(c);
}
function openBadQuestion(c){
  const T=TEXTS.situation,st=STAGES[S.opened-1],mins=st.fixMin;
  openModal(`<div class="eyebrow">${esc(T.badKicker(c.type))}</div><h2>${esc(T.badTitle)}</h2>
  <div class="etalon redbg"><div class="eyebrow">${esc(T.onCard)}</div><div class="formula">${esc(c.q)}</div></div>
  <p class="m0 note">${esc(T.willGo(st.name,mins))}</p>
  <label for="qt" class="eyebrow">${esc(T.yourVersion)}</label><textarea id="qt"></textarea>
  ${selfChecks(STD_CHECKS)}
  <div id="et" hidden class="etalon"><div class="eyebrow">${esc(T.etalon)}</div><div>${esc(c.e)}</div><div class="note"><b>${esc(T.review)}</b> ${esc(c.w)}</div></div>
  <div class="mfoot"><button class="btn ghost" id="show">${esc(T.show)}</button><button class="btn accent" id="put" disabled>${esc(T.put)}</button></div>`,'red',ov=>{
    ov.dataset.lock='1';const ta=ov.querySelector('#qt'),put=ov.querySelector('#put');let seen=false;
    const upd=()=>{put.disabled=!(ta.value.trim()&&seen&&allChecked(ov,STD_CHECKS))};
    ta.oninput=upd;ov.querySelectorAll('input').forEach(i=>i.onchange=upd);
    ov.querySelector('#show').onclick=e=>{seen=true;ov.querySelector('#et').hidden=false;e.target.hidden=true;upd()};
    put.onclick=()=>{S.items.push({uid:uid(),stage:st.id,case:c.id,text:ta.value.trim(),min:mins,hyp:st.hyp||'',probes:[]});S.pendingCase=null;S.caseLog.push(c.id);closeModal();render()};
  });
}
function openBrief(c){
  const T=TEXTS.situation,st=STAGES[S.opened-1];
  openModal(`<div class="eyebrow">${esc(T.briefKicker)}</div><h2>${esc(c.q)}</h2>
  <p class="m0">${esc(T.briefLead)}</p>
  <div class="opts">${c.opts.map((o,k)=>`<button class="opt" data-o="${k}">${esc(o.t)}</button>`).join('')}</div>
  <div id="res" hidden></div>
  <div class="mfoot"><button class="btn accent" id="ok" hidden>${esc(T.proceed)}</button></div>`,'red',ov=>{
    ov.dataset.lock='1';
    ov.querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>{
      const o=c.opts[+b.dataset.o];
      ov.querySelectorAll('[data-o]').forEach((x,k)=>{x.disabled=true;x.innerHTML=`<span class="mark">${esc(c.opts[k].m)}</span>${esc(c.opts[k].t)}`});
      b.classList.add('picked');
      const res=ov.querySelector('#res');res.hidden=false;
      res.className='etalon'+(o.m==='✘'?' redbg':'');
      res.innerHTML=`<div class="eyebrow">${esc(T.verdict[o.m])}</div><div>${esc(o.r)}</div>${c.effect?`<div class="note-sm"><b>${esc(T.changes)}</b> ${esc(c.effect)}</div>`:''}`;
      const ok=ov.querySelector('#ok');ok.hidden=false;ok.focus();
      ok.onclick=()=>{
        applySituation(c);
        if(o.off)S.items.push({uid:uid(),stage:st.id,case:c.id,text:o.off,min:st.fixMin,hyp:'',probes:[],off:true});
        S.pendingCase=null;S.caseLog.push(c.id);closeModal();render();
      };
    });
  });
}

function confirmRestart(){
  const T=TEXTS.restart;
  openModal(`<h2>${esc(T.title)}</h2><p class="m0">${esc(T.lead)}</p><div class="mfoot"><button class="btn ghost" id="cx">${esc(T.cancel)}</button><button class="btn" id="yes">${esc(T.yes)}</button></div>`,'ink',ov=>{
    ov.querySelector('#cx').onclick=closeModal;ov.querySelector('#yes').onclick=()=>{S=fresh();closeModal();render()};
  });
}

/* ===================== ГАЙД ===================== */
function guideRows(){
  const rows=[];let acc=0,n=0;
  const push=r=>{acc+=r.d;rows.push({...r,n:++n,acc:clock(acc)})};
  push({st:STAGES[0].name,text:TEXTS.guide.consentRow+consentText(),d:CONFIG.consentMinutes,pr:'must',h:'',p:''});
  STAGES.forEach(st=>{
    realItems(st.id).forEach((it,k)=>{
      let pr=k===0?'must':'can';
      if(it.cut)pr='cut';
      if(isRequiredCard(st.id,it.card))pr='must';
      push({st:st.name,text:it.text,d:itemMins(it),pr,h:hypName(it.hyp),p:it.probes.map(p=>p.text).join(' / ')});
    });
  });
  return {rows,reserve:S.limit-acc};
}
function renderGuide(){
  const T=TEXTS.guide,{rows,reserve}=guideRows();
  app.innerHTML=`${demoBar()}
  <header class="top"><div><div class="eyebrow">${esc(T.kicker(CASE.title))}</div><h1>${esc(T.title)}</h1>
  <p class="rq">${esc(TEXTS.game.rqLabel)} <b>${esc(CASE.rq)}</b></p></div>
  <div class="row-btns"><button class="btn ghost" id="back">${esc(T.back)}</button></div></header>
  <div class="tablewrap no-copy" id="guideTable"><table><thead><tr>${T.head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
  ${rows.map(r=>`<tr><td class="num">${r.n}</td><td>${esc(r.st)}</td><td>${esc(r.text)}</td><td class="num">${r.d}</td><td class="num">${r.acc}</td><td><span class="pr ${r.pr}">${esc(T.priority[r.pr])}</span></td><td>${esc(r.h)}</td><td>${esc(r.p)}</td></tr>`).join('')}
  <tr><td></td><td>${esc(T.reserve)}</td><td>${esc(T.reserveText)}</td><td class="num">${reserve}</td><td class="num">${clock(S.limit)}</td><td></td><td></td><td></td></tr>
  </tbody></table></div>
  ${mailFormHTML()}
  <section class="panel"><div class="eyebrow">${esc(T.nextLabel)}</div>
  <p class="m0 measure">${esc(T.nextText)}</p>
  ${(CASE.otherBranches||[]).length?`<div class="measure note"><p class="m0">${esc(T.branchesNote)}</p><ul class="branch-list">${CASE.otherBranches.map(h=>`<li>${esc(CASE.hypotheses[h].front)}</li>`).join('')}</ul></div>`:''}
  <div><button class="btn ghost" id="again">${esc(T.again)}</button></div></section>${footer()}`;
  bindDemoBar();
  const table=document.getElementById('guideTable');
  ['copy','cut','contextmenu','dragstart'].forEach(ev=>table.addEventListener(ev,e=>e.preventDefault()));
  document.getElementById('back').onclick=()=>{S.screen='game';render()};
  document.getElementById('again').onclick=()=>{track('game_start','повтор');S=fresh();S.screen='game';render();openConsent()};
  bindMailForm(rows,reserve);
}

/* ===================== ГАЙД НА ПОЧТУ ===================== */
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function mailFormHTML(){
  const M=TEXTS.mail;
  if(S.sent)return `<section class="panel mail"><div class="eyebrow">${esc(M.label)}</div><p class="m0 measure" role="status">${esc(M.sent(S.sent))}</p></section>`;
  return `<section class="panel mail"><div class="eyebrow">${esc(M.label)}</div>
  <p class="m0 measure">${esc(S.demo?M.leadDemo:M.lead)}</p>
  <form id="mailForm" class="mail-form" novalidate>
    <label for="mEmail" class="eyebrow">${esc(M.emailLabel)}</label>
    <input type="email" id="mEmail" class="field" autocomplete="email" inputmode="email" placeholder="${esc(M.placeholder)}" required>
    <input type="text" id="mSite" class="trap" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="check"><input type="checkbox" id="mConsent" required><span>${esc(M.consentBefore)}<a href="${CONFIG.links.privacy}" target="_blank" rel="noopener">${esc(M.consentLink)}</a></span></label>
    <label class="check"><input type="checkbox" id="mNews"><span>${esc(M.news)}</span></label>
    <div class="row-btns"><button type="submit" class="btn accent" id="mSend" disabled>${esc(M.send)}</button></div>
    <p class="m0 note" id="mStatus" role="status" aria-live="polite"></p>
  </form></section>`;
}
function bindMailForm(rows,reserve){
  const f=document.getElementById('mailForm');if(!f)return;
  const M=TEXTS.mail,email=f.querySelector('#mEmail'),consent=f.querySelector('#mConsent'),send=f.querySelector('#mSend'),status=f.querySelector('#mStatus');
  const upd=()=>{send.disabled=!(EMAIL_RE.test(email.value.trim())&&consent.checked)};
  email.oninput=upd;consent.onchange=upd;
  f.onsubmit=async e=>{
    e.preventDefault();if(send.disabled)return;
    send.disabled=true;status.textContent=M.sending;
    const addr=email.value.trim();
    const payload={type:'guide',email:addr,news:f.querySelector('#mNews').checked,demo:!!S.demo,trap:f.querySelector('#mSite').value,
      session_id:session.id,case_id:CASE.id,case_title:S.demo?M.demoTitle(CASE.title):CASE.title,rq:CASE.rq,limit:S.limit,situations:S.caseLog.join(' '),
      head:TEXTS.guide.head,
      rows:rows.map(r=>[r.n,r.st,r.text,r.d,r.acc,TEXTS.guide.priority[r.pr],r.h,r.p])
        .concat([['',TEXTS.guide.reserve,TEXTS.guide.reserveText,reserve,clock(S.limit),'','','']])};
    const res=await postToScript(payload);
    if(res.status==='ok'){S.sent=addr;render();toast(M.toast);return}
    status.textContent=M.errors[res.code]||M.errors.send;upd();
  };
}

/* ===================== СВЯЗЬ СО СКРИПТОМ ===================== */
/* Простой POST без заголовков: браузер не делает предварительный запрос, скрипт Google отвечает JSON */
async function postToScript(payload){
  if(!CONFIG.scriptUrl)return{status:'error',code:'send'};
  try{
    const r=await fetch(CONFIG.scriptUrl,{method:'POST',body:JSON.stringify(payload),headers:{'Content-Type':'text/plain;charset=utf-8'}});
    return await r.json();
  }catch(e){return{status:'error',code:'network'}}
}
/* Анонимная статистика воронки: без имени и почты, только событие и номер сессии */
const session={
  id:(()=>{try{let v=sessionStorage.getItem('szch-session');if(!v){v='s_'+Date.now().toString(36)+rnd(1e6).toString(36);sessionStorage.setItem('szch-session',v)}return v}catch(e){return 's_'+Date.now().toString(36)}})(),
  device:()=>window.innerWidth<=768?'mobile':'desktop'
};
function track(event,details){
  if(!CONFIG.scriptUrl||S.demo&&event!=='demo_open')return;
  const body=JSON.stringify({type:'game_event',event,session_id:session.id,device:session.device(),details:details||'',case_id:CASE.id});
  try{fetch(CONFIG.scriptUrl,{method:'POST',body,headers:{'Content-Type':'text/plain;charset=utf-8'},keepalive:true,mode:'no-cors'}).catch(()=>{})}catch(e){}
}

/* ===================== ДЕМО И ЭКСКУРСИЯ ===================== */
/* В демо на канвас ложится сама реплика из эталона, без пояснений вокруг неё */
const firstQuote=s=>{const m=s.match(/«([^»]*)»/);return m?m[1]:s};
let saved=null;
function demoState(){
  const st=fresh();
  Object.assign(st,{demo:true,screen:'game',consent:st.consent.map(()=>true),consentDone:true,opened:STAGES.length,active:DEMO.active,rolls:{...DEMO.rolls},caseLog:[DEMO.situation]});
  st.deck=st.deck.filter(x=>x!==DEMO.situation);
  DEMO.flipped.forEach(h=>st.flipped[h]=true);
  st.items=DEMO.items.map(([stageId,cardId,probes])=>{
    const c=card(cardId);
    return{uid:uid(),stage:stageId,card:cardId,text:firstQuote(c.e),min:c.min,hyp:stage(stageId).hyp||'',probes:(probes||[]).map(([id,t])=>({card:id,text:t})),cut:!!c.cut};
  });
  return st;
}
function startDemo(){track('demo_open');saved=S.demo?saved:S;S=demoState();render();window.scrollTo(0,0);startTour()}
function exitDemo(toGame){endTour();S=saved||fresh();saved=null;if(toGame){S=fresh();S.screen='game'}render();window.scrollTo(0,0);if(toGame)openConsent()}
function demoBar(){
  const T=TEXTS.demo;
  return S.demo?`<div class="demobar"><span><b>${esc(T.label)}</b> ${esc(T.text)}</span><span class="row-btns sm"><button class="btn small ghost" data-tour>${esc(T.tour)}</button><button class="btn small accent" data-play>${esc(T.play)}</button><button class="btn small ghost" data-exit>${esc(T.exit)}</button></span></div>`:'';
}
function bindDemoBar(){
  app.querySelectorAll('[data-tour]').forEach(b=>b.onclick=()=>{if(S.screen!=='game'){S.screen='game';render()}startTour()});
  app.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>exitDemo(true));
  app.querySelectorAll('[data-exit]').forEach(b=>b.onclick=()=>exitDemo(false));
}
let tourI=-1;
const tourParams=()=>({limit:CASE.limit,reserve:CONFIG.reserveMinutes,consentItems:CASE.consent.items.length,chainMin:chainMinDefault});
function startTour(){tourI=0;showTour()}
function endTour(){tourI=-1;document.querySelectorAll('.tour-hl').forEach(e=>e.classList.remove('tour-hl'));const t=document.getElementById('tour');if(t)t.remove()}
function showTour(){
  const T=TEXTS.tour,p=tourParams(),step=TOUR[tourI],el=document.querySelector(step.sel);
  document.querySelectorAll('.tour-hl').forEach(e=>e.classList.remove('tour-hl'));
  if(el){el.classList.add('tour-hl');el.scrollIntoView({behavior:reducedMotion()?'auto':'smooth',block:'center'})}
  let box=document.getElementById('tour');
  if(!box){box=document.createElement('div');box.id='tour';box.className='tour';box.setAttribute('role','dialog');document.body.appendChild(box)}
  box.innerHTML=`<div class="eyebrow">${esc(T.step(tourI+1,TOUR.length))}</div><h3>${esc(step.t(p))}</h3><p>${esc(step.d(p))}</p>
  <div class="mfoot"><button class="btn ghost small" id="tx">${esc(T.close)}</button>${tourI?`<button class="btn ghost small" id="tp">${esc(T.back)}</button>`:''}${step.last?`<button class="btn accent small" id="tg">${esc(T.show)}</button>`:`<button class="btn accent small" id="tn">${esc(T.next)}</button>`}</div>`;
  box.querySelector('#tx').onclick=endTour;
  const tp=box.querySelector('#tp');if(tp)tp.onclick=()=>{tourI--;showTour()};
  const tn=box.querySelector('#tn');if(tn){tn.onclick=()=>{tourI++;showTour()};tn.focus()}
  const tg=box.querySelector('#tg');if(tg){tg.onclick=()=>{endTour();S.screen='guide';render();window.scrollTo(0,0)};tg.focus()}
}

/* ===================== ПРОЧЕЕ ===================== */
let toastTimer;
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,2600)}

/* ===================== ЗАПУСК ===================== */
track('page_open');
render();
if(S.screen==='game'&&!S.consentDone)openConsent();
else if(S.screen==='game'&&S.pendingCase)openSituation(S.pendingCase);
