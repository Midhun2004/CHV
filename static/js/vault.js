// ════ INIT ════
const AU = sessionStorage.getItem('vaultUser') || '';
if(!AU){ window.location.href='/'; }

document.getElementById('uAvt').innerText = AU[0]?.toUpperCase()||'?';
document.getElementById('uName').innerText = AU;

// ════ UTILS ════
function icon(t){return t==='image'?'🖼️':t==='video'?'🎬':t==='audio'?'🎵':'📄';}
function fmt(b){if(b<1024)return b+'B';if(b<1048576)return(b/1024).toFixed(1)+'KB';return(b/1048576).toFixed(2)+'MB';}
function dType(mt){if(mt.startsWith('image'))return'image';if(mt.startsWith('video'))return'video';if(mt.startsWith('audio'))return'audio';return'document';}
function toast(m,t='ok'){const el=document.getElementById('toast');
  el.className='show'+(t==='err'?' err':'');el.innerText=(t==='err'?'✗  ':'✓  ')+m;
  clearTimeout(el._t);el._t=setTimeout(()=>el.className='',2800);}

// ════ TRUST ════
let trust=100,vActive=true;
let mouseEnabled=true,lastMT=Date.now(),mHist=[],mScH=[];
let lastFaceStatus='unknown';

function updateTrust(){
  trust=Math.max(0,Math.min(100,trust));
  document.getElementById('tFill').style.width=trust+'%';
  document.getElementById('tFill').style.background=
    trust>70?'#10b981':trust>40?'#f59e0b':'#ef4444';
  document.getElementById('tScore').innerText=Math.floor(trust)+'%';
  if(trust<40&&vActive){
    vActive=false;
    toast('Trust critical — vault locked','err');
    setTimeout(()=>{sessionStorage.clear();location.href='/';},2200);
  }
}

// ════ CHV: face check every 3s ════
// OWNER ONLY POLICY:
//   match        → +15 (owner confirmed)
//   wrong_person → −15 (intruder detected — hard penalty, immediate warning)
//   no_face      → −5  (owner absent)
//   error        → −5  (camera/detection failure)
// Face scoring is INDEPENDENT of mouse scoring — no overlapping task.
let chvCam=null,consecutiveWrongPerson=0;
navigator.mediaDevices.getUserMedia({video:true})
.then(s=>{
  chvCam=s;
  document.getElementById('mCam').srcObject=s;
  setInterval(async()=>{
    if(!vActive)return;
    const v=document.getElementById('mCam');
    const cv=document.createElement('canvas');
    cv.width=v.videoWidth||320;cv.height=v.videoHeight||240;
    cv.getContext('2d').drawImage(v,0,0);
    try{
      const r=await fetch('/api/verify',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({user:AU,image:cv.toDataURL('image/jpeg',.7)})});
      const d=await r.json();
      if(d.status==='match'){
        // Owner face confirmed — restore trust
        trust=Math.min(100,trust+15);
        lastFaceStatus='match';
        consecutiveWrongPerson=0;
        document.getElementById('faceStatusLbl').innerText='👤 Face: OWNER ✓';
        document.getElementById('faceStatusLbl').style.color='#10b981';
      } else if(d.status==='wrong_person'){
        // Intruder detected — severe penalty
        trust=Math.max(0,trust-15);
        lastFaceStatus='intruder';
        consecutiveWrongPerson++;
        document.getElementById('faceStatusLbl').innerText='⛔ Face: INTRUDER DETECTED';
        document.getElementById('faceStatusLbl').style.color='#ef4444';
        toast('⚠ Unrecognised face detected!','err');
        // 3 consecutive wrong-person readings → immediate lockout
        if(consecutiveWrongPerson>=3){
          vActive=false;
          trust=0;updateTrust();
          toast('⛔ Security breach — vault locked','err');
          setTimeout(()=>{sessionStorage.clear();location.href='/';},1800);
          return;
        }
      } else if(d.status==='no_face'){
        // Owner left camera view
        trust=Math.max(0,trust-5);
        lastFaceStatus='absent';
        consecutiveWrongPerson=0;
        document.getElementById('faceStatusLbl').innerText='👁 Face: ABSENT −5';
        document.getElementById('faceStatusLbl').style.color='#f59e0b';
      } else {
        trust=Math.max(0,trust-5);
        lastFaceStatus='unknown';
        document.getElementById('faceStatusLbl').innerText='👁 Face: UNVERIFIED −5';
        document.getElementById('faceStatusLbl').style.color='#f59e0b';
      }
    }catch{
      trust=Math.max(0,trust-5);
      lastFaceStatus='error';
    }
    updateTrust();
  },3000);
}).catch(()=>{});

