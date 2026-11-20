(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.AutoQuotes=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MINUTE=60000,DAY=86400000,OFFSET=8*60*MINUTE;
  function randomDelay(random=Math.random){return (60+Math.min(30,Math.max(0,Math.floor(random()*31))))*1000;}
  function sessions(time){
    const shifted=new Date(time+OFFSET),day=shifted.getUTCDay();
    if(day===0||day===6)return [];
    const midnight=Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate())-OFFSET;
    return [[midnight+570*MINUTE,midnight+690*MINUTE],[midnight+780*MINUTE,midnight+900*MINUTE]];
  }
  function isTradingTime(time){return sessions(time).some(([start,end])=>time>=start&&time<end);}
  function nextSession(time){
    for(let day=0;day<8;day++)for(const [start,end] of sessions(time+day*DAY)){
      if(time<end)return Math.max(time,start);
    }
    throw new Error('无法确定下个行情更新时段');
  }
  function plan(time,notBefore=0,random=Math.random){
    const candidate=Math.max(time+randomDelay(random),notBefore);
    return isTradingTime(candidate)?candidate:nextSession(candidate)+randomDelay(random);
  }
  class Loop {
    constructor({getStatus,isEligible,isReady=()=>true,refresh,onChange=()=>{},now=()=>Date.now(),random=Math.random,setTimer=setTimeout,clearTimer=clearTimeout}){
      Object.assign(this,{getStatus,isEligible,isReady,refresh,onChange,now,random,setTimer,clearTimer});
      this.timer=null;this.nextAt=0;this.running=false;this.mode='off';
    }
    clear(){if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;}
    sync(){
      this.clear();
      const status=this.getStatus(),time=this.now();
      if(!status.autoEnabled||status.error||status.restriction||!this.isEligible()){
        this.nextAt=0;this.mode=status.error?'error':status.restriction?'restricted':!status.autoEnabled?'off':'empty';
        this.onChange();return;
      }
      if(this.running){this.mode='fetching';this.onChange();return;}
      if(this.nextAt<=time||!isTradingTime(this.nextAt)||this.nextAt<(status.nextAllowedAt||0)){
        this.nextAt=plan(time,status.nextAllowedAt||0,this.random);
      }
      this.mode=!isTradingTime(time)?'outside':status.failures?'backoff':'waiting';
      this.timer=this.setTimer(()=>this.tick(),Math.max(1,Math.min(this.nextAt-time,2147483647)));
      this.onChange();
    }
    async tick(){
      this.timer=null;
      const time=this.now(),status=this.getStatus();
      if(!status.autoEnabled||status.error||status.restriction||!this.isEligible()||!isTradingTime(time)||
          time<this.nextAt||time-this.nextAt>90000||time<(status.nextAllowedAt||0)||!this.isReady()){
        this.nextAt=0;this.sync();return;
      }
      this.running=true;this.mode='fetching';this.onChange();
      try{await this.refresh();}
      finally{this.running=false;this.nextAt=0;this.sync();}
    }
    stop(){this.clear();this.nextAt=0;}
  }
  return {randomDelay,sessions,isTradingTime,nextSession,plan,Loop};
});
