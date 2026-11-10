/** Real browser smoke on disposable data; all nonlocal requests are blocked. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn,spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lh-ui-test-'));
const port=3021;const base=`http://127.0.0.1:${port}`;
const env={...process.env,LH_DATA_DIR:path.join(root,'data'),LH_AUTH_FILE:path.join(root,'auth.json')};
fs.writeFileSync(env.LH_AUTH_FILE,'{}');
const logs=[];const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
server.stdout.on('data',d=>logs.push(String(d)));server.stderr.on('data',d=>logs.push(String(d)));
let browser;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try {
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/review')).ok){ready=true;break;}}catch{}await delay(250);}assert.ok(ready,logs.join(''));
  const executablePath=process.env.LH_TEST_BROWSER||[process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe'),'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
  assert.ok(executablePath,'Set LH_TEST_BROWSER to a Chrome/Chromium executable');
  browser=await puppeteer.launch({executablePath,headless:true,args:['--no-first-run'],userDataDir:path.join(root,'browser')});
  const page=await browser.newPage();await page.setViewport({width:1200,height:1000});
  page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
  page.on('response',async r=>{if(r.status()>=400)console.error(r.status(),r.url(),await r.text());});
  const apiCalls=[];const failures=[];let voiceRequested=false;
  await page.evaluateOnNewDocument(()=>{
    let captures=0,stops=0;
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{captures++;return {getTracks:()=>[{stop(){stops++;}}]};}}});
    class AudioGraph {state='running';destination={};audioWorklet={addModule:async()=>{}};createMediaStreamSource(){return {connect(){},disconnect(){}};}}
    class Worklet {port={};connect(){}disconnect(){}}
    class Socket extends EventTarget {
      static CONNECTING=0;static OPEN=1;readyState=0;
      constructor(url){super();if(!String(url).startsWith('wss://api.deepgram.com/'))throw new Error('Unexpected WebSocket');setTimeout(()=>{if(this.readyState!==0)return;this.readyState=1;this.dispatchEvent(new Event('open'));},0);}
      send(data){if(typeof data==='string'&&JSON.parse(data).type==='CloseStream'){setTimeout(()=>{this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'Results',is_final:true,channel:{alternatives:[{transcript:'Synthetic dictated explanation.'}]}})}));this.readyState=3;this.dispatchEvent(new CloseEvent('close',{code:1000}));},20);}}
      close(){this.readyState=3;}
    }
    window.AudioContext=AudioGraph;window.AudioWorkletNode=Worklet;window.WebSocket=Socket;
    window.__voiceStats=()=>({captures,stops});
  });
  await page.setRequestInterception(true);
  page.on('request',req=>{
    const url=new URL(req.url());
    if(url.origin!==base&&url.protocol!=='data:'){failures.push(req.url());void req.abort();return;}
    if(url.pathname.startsWith('/api/')) {
      apiCalls.push(url.pathname);
      if(voiceRequested&&url.pathname==='/api/stt/token'){void req.respond({status:200,contentType:'application/json',body:JSON.stringify({token:'synthetic-token'})});return;}
      if(voiceRequested&&url.pathname==='/api/settings'){void req.respond({status:200,contentType:'application/json',body:JSON.stringify({settings:{version:1,dictation:{language:'en'}}})});return;}
      if(!url.pathname.startsWith('/api/personal/')){failures.push(req.url());void req.abort();return;}
    }
    void req.continue();
  });
  await page.goto(base+'/review',{waitUntil:'networkidle0'});
  const clickText=async text=>{await page.waitForFunction(text=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes(text)&&!b.disabled),{},text);await page.evaluate(text=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(text)).click(),text);};
  await clickText('Create a card');
  await page.waitForSelector('form');
  const inputs=await page.$$('form textarea');
  const values=['Fixture deck','What owns its text buffer?','**String** owns the buffer.','1. It owns UTF-8 bytes.\n2. Borrowing does not transfer ownership.','Synthetic fixture'];
  for(let i=0;i<values.length;i++)await inputs[i].type(values[i]);
  await clickText('Save card');await page.waitForFunction(()=>document.body.innerText.includes('1 cards')||document.querySelector('[role=alert]'));
  assert.ok((await page.$eval('body',e=>e.innerText)).includes('1 cards'),await page.$eval('body',e=>e.innerText));
  await clickText('Start / next card');await page.waitForSelector('article textarea');await page.type('article textarea','String owns its heap-allocated buffer.');
  await page.waitForFunction(()=>document.body.innerText.includes('Draft saved to library'));
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('article textarea');assert.equal(await page.$eval('article textarea',e=>e.value),'String owns its heap-allocated buffer.');
  assert.ok(apiCalls.every(p=>p.startsWith('/api/personal/')),'Typed review must stay local');
  voiceRequested=true;
  await clickText('Dictate answer');await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Stop dictation')));
  assert.equal(await page.evaluate(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Reveal & save')).disabled),true);
  await clickText('Stop dictation');await page.waitForFunction(()=>document.querySelector('article textarea').value.includes('Synthetic dictated explanation.'));
  await page.waitForFunction(()=>document.body.innerText.includes('Draft saved to library'));
  const spoken=await page.$eval('article textarea',e=>e.value);assert.ok(spoken.startsWith('String owns its heap-allocated buffer.'));
  await clickText('Dictate answer');await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Stop dictation')));
  await clickText('Cancel recording');await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Dictate answer'));
  assert.equal(await page.$eval('article textarea',e=>e.value),spoken,'Cancel must preserve the existing answer');
  assert.ok((await page.evaluate(()=>window.__voiceStats())).stops>=2);
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied in test','NotAllowedError');};});
  await clickText('Dictate answer');await page.waitForFunction(()=>document.body.innerText.includes('Microphone permission denied'));
  assert.equal(await page.$eval('article textarea',e=>e.value),spoken,'Permission denial must keep the existing answer');

  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('article textarea');assert.equal(await page.$eval('article textarea',e=>e.value),spoken);
  await clickText('Reveal & save answer');await page.waitForFunction(()=>document.body.innerText.includes('Core answer'));
  await page.screenshot({path:path.join(root,'review.png'),fullPage:true});
  await clickText('Good · correct');await page.waitForFunction(()=>document.body.innerText.includes('1 saved ratings'));
  await page.reload({waitUntil:'networkidle0'});await page.waitForFunction(()=>document.body.innerText.includes('1 saved ratings'));
  await page.goto(base+'/library',{waitUntil:'networkidle0'});const source=path.join(root,'source.md');fs.writeFileSync(source,'# Source fixture\nOriginal bytes.');await (await page.$('input[type=file]')).uploadFile(source);
  await page.waitForFunction(()=>document.body.innerText.includes('/__lh_sources__/'));
  const exported=await (await fetch(base+'/api/personal/review?export=1')).json();assert.equal(exported.tables.reviews.length,1);assert.equal(exported.tables.sources.length,1);
  assert.deepEqual(failures,[]);assert.ok(apiCalls.every(p=>p.startsWith('/api/personal/')||p==='/api/settings'||p==='/api/stt/token'));assert.ok(exported.tables.events.some(e=>e.kind==='dictation-transcribed'));assert.ok(exported.tables.events.some(e=>e.kind==='dictation-cancelled'));assert.equal(exported.tables.attempts[0].draft,spoken);
  console.log(JSON.stringify({passed:true,apiPaths:[...new Set(apiCalls)],screenshot:path.join(root,'review.png'),scratch:root}));
}finally{
  if(browser)await browser.close();
  if(process.platform==='win32')spawnSync('taskkill',['/PID',String(server.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else server.kill();
  // Retain screenshots/logs for local visual inspection; never commit them.
  fs.writeFileSync(path.join(root,'server.log'),logs.join(''));
}