// ════ MOUSE TRACKING ════
// Mouse scoring is INDEPENDENT of face scoring.
// Penalties fire only from mouse checks — no overlap with face timer.
// However: if face is absent/intruder AND mouse is also idle/anomaly → combined penalty
document.addEventListener('mousemove',e=>{
  if(!vActive||!mouseEnabled)return;
  mHist.push({x:e.clientX,y:e.clientY,t:Date.now()});
  lastMT=Date.now();
  const cut=Date.now()-3000;mHist=mHist.filter(p=>p.t>cut);
  document.getElementById('mLbl').innerText='Mouse: ACTIVE';
  document.getElementById('mDot').style.background='#10b981';
});

function buildProf(traj){
  const sp=[],rh=[];
  for(let i=1;i<traj.length;i++){
    const dx=traj[i].x-traj[i-1].x,dy=traj[i].y-traj[i-1].y,dt=(traj[i].t-traj[i-1].t)||1;
    sp.push(Math.sqrt(dx*dx+dy*dy)/dt);rh.push(dt);
  }
  const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
  const std=a=>{const m=avg(a);return Math.sqrt(avg(a.map(x=>(x-m)**2)));};
  return{avgSpeed:avg(sp),stdSpeed:std(sp),avgRhythm:avg(rh),stdRhythm:std(rh)};
}

setInterval(async()=>{
  if(!vActive)return;
  if(!mouseEnabled){lastMT=Date.now();return;}
  const idle=(Date.now()-lastMT)/1000;

  // ── MOUSE IDLE CHECK (independent, fires every 5s of idle) ──
  if(idle>=5){
    // If face is also absent/intruder at same time → double penalty (combo)
    const comboFail=(lastFaceStatus==='absent'||lastFaceStatus==='intruder'||lastFaceStatus==='unknown');
    if(comboFail){
      trust=Math.max(0,trust-5);  // combo: face absent + mouse idle = −5 (not double-counted, just larger)
      document.getElementById('mLbl').innerText=`Mouse: IDLE+FACELESS ${Math.floor(idle)}s`;
      document.getElementById('mDot').style.background='#ef4444';
    } else {
      trust=Math.max(0,trust-2.5);  // mouse idle only −2.5
      document.getElementById('mLbl').innerText=`Mouse: IDLE ${Math.floor(idle)}s`;
      document.getElementById('mDot').style.background='#f59e0b';
    }
    updateTrust();
  }

  // ── MOUSE ANOMALY CHECK (independent) ──
  // Only fires if enough data and mouse IS moving (not idle)
  if(mHist.length>20&&idle<5){
    const lp=buildProf(mHist.map(p=>({x:p.x,y:p.y,t:p.t-(mHist[0]?.t||0)})));
    try{
      const r=await fetch('/api/get_mouse_baseline',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({user:AU})});
      const d=await r.json();
      if(d.baseline?.avgSpeed){
        const b=d.baseline;
        const sr=Math.min(b.avgSpeed,lp.avgSpeed)/Math.max(b.avgSpeed,lp.avgSpeed)||1;
        const rr=Math.min(b.avgRhythm,lp.avgRhythm)/Math.max(b.avgRhythm,lp.avgRhythm)||1;
        const score=(sr+rr)/2;
        if(score<0.3){
          // Suspicious movement pattern — doesn't match owner's baseline
          // If face is ALSO not matching → combo penalty
          const faceAlsoBad=(lastFaceStatus!=='match');
          if(faceAlsoBad){
            trust=Math.max(0,trust-6);  // suspicious mouse + face not owner = −6
            document.getElementById('mLbl').innerText='Mouse: SUSPICIOUS+NO_OWNER';
            document.getElementById('mDot').style.background='#ef4444';
            toast('⚠ Suspicious behaviour — unrecognised user pattern','err');
          } else {
            trust=Math.max(0,trust-3);  // anomalous mouse, face ok = −3
            document.getElementById('mLbl').innerText='Mouse: ANOMALY';
            document.getElementById('mDot').style.background='#ef4444';
          }
          updateTrust();
        } else if(score>=0.65&&lastFaceStatus==='match'){
          // Mouse matches owner AND face matches → slight recovery
          document.getElementById('mLbl').innerText='Mouse: OWNER PATTERN ✓';
          document.getElementById('mDot').style.background='#10b981';
        }
      }
    }catch{}
  }

  mScH.push(idle<5?1:0);if(mScH.length>20)mScH.shift();
  const cv=document.getElementById('mChart');
  if(cv){cv.width=cv.offsetWidth||240;cv.height=33;
    const ctx=cv.getContext('2d'),w=cv.width/20;
    ctx.clearRect(0,0,cv.width,cv.height);
    mScH.forEach((v,i)=>{ctx.fillStyle=v?'#10b981':'#ef4444';
      ctx.fillRect(i*w,2,w-2,26);});}
},5000);

