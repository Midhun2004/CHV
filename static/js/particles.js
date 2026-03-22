(()=>{
  const c=document.getElementById('bgC'),ctx=c.getContext('2d');
  let W,H,P=[];
  const sz=()=>{W=c.width=innerWidth;H=c.height=innerHeight;};sz();
  addEventListener('resize',sz);
  for(let i=0;i<52;i++)P.push({
    x:Math.random()*W,y:Math.random()*H,
    vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,
    r:Math.random()*1.4+.4});
  (function draw(){
    ctx.clearRect(0,0,W,H);
    P.forEach(p=>{p.x+=p.vx;p.y+=p.vy;
      if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle='rgba(124,58,237,.5)';ctx.fill();});
    P.forEach((a,i)=>P.slice(i+1).forEach(b=>{
      const d=Math.hypot(a.x-b.x,a.y-b.y);
      if(d<108){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
        ctx.strokeStyle=`rgba(124,58,237,${.09*(1-d/108)})`;
        ctx.lineWidth=.4;ctx.stroke();}}));
    requestAnimationFrame(draw);
  })();
})();
function toast(m,t='ok'){
  const el=document.getElementById('toast');
  el.className='show'+(t==='err'?' err':'');
  el.innerText=(t==='err'?'✗  ':'✓  ')+m;
  clearTimeout(el._t);el._t=setTimeout(()=>el.className='',2800);
}