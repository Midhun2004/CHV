let AU='',cam=null,rFaceDone=false,enrolledPhrase='';
let cCl=0,cStart=0,cTraj=[];

function showR(id){
  ['r0','r1','r2','r3'].forEach(s=>document.getElementById(s).classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function setAle(m){
  const el=document.getElementById('rAlert');
  if(!m){el.classList.add('hidden');return;}
  el.classList.remove('hidden');el.innerText=m;
}

// ── STEP R0: register init ──
async function doRegister(){
  AU=document.getElementById('ru').value.trim();
  const pw=document.getElementById('rp').value;
  if(!AU||!pw){setAle('Please fill both fields.');return;}
  if(AU.length<2){setAle('Username must be at least 2 characters.');return;}
  if(pw.length<4){setAle('Password must be at least 4 characters.');return;}
  setAle('');
  const r=await fetch('/api/reg_init',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({user:AU,pwd:pw})});
  const d=await r.json();
  if(d.status==='exists'){setAle('Username already taken — choose another.');return;}
  showR('r1');
  startFaceEnroll();
}

// ── STEP R1: face enrollment ──
function startFaceEnroll(){
  if(cam)cam.getTracks().forEach(t=>t.stop());
  navigator.mediaDevices.getUserMedia({video:true})
  .then(s=>{
    cam=s;
    document.getElementById('vid').srcObject=s;
    runFaceEnroll();
  })
  .catch(()=>{
    document.getElementById('rFSt').innerText='⚠ Camera permission denied';
  });
}

function runFaceEnroll(){
  let pts=0;const NEED=18;
  document.getElementById('rFill').style.width='0%';
  document.getElementById('rFSt').innerText='Scanning…';
  const t=setInterval(async()=>{
    const v=document.getElementById('vid');
    const cv=document.createElement('canvas');
    cv.width=v.videoWidth||320;cv.height=v.videoHeight||240;
    cv.getContext('2d').drawImage(v,0,0);
    const r=await fetch('/api/reg_face',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user:AU,image:cv.toDataURL('image/jpeg',.85)})});
    const d=await r.json();
    if(d.status==='found'){
      pts++;
      document.getElementById('rFill').style.width=(pts/NEED*100)+'%';
      document.getElementById('rFSt').innerText=`Face captured — ${pts}/${NEED}`;
    } else {
      document.getElementById('rFSt').innerText='No face detected — look at camera';
    }
    if(pts>=NEED){
      clearInterval(t);
      cam.getTracks().forEach(tr=>tr.stop());cam=null;
      showR('r2');
    }
  },320);
}

// ── STEP R2: mouse calibration ──
function startMouseCal(){
  document.getElementById('mStartBtn').classList.add('hidden');
  document.getElementById('mStartTxt').classList.add('hidden');
  cCl=0;cStart=Date.now();cTraj=[];moveDot();
}
function moveDot(){
  const d=document.getElementById('tDot'),z=document.getElementById('mZone');
  d.style.left=Math.random()*(z.offsetWidth-30)+'px';
  d.style.top=Math.random()*(z.offsetHeight-30)+'px';
  d.style.display='block';
  document.getElementById('dProg').innerText=`${cCl}/10 dots clicked`;
}
async function dotClick(){
  cCl++;
  cTraj.push({x:parseInt(document.getElementById('tDot').style.left),
               y:parseInt(document.getElementById('tDot').style.top),
               t:Date.now()-cStart});
  if(cCl>=10){
    document.getElementById('tDot').style.display='none';
    const prof=buildProf(cTraj);
    await fetch('/api/reg_mouse',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user:AU,baseline:prof})});
    showR('r3');
  } else moveDot();
}
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

