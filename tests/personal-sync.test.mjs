import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { inventory,atomicJson,verifySnapshot,replaceFamilies,acquire,finish,git,safeChild } from '../scripts/personal-sync.mjs';

test('handoff round trip, lease exclusion, divergent history and backup safety',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lh-sync-test-'));
  const call=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:'pipe'});
  try{
    const remote=path.join(root,'remote.git');call('init','--bare','--initial-branch=main',remote);
    const seed=path.join(root,'seed');call('clone',remote,seed);git(seed,'config','user.name','Test');git(seed,'config','user.email','test@example.invalid');
    fs.writeFileSync(path.join(seed,'.gitattributes'),'* -text\n');atomicJson(path.join(seed,'manifest.json'),{schema:1,codeCommit:null,files:{}});atomicJson(path.join(seed,'handoff.json'),{schema:1,owner:null,generation:0});git(seed,'add','.');git(seed,'commit','-m','init');git(seed,'push','origin','main');
    const make=(name)=>{const home=path.join(root,name);fs.mkdirSync(home);const repo=path.join(home,'repo');call('clone',remote,repo);git(repo,'config','user.name','Test');git(repo,'config','user.email','test@example.invalid');return {home,data:path.join(home,'data'),dataRepo:repo,codeRepo:seed,machine:name};};
    const a=make('a'),b=make('b');acquire(a);assert.throws(()=>acquire(b),/Another computer/);
    fs.mkdirSync(path.join(a.data,'graph'),{recursive:true});fs.writeFileSync(path.join(a.data,'graph','nodes.jsonl'),'first\n');finish(a);
    acquire(b);assert.equal(fs.readFileSync(path.join(b.data,'graph','nodes.jsonl'),'utf8'),'first\n');
    fs.writeFileSync(path.join(b.data,'graph','nodes.jsonl'),'second\n');finish(b);
    acquire(a);assert.equal(fs.readFileSync(path.join(a.data,'graph','nodes.jsonl'),'utf8'),'second\n');finish(a);
    fs.writeFileSync(path.join(a.data,'graph','nodes.jsonl'),'unsynced\n');assert.throws(()=>acquire(a),/Unsynced local/);assert.equal(fs.readFileSync(path.join(a.data,'graph','nodes.jsonl'),'utf8'),'unsynced\n');
    fs.mkdirSync(path.join(a.data,'debug'));fs.writeFileSync(path.join(a.data,'debug','private.json'),'secret');assert.ok(!Object.keys(inventory(a.data)).some(k=>k.startsWith('debug')));
    fs.writeFileSync(path.join(a.data,'graph','auth.json'),'{}');assert.throws(()=>inventory(a.data),/Credential/);fs.unlinkSync(path.join(a.data,'graph','auth.json'));
    assert.throws(()=>safeChild(root,'../escape'),/Unsafe/);
    fs.writeFileSync(path.join(seed,'manifest.json'),'{}');assert.throws(()=>verifySnapshot(seed),/manifest/);
    assert.ok(fs.readdirSync(path.join(a.home,'backups')).length>0);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
