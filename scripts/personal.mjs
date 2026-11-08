import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { acquire, finish, git, atomicJson, inventory } from './personal-sync.mjs';

const codeRepo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const home=process.env.LH_PERSONAL_HOME||path.join(os.homedir(),'LearnHarness');
const configFile=path.join(home,'config.json');
const command=process.argv[2]||'open';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function alive(pid){if(!Number.isInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch{return false;}}
function killTree(pid){if(!alive(pid))return;if(process.platform==='win32')spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else {try{process.kill(-pid,'SIGTERM');}catch{try{process.kill(pid,'SIGTERM');}catch{}}}}
async function initialize() {
  if(fs.existsSync(configFile))return JSON.parse(fs.readFileSync(configFile,'utf8'));
  const repo=process.argv[3];if(!repo||!/^https:\/\/github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+(?:\.git)?$/.test(repo))throw new Error('Setup: node scripts/personal.mjs setup https://github.com/YOU/learnharness-data.git');
  fs.mkdirSync(home,{recursive:true});const c={schema:1,home,codeRepo,data:path.join(home,'data'),dataRepo:path.join(home,'sync-repo'),auth:path.join(home,'credentials','auth.json'),machine:randomUUID(),port:3020};
  if(fs.existsSync(c.dataRepo))throw new Error('Existing sync-repo requires manual inspection before setup');
  git(home,'clone',repo,c.dataRepo);
  const username=repo.split('/')[3];git(c.dataRepo,'config','credential.https://github.com.username',username);
  git(c.dataRepo,'config','user.name','Personal learning');git(c.dataRepo,'config','user.email',git(codeRepo,'config','user.email'));git(c.dataRepo,'config','core.autocrlf','false');
  if(!fs.existsSync(path.join(c.dataRepo,'manifest.json'))) {
    if(git(c.dataRepo,'branch','-r'))throw new Error('Existing data repository is missing its snapshot manifest');
    git(c.dataRepo,'switch','-c','main');fs.mkdirSync(path.join(c.dataRepo,'snapshot'),{recursive:true});
    atomicJson(path.join(c.dataRepo,'manifest.json'),{schema:1,codeCommit:git(codeRepo,'rev-parse','HEAD'),createdAt:new Date().toISOString(),files:{}});
    atomicJson(path.join(c.dataRepo,'handoff.json'),{schema:1,owner:null,generation:0});
    fs.writeFileSync(path.join(c.dataRepo,'.gitignore'),'*\n!.gitignore\n!.gitattributes\n!README.md\n!handoff.json\n!manifest.json\n!snapshot/\n!snapshot/**\n');
    fs.writeFileSync(path.join(c.dataRepo,'.gitattributes'),'* -text\n');
    fs.writeFileSync(path.join(c.dataRepo,'README.md'),'# Private learning state\n\nManaged by LearnHarness personal handoff. Do not edit or merge snapshots while the app is running. Credentials never belong here.\n');
    git(c.dataRepo,'add','.');git(c.dataRepo,'commit','-m','Initialize private learning snapshot protocol');git(c.dataRepo,'push','-u','origin','main');
  }
  fs.mkdirSync(c.data,{recursive:true});fs.mkdirSync(path.dirname(c.auth),{recursive:true});
  if(!fs.existsSync(c.auth))fs.writeFileSync(c.auth,'{}',{mode:0o600});
  atomicJson(configFile,c);return c;
}
async function main(){
  if(command==='setup'){const c=await initialize();console.log(`Configured ${c.home}. Run npm run personal:open.`);return;}
  if(!fs.existsSync(configFile))throw new Error('Run setup first; see PERSONAL.md');
  const c=JSON.parse(fs.readFileSync(configFile,'utf8'));c.codeRepo=codeRepo;
  const lock=path.join(home,'running.json');const stop=path.join(home,'stop.request');const result=path.join(home,'last-result.json');
  const previous=fs.existsSync(lock)?JSON.parse(fs.readFileSync(lock,'utf8')):null;
  if(command==='status'){console.log(JSON.stringify({running:alive(previous?.pid),home,data:c.data,dataRepo:c.dataRepo,lastResult:fs.existsSync(result)?JSON.parse(fs.readFileSync(result,'utf8')):null},null,2));return;}
  if(command==='finish'){
    if(alive(previous?.pid)) {
      atomicJson(stop,{session:previous.session});
      for(let i=0;i<120&&fs.existsSync(lock);i++)await delay(500);
      if(fs.existsSync(lock))throw new Error('Shutdown is still in progress; inspect the launcher log');
      const outcome=JSON.parse(fs.readFileSync(result,'utf8'));if(!outcome.ok)throw new Error(outcome.error);console.log('Saved, pushed, and released. Safe to continue on the other computer.');
    }else {
      if(previous?.children?.some(alive))throw new Error('An app child still runs; close it before recovery');
      finish(c);console.log('Recovered stopped session and synced.');
    }
    return;
  }
  if(command==='update') {if(alive(previous?.pid))throw new Error('Finish & sync before updating');git(codeRepo,'fetch','upstream');git(codeRepo,'fetch','origin');console.log('Fetched updates. Merge upstream/main on an update branch, run checks with scratch data, then push your tested branch. See PERSONAL.md.');return;}
  if(command!=='open')throw new Error('Commands: setup, open, finish, status, update');
  if(alive(previous?.pid)||previous?.children?.some(alive))throw new Error('An app session already runs. Use Finish & sync first.');
  if(git(codeRepo,'status','--porcelain'))throw new Error('Commit or stash code changes before opening the live learning profile. Use scratch data for development.');
  fs.mkdirSync(home,{recursive:true});
  if(previous&&fs.existsSync(lock)){const now=JSON.parse(fs.readFileSync(lock,'utf8'));if(now.session!==previous.session||alive(now.pid))throw new Error('Another launcher acquired the profile');fs.unlinkSync(lock);}
  const lockFd=fs.openSync(lock,'wx');fs.closeSync(lockFd);
  const session=randomUUID();atomicJson(lock,{pid:process.pid,session,children:[]});
  let server,desktop;let acquired=false;
  try {
    if(fs.existsSync(stop))fs.unlinkSync(stop);
    acquire(c,{acceptCodeUpdate:process.argv.includes('--accept-code-update')});acquired=true;
    const env={...process.env,LH_DATA_DIR:c.data,LH_AUTH_FILE:c.auth,LH_DEV_URL:`http://127.0.0.1:${c.port}`,ELECTRON_RUN_AS_NODE:undefined};
    delete env.ELECTRON_RUN_AS_NODE;
    server=spawn(process.execPath,[path.join(codeRepo,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(c.port)],{cwd:codeRepo,env,stdio:'inherit',windowsHide:true,detached:process.platform!=='win32'});
    atomicJson(lock,{pid:process.pid,session,children:[server.pid]});
    let ready=false;for(let i=0;i<120;i++){if(server.exitCode!==null)throw new Error('Local server exited before startup');try{const r=await fetch(env.LH_DEV_URL+'/review');if(r.ok){ready=true;break;}}catch{}await delay(500);}
    if(!ready)throw new Error('Server startup timed out');
    const electron=path.join(codeRepo,'node_modules/electron/dist',process.platform==='win32'?'electron.exe':process.platform==='darwin'?'Electron.app/Contents/MacOS/Electron':'electron');
    desktop=spawn(electron,[codeRepo],{cwd:codeRepo,env,stdio:'inherit',windowsHide:true,detached:process.platform!=='win32'});
    atomicJson(lock,{pid:process.pid,session,children:[server.pid,desktop.pid]});
    console.log(`LearnHarness ready at ${env.LH_DEV_URL}. Close the desktop window or run Finish & sync.`);
    let stopping=false;const signal=()=>{stopping=true;};process.on('SIGINT',signal);process.on('SIGTERM',signal);
    while(desktop.exitCode===null&&!stopping&&!fs.existsSync(stop)){if(server.exitCode!==null)throw new Error('Local server stopped unexpectedly');await delay(500);}
    if(fs.existsSync(stop)) {const request=JSON.parse(fs.readFileSync(stop,'utf8'));if(request.session!==session)throw new Error('Stale stop request');}
    // Let normal window-close cleanup happen; explicit finish stops this owned tree.
    killTree(desktop.pid);killTree(server.pid);await delay(500);
    if(alive(desktop.pid)||alive(server.pid))throw new Error('App process did not stop; refusing snapshot');
    finish(c);atomicJson(result,{ok:true,at:new Date().toISOString()});console.log('Learning state saved and synced.');
  }catch(e){
    if(desktop)killTree(desktop.pid);if(server)killTree(server.pid);
    atomicJson(result,{ok:false,at:new Date().toISOString(),error:e.message,sessionOwned:acquired});throw e;
  }finally{if(fs.existsSync(lock))fs.unlinkSync(lock);if(fs.existsSync(stop))fs.unlinkSync(stop);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
