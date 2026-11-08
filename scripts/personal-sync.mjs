/** Controlled single-writer handoff. This is not simultaneous/offline merge. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const roots=new Set(['chats','graph','jobs','prompts','library','review','settings.json']);
const excluded=new Set(['debug','cache','embeddings','models','.DS_Store']);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function safeChild(root,relative) {
  if(!relative||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..')||path.isAbsolute(relative)) throw new Error('Unsafe snapshot path');
  const result=path.resolve(root,...relative.split('/'));
  if(!result.startsWith(path.resolve(root)+path.sep))throw new Error('Path escapes data root');
  return result;
}
export function inventory(root) {
  const files={}; if(!fs.existsSync(root))return files;
  function walk(dir,relative='') {
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      const rel=relative?`${relative}/${entry.name}`:entry.name;
      if(!relative&&excluded.has(entry.name))continue;
      if(!relative&&!roots.has(entry.name))throw new Error(`Unknown data family: ${entry.name}. Update the snapshot allowlist deliberately.`);
      if(entry.isSymbolicLink())throw new Error('Symlinks are not permitted in learning snapshots');
      if(/(?:^|\/)(?:\.env(?:\..*)?|auth\.json|.*credentials.*|id_rsa|id_ed25519)(?:$|\/)/i.test(rel))throw new Error('Credential-like file found in learning data; it will not be synced');
      if(/(?:\.sqlite3-(?:wal|shm|journal)|\.tmp(?:-|$))/.test(rel))throw new Error('Unfinished database/temp file; close all writers and recover before sync');
      const full=path.join(dir,entry.name);
      if(entry.isDirectory())walk(full,rel);
      else if(entry.isFile()) {const bytes=fs.readFileSync(full);if(bytes.length>90*1024*1024)throw new Error('Snapshot file exceeds safe Git size; configure large-object storage');files[rel]={sha256:hash(bytes),bytes:bytes.length};}
      else throw new Error('Unsupported filesystem object');
    }
  }
  walk(root);
  for(const [rel,record] of Object.entries(files))if(rel.startsWith('library/objects/')) {
    const digest=rel.split('/')[2];if(!/^[a-f0-9]{64}$/.test(digest)||digest!==record.sha256)throw new Error(`Source integrity failure: ${rel}`);
  }
  const database=path.join(root,'review','review.sqlite3');
  if(fs.existsSync(database)) {
    const d=new DatabaseSync(database,{readOnly:true});
    try {
      if(d.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Review database integrity check failed');
      if(d.prepare('PRAGMA user_version').get().user_version!==1)throw new Error('Unsupported review database version');
      for(const s of d.prepare('SELECT * FROM sources').all()) {
        const rel=`library/objects/${s.id}`;if(!files[rel]||files[rel].sha256!==s.hash||files[rel].bytes!==s.bytes)throw new Error('Missing or mismatched managed source');
      }
    }finally{d.close();}
  }
  return Object.fromEntries(Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0));
}
export function equalInventory(a,b){return JSON.stringify(a)===JSON.stringify(b);}
export function verifySnapshot(repo) {
  const manifest=JSON.parse(fs.readFileSync(path.join(repo,'manifest.json'),'utf8'));
  if(manifest.schema!==1||!equalInventory(manifest.files,inventory(path.join(repo,'snapshot'))))throw new Error('Snapshot manifest mismatch or unsupported schema');
  return manifest;
}
export function replaceFamilies(source,target) {
  // Only named managed families are replaced, each resolved and containment checked.
  fs.mkdirSync(target,{recursive:true});
  for(const family of roots) {
    const destination=safeChild(target,family);const origin=safeChild(source,family);
    if(fs.lstatSync(destination,{throwIfNoEntry:false})?.isSymbolicLink())throw new Error('Refusing symlink restore target');
    if(fs.existsSync(destination))fs.rmSync(destination,{recursive:true});
    if(fs.existsSync(origin))fs.cpSync(origin,destination,{recursive:true,errorOnExist:true});
  }
}
export function git(repo,...args) {return execFileSync('git',['-C',repo,...args],{encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'},stdio:['ignore','pipe','pipe']}).trim();}
export function atomicJson(file,value) {fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${randomUUID()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});fs.renameSync(tmp,file);}
export function backup(config,label) {
  const dest=path.join(config.home,'backups',new Date().toISOString().replace(/[:.]/g,'-')+'-'+label);
  fs.mkdirSync(dest,{recursive:true});
  for(const family of roots) {const source=safeChild(config.data,family);if(fs.existsSync(source))fs.cpSync(source,safeChild(dest,family),{recursive:true});}
  return dest;
}
function currentControl(c){const x=JSON.parse(fs.readFileSync(path.join(c.dataRepo,'handoff.json'),'utf8'));if(x.schema!==1)throw new Error('Unsupported handoff protocol');return x;}
function cleanPull(c) {
  if(git(c.dataRepo,'status','--porcelain'))throw new Error('Data repository has local changes. Preserve and resolve them before syncing.');
  git(c.dataRepo,'fetch','origin');git(c.dataRepo,'merge','--ff-only','origin/main');
}
function publish(c,message) {fs.mkdirSync(path.join(c.dataRepo,'snapshot'),{recursive:true});git(c.dataRepo,'add','--','handoff.json','manifest.json','snapshot');git(c.dataRepo,'commit','-m',message);git(c.dataRepo,'push','origin','HEAD:main');}
export function acquire(c,{acceptCodeUpdate=false}={}) {
  cleanPull(c);const control=currentControl(c);const manifest=verifySnapshot(c.dataRepo);
  const head=git(c.codeRepo,'rev-parse','HEAD');
  if(manifest.codeCommit&&manifest.codeCommit!==head) {
    if(!acceptCodeUpdate)throw new Error('Code versions differ. Update both machines to the tested fork commit; see PERSONAL.md.');
    git(c.codeRepo,'merge-base','--is-ancestor',manifest.codeCommit,head);
  }
  if(control.owner&&control.owner!==c.machine)throw new Error('Another computer owns this learning session. Finish & sync there first.');
  const baselineFile=path.join(c.home,'baseline.json');const baseline=fs.existsSync(baselineFile)?JSON.parse(fs.readFileSync(baselineFile,'utf8')):null;
  const local=inventory(c.data);const localChanged=baseline?!equalInventory(local,baseline.files):Object.keys(local).length>0;
  if(localChanged) {
    if(control.owner!==c.machine||!baseline||!equalInventory(manifest.files,baseline.files))throw new Error('Unsynced local data conflicts with handoff. Nothing was overwritten; recover from backup deliberately.');
  } else {backup(c,'before-open');replaceFamilies(path.join(c.dataRepo,'snapshot'),c.data);}
  atomicJson(baselineFile,manifest);
  if(!control.owner){atomicJson(path.join(c.dataRepo,'handoff.json'),{...control,owner:c.machine,claimedAt:new Date().toISOString()});publish(c,'Acquire single-writer learning session');}
  return {head,control};
}
export function finish(c) {
  const control=currentControl(c);if(control.owner!==c.machine)throw new Error('This computer does not own the session');
  // Check remote has not moved; push is also an optimistic concurrency guard.
  git(c.dataRepo,'fetch','origin');if(git(c.dataRepo,'rev-parse','HEAD')!==git(c.dataRepo,'rev-parse','origin/main'))throw new Error('Remote changed; preserving local data for conflict recovery');
  if(git(c.dataRepo,'status','--porcelain'))throw new Error('Data repository changed unexpectedly; preserving data for recovery');
  const files=inventory(c.data);
  const jobs=path.join(c.data,'jobs');if(fs.existsSync(jobs))for(const file of fs.readdirSync(jobs).filter(f=>f.endsWith('.json'))) {
    const job=JSON.parse(fs.readFileSync(path.join(jobs,file),'utf8'));if(job.status==='running'||job.delivery?.status==='pending')throw new Error('Unfinished teaching job. Reopen this computer and finish/cancel it before handoff.');
  }
  backup(c,'before-sync');
  replaceFamilies(c.data,path.join(c.dataRepo,'snapshot'));
  atomicJson(path.join(c.dataRepo,'manifest.json'),{schema:1,codeCommit:git(c.codeRepo,'rev-parse','HEAD'),createdAt:new Date().toISOString(),files});
  atomicJson(path.join(c.dataRepo,'handoff.json'),{schema:1,owner:null,generation:control.generation+1});
  publish(c,'Save learning state and release session');
  atomicJson(path.join(c.home,'baseline.json'),verifySnapshot(c.dataRepo));
}