// ════ CAPTCHA ════
let capCl=0,capTimes=[],capSt2=Date.now();
setTimeout(showCap,90000);
function showCap(){
  if(!vActive)return;
  capCl=0;capTimes=[];capSt2=Date.now();
  document.getElementById('capOv').classList.remove('hidden');
  document.getElementById('capProg').innerHTML='<div class="cdot"></div>'.repeat(5);
  const z=document.getElementById('capZone');
  z.onmousemove=e=>{const r=z.getBoundingClientRect();
    const c=document.getElementById('capCur');
    c.style.left=(e.clientX-r.left)+'px';c.style.top=(e.clientY-r.top)+'px';};
  moveCap();document.getElementById('capSt').innerText='Click all dots!';
}
function moveCap(){
  const z=document.getElementById('capZone'),d=document.getElementById('capDot');
  d.style.left=Math.random()*(z.offsetWidth-32)+'px';
  d.style.top=Math.random()*(z.offsetHeight-32)+'px';
  d.style.display='block';d.onclick=capClick;
}
function capClick(){
  capTimes.push(Date.now()-capSt2);capCl++;
  document.querySelectorAll('.cdot')[capCl-1]?.classList.add('done');
  if(capCl>=5){
    document.getElementById('capDot').style.display='none';
    const ivs=capTimes.map((t,i)=>i>0?t-capTimes[i-1]:t);
    const avg=ivs.reduce((a,b)=>a+b,0)/ivs.length;
    const vr=ivs.reduce((s,t)=>s+(t-avg)**2,0)/ivs.length;
    const bot=avg<200||vr<50||capTimes.at(-1)>15000;
    document.getElementById('capSt').innerText=bot?'⚠ Suspicious':'✓ Human verified!';
    document.getElementById('capSt').style.color=bot?'#ef4444':'#10b981';
    if(bot)trust=Math.max(0,trust-15);
    // NO trust increase on captcha pass — only face/voice give +15
    updateTrust();
    setTimeout(()=>{document.getElementById('capOv').classList.add('hidden');
      setTimeout(showCap,90000);},1500);
  } else moveCap();
}

// ════ UPLOAD MODAL ════
let pendingFiles=[];
function openUpModal(){
  mouseEnabled=false;lastMT=Date.now();
  document.getElementById('umList').innerHTML='';pendingFiles=[];
  document.getElementById('upModal').classList.remove('hidden');
}
function closeUpModal(){
  document.getElementById('upModal').classList.add('hidden');
  mouseEnabled=true;lastMT=Date.now();
}
function previewFiles(files){
  pendingFiles=Array.from(files);
  document.getElementById('umList').innerHTML=pendingFiles.map(f=>`
    <div class="umrow">
      <span>${icon(dType(f.type))}</span>
      <span>${f.name}</span>
      <span style="color:#aaa;font-size:11px;">${fmt(f.size)}</span>
    </div>`).join('');
}
async function uploadFiles(){
  if(!pendingFiles.length){toast('No files selected','err');return;}
  for(const f of pendingFiles){
    await new Promise(res=>{
      const rd=new FileReader();
      rd.onload=async e=>{
        await fetch('/api/upload',{method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({user:AU,name:f.name,size:f.size,
            ftype:dType(f.type),content:e.target.result})});
        res();
      };rd.readAsDataURL(f);
    });
  }
  closeUpModal();loadFiles();loadChain();
  toast(`${pendingFiles.length} file(s) uploaded ✓`);
}

