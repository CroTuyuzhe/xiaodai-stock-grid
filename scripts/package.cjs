const path=require('node:path');
const fs=require('node:fs');
(async()=>{
  const {packager}=await import('@electron/packager');
  const root=path.resolve(__dirname,'..');
  const version=require('../package.json').version;
  const releaseRoot=path.join(root,'release');
  const output=path.join(releaseRoot,`v${version}`);
  if(!output.startsWith(releaseRoot+path.sep)||!/^v\d+\.\d+\.\d+$/.test(path.basename(output)))throw new Error('Unsafe output directory');
  // Windows can briefly lock newly extracted runtime files during inspection.
  // Retry only renames within this project's release directory.
  const nativeRename=fs.promises.rename;
  fs.promises.rename=async(from,to)=>{
    for(let attempt=0;;attempt++){
      try{return await nativeRename(from,to);}
      catch(error){
        if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=7||
          !path.resolve(from).startsWith(releaseRoot+path.sep)||!path.resolve(to).startsWith(releaseRoot+path.sep))throw error;
        await new Promise(resolve=>setTimeout(resolve,Math.min(150*2**attempt,1500)));
      }
    }
  };
  let results;
  try{results=await packager({
    dir:root,out:output,name:'XiaodaiGrid',executableName:'XiaodaiGrid',platform:'win32',arch:'x64',electronVersion:'45.3.1',
    icon:path.join(root,'assets','icon.ico'),asar:true,prune:true,overwrite:true,
    tmpdir:path.join(releaseRoot,'.packaging'),electronZipDir:process.env.XIAODAI_ELECTRON_ZIP_DIR||undefined,
    ignore:[/^\/release(?:\/|$)/,/^\/tests(?:\/|$)/,/^\/scripts(?:\/|$)/,/^\/screenshots(?:\/|$)/,/^\/\.git(?:\/|$)/,/^\/test-results(?:\/|$)/,/^\/package-lock\.json$/],
    win32metadata:{CompanyName:'小呆',FileDescription:'小呆网格 · 股票交易账本',ProductName:'小呆网格',InternalName:'XiaodaiGrid'},
    appCopyright:'小呆网格 2026'
  });}finally{fs.promises.rename=nativeRename;}
  for(const result of results){
    const manual=fs.readFileSync(path.join(root,'使用说明.md'),'utf8').replace(/运行 `release\/[^`]+`，或双击项目目录中的 `打开小呆网格.cmd`。/,'双击同目录下的 `XiaodaiGrid.exe`。');
    fs.writeFileSync(path.join(result,'使用说明.md'),manual,'utf8');
    fs.writeFileSync(path.join(result,'快速开始.txt'),'小呆网格 v'+version+' · 股票网格交易账本\n\n双击 XiaodaiGrid.exe。\n浅色交易工作台：正文与表格 15 像素，辅助文字至少 13 像素。\n总览提供买入、卖出与分红快捷记账。\n删除股票：总览列表右侧“删除”，或网格页“设置档位”旁“删除股票”。\n已有成交记录会说明原因并提供查看该股记录的入口。\n\n添加股票时输入 512480 等代码，点击“按代码获取名称和价格”。\n每天打开后点击“刷新全部行情”，更新所有支持的 A 股与场内 ETF。\n软件不自动轮询；接口失败保留旧价。\n\n本软件免安装，请保留同目录所有文件。\n详细操作见软件中的“网格说明”。\n','utf8');
    console.log(result);
  }
})().catch(e=>{console.error(e);process.exit(1);});
