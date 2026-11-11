const socket = io();
const $ = id => document.getElementById(id);

function formatTime(ms) {
  const total=Math.ceil(Math.max(0,Number(ms)||0)/1000);
  const h=Math.floor(total/3600);
  const m=Math.floor(total%3600/60);
  const s=total%60;
  return h>0
    ? [h,m,s].map(n=>String(n).padStart(2,"0")).join(":")
    : [m,s].map(n=>String(n).padStart(2,"0")).join(":");
}

socket.on("state",data=>{
  if(!data.config||!data.config.participants||!data.scores)return;

  const participants=data.config.participants;
  const scores=data.scores.map(n=>Number(n)||0);
  const total=scores[0]+scores[1];

  $("clock").textContent=formatTime(data.timer.remainingMs);

  [0,1].forEach(i=>{
    const p=participants[i];
    const color=p.color||(i===0?"#ef4444":"#3b82f6");
    $("player"+i).style.setProperty("--color",color);
    $("name"+i).textContent=p.name||("PARTICIPANTE "+(i+1));
    $("score"+i).textContent=scores[i].toLocaleString("pt-BR");

    const percent=total?scores[i]/total*100:50;
    $("bar"+i).style.width=percent+"%";
    $("percent"+i).textContent=percent.toFixed(1).replace(".",",")+"%";

    const photo=$("photo"+i);
    if(p.photo&&p.photo.startsWith("data:image/")){
      photo.src=p.photo;
    }else{
      photo.src="https://placehold.co/150x150/"+(i===0?"ef4444":"3b82f6")+"/ffffff?text="+(i+1);
    }
  });

  if(total===0){
    $("leader").textContent="AGUARDANDO VOTOS";
  }else if(scores[0]===scores[1]){
    $("leader").textContent="EMPATE";
  }else{
    const winner=scores[0]>scores[1]?0:1;
    $("leader").textContent=participants[winner].name+" ESTÁ VENCENDO";
  }
});