// ════ TABS ════
let curTab='files';
function switchTab(t){
  curTab=t;
  document.getElementById('pFiles').classList.toggle('hidden',t!=='files');
  document.getElementById('pChain').classList.toggle('hidden',t!=='chain');
  document.getElementById('tabF').classList.toggle('on',t==='files');
  document.getElementById('tabC').classList.toggle('on',t==='chain');
  if(t==='chain')loadChain();else loadFiles();
}

// ════ FILES ════
let allFiles=[],filt='all',srchQ='';
function setFilt(f,btn){filt=f;
  document.querySelectorAll('.fbtn').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');renderFiles();}
function onSrch(q){srchQ=q.toLowerCase();renderFiles();}

async function loadFiles(){
  const r=await fetch('/api/files?user='+AU);
  const d=await r.json();allFiles=d.files||[];
  updateStats();renderFiles();
}
function renderFiles(){
  let fs=allFiles;
  if(filt!=='all')fs=fs.filter(f=>f.ftype===filt);
  if(srchQ)fs=fs.filter(f=>f.name.toLowerCase().includes(srchQ));
  const g=document.getElementById('fGrid');
  if(!fs.length){g.innerHTML='<div class="empty">🗃️<br>No files yet</div>';return;}
  g.innerHTML=fs.map(f=>`
    <div class="fc">
      <div class="fi">${icon(f.ftype)}</div>
      <div class="fn2" title="${f.name}">${f.name}</div>
      <div class="fm">${fmt(f.size)}</div>
      <div class="fa">
        <button class="bsm bv" onclick="viewFile(${f.id})">👁 View</button>
        <button class="bsm bch" onclick="commitChain(${f.id})" title="Commit to blockchain">⛓</button>
        <button class="bsm bd" onclick="delFile(${f.id})">🗑</button>
      </div>
    </div>`).join('');
}
function viewFile(id){
  const f=allFiles.find(x=>x.id===id);if(!f)return;
  document.getElementById('pmFn').innerText=f.name+' · '+fmt(f.size);
  const b=document.getElementById('pmBody');
  b.innerHTML=f.ftype==='image'
    ?`<img src="${f.content}" style="max-width:90vw;max-height:75vh;border-radius:11px;">`
    :f.ftype==='video'
    ?`<video src="${f.content}" controls autoplay style="max-width:90vw;max-height:75vh;border-radius:11px;"></video>`
    :f.ftype==='audio'
    ?`<audio src="${f.content}" controls autoplay style="margin-top:20px;"></audio>`
    :`<div style="color:#fff;text-align:center;padding:20px;">
        <div style="font-size:42px;margin-bottom:12px;">📄</div>
        <a href="${f.content}" download="${f.name}"
          style="color:#a78bfa;font-weight:700;text-decoration:none;">⬇ Download</a>
      </div>`;
  document.getElementById('pm').classList.remove('hidden');
}
async function delFile(id){
  if(!confirm('Delete this file?'))return;
  await fetch('/api/delete_file',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id,user:AU})});
  loadFiles();toast('File deleted');
}
function closePM(){document.getElementById('pm').classList.add('hidden');}
document.getElementById('pm').addEventListener('click',function(e){if(e.target===this)closePM();});

// ════ BLOCKCHAIN ════
async function commitChain(id){
  if(!confirm('Commit to blockchain? File becomes IMMUTABLE — cannot be deleted or changed.'))return;
  toast('⛏ Mining block… please wait');
  const r=await fetch('/api/mine',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({user:AU,file_id:id})});
  const d=await r.json();
  if(d.status==='ok'){
    toast(`Block #${d.block.idx} mined (nonce ${d.block.proof})`);
    loadFiles();loadChain();switchTab('chain');
  } else toast('Mining failed: '+(d.msg||'error'),'err');
}

