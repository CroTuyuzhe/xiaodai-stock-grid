'use strict';
const APP_ID='com.xiaodai.stockgrid';
class PriceNotifications{
 constructor({Notification,register=()=>{},onDelivery=()=>{},onClick=()=>{},setTimer=(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimer=id=>globalThis.clearTimeout(id)}){
  Object.assign(this,{Notification,register,onDelivery,onClick,setTimer,clearTimer});this.active=new Set();
 }
 supported(){return this.Notification.isSupported();}
 send(events){
  if(!events.length)return;
  const ids=events.map(e=>e.id),report=(status,message='')=>this.onDelivery(ids,status,message);
  if(!this.supported()){report('unsupported','当前系统不支持通知，请在软件内查看提醒记录');return;}
  let notification,timer,confirmed=false;
  try{
   this.register();
   const first=events[0],test=first.kind==='test',line=e=>`${e.name}（${e.symbol}）现价 ¥${e.price} ${e.condition==='gte'?'≥':'≤'} 目标 ¥${e.target}\n行情时间：${e.marketAt.replace('T',' ')}（北京时间）`;
   const title=test?'小呆网格 · 测试通知':events.length===1?`${first.name}（${first.symbol}）价格提醒`:`小呆网格 · ${events.length} 条价格提醒`;
   const body=test?'这是一条系统通知测试。若未看到弹窗，请检查 Windows 通知设置和勿扰模式；软件内会保留测试记录。':events.slice(0,3).map(line).join('\n\n')+(events.length>3?`\n另有 ${events.length-3} 条，请打开软件查看。`:'');
   notification=new this.Notification({title,body,silent:false});this.active.add(notification);
   const finish=()=>{this.clearTimer(timer);this.active.delete(notification);};
   notification.on('show',()=>{confirmed=true;this.clearTimer(timer);report('submitted','已提交系统，实际展示受 Windows 通知设置与勿扰模式影响');});
   notification.on('failed',(_event,error)=>{confirmed=true;finish();report('failed',error||'系统通知发送失败，请在软件内查看');});
   notification.on('click',()=>this.onClick(first.stockId||'',ids));
   notification.on('close',()=>{finish();if(!confirmed){confirmed=true;report('unknown','系统关闭了通知，但未确认展示');}});
   notification.show();
   if(!confirmed){timer=this.setTimer(()=>{report('unknown','系统未返回展示确认，请在软件内查看；不会反复补发');},10000);timer?.unref?.();}
  }catch(error){if(notification)this.active.delete(notification);this.clearTimer(timer);report('failed',error.message);}
 }
}
function registerWindowsShortcut({app,shell,path,fs}){
 if(process.platform!=='win32'||!app.isPackaged)return;
 // Isolated verification profiles must never replace the user's Start Menu shortcut.
 if(process.env.XIAODAI_GRID_DATA_DIR)return;
 const file=path.join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs','小呆网格.lnk');
 const options={target:process.execPath,cwd:path.dirname(process.execPath),description:'小呆网格 · 股票网格交易账本',icon:process.execPath,iconIndex:0,appUserModelId:APP_ID};
 if(!shell.writeShortcutLink(file,fs.existsSync(file)?'update':'create',options))throw new Error('无法创建通知所需的开始菜单快捷方式，请在软件内查看记录');
}
module.exports={APP_ID,PriceNotifications,registerWindowsShortcut};