// ── STEP R3: voice enrollment — capture BOTH voiceprint + phrase text ──
function enrollVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){
    document.getElementById('rVSt').style.color='#ef4444';
    document.getElementById('rVSt').innerText='⚠ Browser does not support speech recognition. Use Chrome.';
    return;
  }
  document.getElementById('rVSt').style.color='#f59e0b';
  document.getElementById('rVSt').innerText='🔴 Recording… speak your phrase now';
  document.getElementById('rMicBtn').style.opacity='0.5';
  document.getElementById('rVEnrolled').classList.add('hidden');

  let audioCtx=null,audioSamples=[],scriptProc=null,mediaStream=null;

  navigator.mediaDevices.getUserMedia({audio:true,video:false})
  .then(stream=>{
    mediaStream=stream;
    audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    const src=audioCtx.createMediaStreamSource(stream);
    scriptProc=audioCtx.createScriptProcessor(4096,1,1);
    src.connect(scriptProc);scriptProc.connect(audioCtx.destination);
    scriptProc.onaudioprocess=e=>{
      audioSamples.push(...e.inputBuffer.getChannelData(0));
    };

    let srPhrase='',srDone=false,audioDone=false;

    function trySave(){
      if(!srDone||!audioDone)return;
      if(!srPhrase){
        document.getElementById('rMicBtn').style.opacity='1';
        document.getElementById('rVSt').style.color='#ef4444';
        document.getElementById('rVSt').innerText='⚠ No speech detected. Try again.';
        return;
      }
      const vp=extractVoiceprint(new Float32Array(audioSamples));
      const vpArr=Array.from(vp);
      fetch('/api/reg_voice',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({user:AU,phrase:srPhrase,voiceprint:vpArr})
      }).then(()=>{
        document.getElementById('rMicBtn').style.opacity='1';
        document.getElementById('rVSt').style.color='#10b981';
        document.getElementById('rVSt').innerText='✓ Voice & phrase enrolled!';
        document.getElementById('enrolledTxt').innerText=`"${srPhrase}"`;
        document.getElementById('rVEnrolled').classList.remove('hidden');
        enrolledPhrase=srPhrase;
      });
    }

    setTimeout(()=>{
      try{scriptProc.disconnect();audioCtx.close();mediaStream.getTracks().forEach(t=>t.stop());}catch(e){}
      audioDone=true;trySave();
    },4000);

    const rec=new SR();
    rec.lang='en-US';rec.maxAlternatives=1;rec.continuous=false;rec.interimResults=false;
    rec.onresult=e=>{
      srPhrase=e.results[0][0].transcript.toLowerCase().trim().replace(/[^a-z0-9\s]/g,'');
      srDone=true;trySave();
    };
    rec.onerror=()=>{srPhrase='';srDone=true;trySave();};
    rec.onend=()=>{if(!srDone){srPhrase='';srDone=true;trySave();}};
    rec.start();
  })
  .catch(()=>{
    document.getElementById('rMicBtn').style.opacity='1';
    document.getElementById('rVSt').style.color='#ef4444';
    document.getElementById('rVSt').innerText='⚠ Microphone access denied.';
  });
}

// Extract spectral voiceprint (shared with login)
function extractVoiceprint(samples){
  const N=512,hop=256,frames=[];
  for(let i=0;i+N<samples.length;i+=hop){
    const f=samples.slice(i,i+N);
    for(let j=0;j<N;j++)f[j]*=.5*(1-Math.cos(2*Math.PI*j/(N-1)));
    const mg=new Float32Array(32);
    for(let k=0;k<32;k++){
      let re=0,im=0;
      for(let n=0;n<N;n++){re+=f[n]*Math.cos(2*Math.PI*k*n/N);im-=f[n]*Math.sin(2*Math.PI*k*n/N);}
      mg[k]=Math.sqrt(re*re+im*im);
    }
    frames.push(mg);
  }
  if(!frames.length)return new Float32Array(32);
  const p=new Float32Array(32);
  frames.forEach(f=>f.forEach((v,i)=>p[i]+=v));
  for(let i=0;i<32;i++)p[i]/=frames.length;
  const norm=Math.sqrt(p.reduce((a,b)=>a+b*b,0))||1;
  return p.map(v=>v/norm);
}

function reEnroll(){
  enrolledPhrase='';
  document.getElementById('rVEnrolled').classList.add('hidden');
  document.getElementById('rVSt').style.color='var(--warn)';
  document.getElementById('rVSt').innerText='Click mic — speak your passphrase clearly';
}

function finishEnrollment(){
  toast('Account created! Please login.');
  setTimeout(()=>window.location.href='/',1200);
}