async function loadChain(){
  const r=await fetch('/api/chain');const d=await r.json();
  const chain=d.chain||[];const valid=d.valid;

  document.getElementById('cSt').className='cst '+(valid?'ok':'err');
  document.getElementById('cSt').innerText=valid?'✓ Chain Valid':'✗ Chain Invalid!';
  document.getElementById('chainBadge').style.background=valid?'#ecfdf5':'#fef2f2';
  document.getElementById('chainBadge').style.color=valid?'#059669':'#dc2626';
  document.getElementById('chainBadge').innerText=valid?'✓ Chain Valid':'✗ Invalid!';

  document.getElementById('cBlocks').innerHTML=chain.slice(-5).reverse().map(b=>`
    <div class="cblock">
      <span style="font-weight:700;color:#333;">Block #${b.idx}</span>
      <span class="ch">${b.block_hash.substring(0,26)}…</span>
      <span style="color:#aaa;font-size:9px;">
        ${b.owner} · ${b.file_name} · nonce:${b.proof}</span>
    </div>`).join('');

  const mine=chain.filter(b=>b.owner===AU);
  const g=document.getElementById('cGrid');
  if(!mine.length){
    g.innerHTML='<div class="empty">No files committed to blockchain yet.<br>Use the ⛓ button on any file.</div>';
  } else {
    g.innerHTML=mine.map(b=>`
      <div class="fc imm">
        <div class="fi">${icon(b.file_type)}</div>
        <div class="ibadge">⛓ BLOCK #${b.idx}</div>
        <div class="fn2" style="margin-top:6px;" title="${b.file_name}">${b.file_name}</div>
        <div class="fm">${fmt(b.file_size)} · nonce:${b.proof}</div>
        <div class="fhash">${b.block_hash}</div>
        <div class="fa" style="margin-top:9px;">
          <button class="bsm bv" onclick="showHash(${b.idx})">🔍 Full Details</button>
        </div>
      </div>`).join('');
  }
  // update on-chain count in stats
  document.getElementById('sBC').innerText=mine.length;
}

function showHash(idx){
  fetch('/api/chain').then(r=>r.json()).then(d=>{
    const b=d.chain.find(x=>x.idx===idx);if(!b)return;
    document.getElementById('hmBody').innerHTML=`
      <div class="hrow"><div class="hlb">Block Index</div>
        <div class="hval">#${b.idx}</div></div>
      <div class="hrow"><div class="hlb">Block Hash (SHA-256)</div>
        <div class="hval">${b.block_hash}</div></div>
      <div class="hrow"><div class="hlb">Previous Block Hash</div>
        <div class="hval">${b.prev_hash}</div></div>
      <div class="hrow"><div class="hlb">File Hash (SHA-256)</div>
        <div class="hval">${b.file_hash}</div></div>
      <div class="hrow"><div class="hlb">File Name</div>
        <div class="hval">${b.file_name}</div></div>
      <div class="hrow"><div class="hlb">Owner</div>
        <div class="hval">${b.owner}</div></div>
      <div class="hrow"><div class="hlb">Proof of Work (nonce)</div>
        <div class="hval">${b.proof}</div></div>
      <div class="hrow"><div class="hlb">Timestamp</div>
        <div class="hval">${new Date(b.timestamp*1000).toLocaleString()}</div></div>`;
    document.getElementById('hashModal').classList.remove('hidden');
  });
}

async function updateStats(){
  let imgs=0,sz=0;
  allFiles.forEach(f=>{sz+=f.size;if(f.ftype==='image')imgs++;});
  document.getElementById('sTF').innerText=allFiles.length;
  document.getElementById('sIM').innerText=imgs;
  document.getElementById('sSZ').innerText=(sz/1048576).toFixed(2);
}

function doLogout(){
  vActive=false;
  if(chvCam)chvCam.getTracks().forEach(t=>t.stop());
  sessionStorage.clear();
  window.location.href='/';
}

// ════ INIT VAULT ════
loadFiles();loadChain();
toast(`Welcome back, ${AU}! Vault unlocked.`);