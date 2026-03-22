let AU='',cam=null,facePts=0,faceTimer=null;
let voiceBusy=false,voiceAttempts=0;
const MAX_VOICE_ATTEMPTS=3;

// ── Load user cards ──
async function loadUsers(){
  const r=await fetch('/api/users');
  const d=await r.json();
  const grid=document.getElementById('userGrid');
  if(!d.users||!d.users.length){
    grid.innerHTML='<div class="no-users">No accounts yet.<br><a href="/register" style="color:#a78bfa;">Create one →</a></div>';
    return;
  }
  grid.innerHTML=d.users.map(u=>`
    <div class="ucard" onclick="selectUser('${u}')">
      <div class="ucard-av">${u[0].toUpperCase()}</div>
      <div class="ucard-name">${u}</div>
    </div>`).join('');
}
loadUsers();

function showOnly(id){
  ['step0','step1','step2'].forEach(s=>document.getElementById(s).classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ── User selected → open camera immediately ──
function selectUser(u){
  AU=u;
  document.getElementById('fUser').innerText=u;
  showOnly('step1');
  startFaceScan();
}

function cancelFace(){
  stopCam();showOnly('step0');
}
function cancelVoice(){
  showOnly('step1');facePts=0;
  document.getElementById('sFill').style.width='0%';
  document.getElementById('sSt').innerText='Scanning…';
  document.getElementById('sReject').classList.add('hidden');
  startFaceScan();
}

// ── Camera ──
function stopCam(){
  if(cam){cam.getTracks().forEach(t=>t.stop());cam=null;}
  if(faceTimer){clearInterval(faceTimer);faceTimer=null;}
}

function startFaceScan(){
  stopCam();
  facePts=0;
  document.getElementById('sFill').style.width='0%';
  document.getElementById('sSt').innerText='Starting camera…';
  document.getElementById('sReject').classList.add('hidden');

  navigator.mediaDevices.getUserMedia({video:true})
  .then(s=>{
    cam=s;
    document.getElementById('vid').srcObject=s;
    runFaceVerify();
  })
  .catch(()=>{
    document.getElementById('sSt').innerText='⚠ Camera permission denied';
  });
}

// ── Face verification loop ──
function runFaceVerify(){
  const NEED=6;
  faceTimer=setInterval(async()=>{
    const v=document.getElementById('vid');
    const cv=document.createElement('canvas');
    cv.width=v.videoWidth||320;cv.height=v.videoHeight||240;
    cv.getContext('2d').drawImage(v,0,0);
    try{
      const r=await fetch('/api/log_face',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({user:AU,image:cv.toDataURL('image/jpeg',.85)})});
      const d=await r.json();

      if(d.status==='match'){
        facePts++;
        document.getElementById('sFill').style.width=(facePts/NEED*100)+'%';
        document.getElementById('sSt').innerText=`✓ Face matched — ${facePts}/${NEED}`;
      } else if(d.status==='wrong_person'){
        clearInterval(faceTimer);faceTimer=null;
        document.getElementById('sReject').innerText='⛔ Wrong face — this account is not yours.';
        document.getElementById('sReject').classList.remove('hidden');
        document.getElementById('sSt').innerText='';
        stopCam();
        setTimeout(()=>showOnly('step0'),3000);
        return;
      } else {
        document.getElementById('sSt').innerText='👁 No match — hold still and look at camera';
      }

      if(facePts>=NEED){
        clearInterval(faceTimer);faceTimer=null;
        stopCam();
        voiceBusy=false;
        voiceAttempts=0;
        document.getElementById('vSt').innerText='Click mic to begin…';
        document.getElementById('vSt').style.color='var(--warn)';
        document.getElementById('vAttempts').innerText='';
        showOnly('step2');
      }
    }catch(e){
      document.getElementById('sSt').innerText='Camera error — retrying…';
    }
  },350);
}

// ── Voice verification — STRICT: voiceprint + exact phrase both must match ──
// Step 1: record audio → extract voiceprint → compare with enrolled voiceprint
// Step 2: use SpeechRecognition to get phrase text → compare with stored phrase
// BOTH must pass. No hints shown. No bypass if data missing.
function startVoiceVerify(){
  if(voiceBusy)return;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){
    document.getElementById('vSt').style.color='#ef4444';
    document.getElementById('vSt').innerText='⚠ Browser does not support voice auth. Use Chrome.';
    return;
  }
  voiceBusy=true;
  document.getElementById('micBtn').style.opacity='0.6';
  document.getElementById('vSt').style.color='#f59e0b';
  document.getElementById('vSt').innerText='🔴 Recording voice… speak your phrase clearly';

  // Record audio with Web Audio API for voiceprint
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

    // Simultaneously run SpeechRecognition for phrase text
    const rec=new SR();
    rec.lang='en-US';
    rec.maxAlternatives=5;
    rec.continuous=false;
    rec.interimResults=false;

    let srResult=null,srDone=false,audioDone=false;

    function tryVerify(){
      if(!srDone||!audioDone)return;
      // Extract voiceprint from recorded audio
      const vp=extractVoiceprint(new Float32Array(audioSamples));
      const vpArr=Array.from(vp);
      // Send both voiceprint and heard alternatives to server for dual-check
      fetch('/api/verify_voice_full',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({user:AU,voiceprint:vpArr,heard:srResult||[]})
      }).then(r=>r.json()).then(d=>{
        document.getElementById('micBtn').style.opacity='1';
        voiceBusy=false;
        if(d.status==='ok'){
          document.getElementById('vSt').style.color='#10b981';
          document.getElementById('vSt').innerText='✓ Voice & phrase verified — opening vault…';
          setTimeout(()=>enterVault(),900);
        } else {
          voiceAttempts++;
          const rem=MAX_VOICE_ATTEMPTS-voiceAttempts;
          document.getElementById('vSt').style.color='#ef4444';
          // Show generic failure — no hint about which check failed
          if(d.reason==='no_enrollment'){
            document.getElementById('vSt').innerText='⚠ No voice enrollment found for this account.';
          } else {
            document.getElementById('vSt').innerText='⛔ Voice authentication failed. Try again.';
          }
          if(rem>0){
            document.getElementById('vAttempts').innerText=`${rem} attempt${rem>1?'s':''} remaining`;
          } else {
            document.getElementById('vSt').innerText='⛔ Too many failed attempts — returning to login.';
            document.getElementById('vAttempts').innerText='';
            setTimeout(()=>{showOnly('step0');voiceAttempts=0;},2500);
          }
        }
      }).catch(()=>{
        voiceBusy=false;
        document.getElementById('micBtn').style.opacity='1';
        document.getElementById('vSt').style.color='#ef4444';
        document.getElementById('vSt').innerText='⚠ Server error — try again.';
      });
    }

    // Stop audio recording after 4 seconds
    setTimeout(()=>{
      try{
        scriptProc.disconnect();
        audioCtx.close();
        mediaStream.getTracks().forEach(t=>t.stop());
      }catch(e){}
      audioDone=true;
      tryVerify();
    },4000);

    rec.onresult=e=>{
      srResult=Array.from(e.results[0]).map(a=>
        a.transcript.toLowerCase().trim().replace(/[^a-z0-9\s]/g,''));
      srDone=true;
      tryVerify();
    };
    rec.onerror=e=>{
      srResult=[];srDone=true;
      tryVerify();
    };
    rec.onend=()=>{if(!srDone){srResult=[];srDone=true;tryVerify();}};
    rec.start();
  })
  .catch(()=>{
    voiceBusy=false;
    document.getElementById('micBtn').style.opacity='1';
    document.getElementById('vSt').style.color='#ef4444';
    document.getElementById('vSt').innerText='⚠ Microphone access denied.';
  });
}

// Extract spectral voiceprint (same algorithm as enrollment)
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

function enterVault(){
  // Pass username to vault via sessionStorage
  sessionStorage.setItem('vaultUser',AU);
  window.location.href='/vault';
}