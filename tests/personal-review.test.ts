import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { savePersonalCard,personalAttempt,ratePersonalAttempt,personalDashboard,exportPersonalReview,savePersonalSource,importPersonalLegacy } from "../src/store/personal-review.ts";

test("durable review: frozen content, draft/reveal, exactly-once rating, conflict and practice",async()=>{
	const root=fs.mkdtempSync(path.join(os.tmpdir(),"lh-review-test-"));
	const fetchBefore=globalThis.fetch;globalThis.fetch=async()=>{throw new Error("No network permitted during recall");};
	try {
		const c=await savePersonalCard({prompt:"What owns the text?",answer:"String",explanation:"An owned UTF-8 string.",source:"Fixture",deck:"Test"},root);
		const id=randomUUID(),other=randomUUID(),sessionId=randomUUID();
		for(const a of [id,other])personalAttempt("show",{attemptId:a,cardId:c.id,sessionId,mode:"scheduled"},root);
		personalAttempt("draft",{attemptId:id,answerText:"owned String",confidence:80},root);
		assert.equal(personalAttempt("get",{attemptId:id},root).answerText,"owned String");
		await savePersonalCard({...personalDashboard(root).cards[0],answer:"String owns a heap buffer"},root);
		assert.equal(personalAttempt("get",{attemptId:id},root).content.answer,"String");
		personalAttempt("reveal",{attemptId:id,answerText:"owned String",confidence:80},root);
		personalAttempt("draft",{attemptId:id,answerText:"overwrite",confidence:0},root);
		assert.equal(personalAttempt("get",{attemptId:id},root).answerText,"owned String");
		const request={attemptId:id,requestId:randomUUID(),rating:3};
		const result=await ratePersonalAttempt(request,root);assert.ok(result.saved);
		assert.deepEqual(await ratePersonalAttempt(request,root),result);
		await assert.rejects(()=>ratePersonalAttempt({...request,rating:4},root),/Conflicting/);
		personalAttempt("reveal",{attemptId:other,answerText:"",confidence:null},root);
		await assert.rejects(()=>ratePersonalAttempt({attemptId:other,requestId:randomUUID(),rating:3},root),/another tab/);
		const before=JSON.stringify(personalDashboard(root).cards);
		const practice=randomUUID();personalAttempt("show",{attemptId:practice,cardId:c.id,sessionId,mode:"practice"},root);
		personalAttempt("reveal",{attemptId:practice,answerText:"",confidence:null},root);
		await ratePersonalAttempt({attemptId:practice,requestId:randomUUID(),rating:1},root);
		assert.equal(JSON.stringify(personalDashboard(root).cards),before);
		const exported=exportPersonalReview(root);assert.equal(exported.tables.reviews!.length,2);assert.equal(exported.tables.versions!.length,2);
		assert.equal(personalDashboard(root).reviews,2); // opens a new SQLite connection, simulates restart
		assert.throws(()=>personalAttempt("show",{attemptId:randomUUID(),cardId:c.id,sessionId,mode:"scheduled"},root),/not due/);
	}finally{globalThis.fetch=fetchBefore;fs.rmSync(root,{recursive:true,force:true});}
});
test("source library retains bytes and stable references without extraction",()=>{
	const root=fs.mkdtempSync(path.join(os.tmpdir(),"lh-source-test-"));
	try{const bytes=Buffer.from("Source fixture");const a=savePersonalSource("chapter 4.md",bytes,"test",root);const b=savePersonalSource("chapter 4.md",bytes,"test",root);assert.equal(a.id,b.id);assert.match(a.reference,/^\/__lh_sources__\/[a-f0-9]{64}\//);assert.deepEqual(fs.readFileSync(path.join(root,"library","objects",a.id)),bytes);assert.equal(personalDashboard(root).sources.length,1);assert.throws(()=>savePersonalSource("auth.json",bytes,"test",root));}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test("legacy bridge preserves versions/raw evidence/due dates and refuses learned-state conversions",async()=>{
	const root=fs.mkdtempSync(path.join(os.tmpdir(),"lh-legacy-test-"));
	const snapshot={schema_version:1,decks:[{id:"test",title:"Legacy test"}],cards:[{uid:"stable-001",active:1,current_version:2,deck_id:"test"}],schedule:[{uid:"stable-001",revision:0,fsrs_json:JSON.stringify({due:"2026-01-01T12:00:00+00:00",stability:null,difficulty:null,last_review:null})}],card_versions:[1,2].map(version=>({uid:"stable-001",version,recorded_at:"2026-01-01T12:00:00Z",content_json:JSON.stringify({q:"Ownership?",a:`Answer ${version}`,answer_blocks:[{type:"list",items:["Rule 1","Rule 2"],ordered:true}],explanation_blocks:[{type:"paragraph",text:"Reasoning."}]})})),reviews:[],attempts:[{id:"original-attempt",typed_answer:"original words"}],events:[{kind:"shown",at:"original timestamp"}],study_reports:[{minutes:30}]};
	try{
		const raw=JSON.stringify(snapshot);assert.equal((await importPersonalLegacy(raw,root)).cards,1);assert.equal((await importPersonalLegacy(raw,root)).alreadyImported,true);
		const c=personalDashboard(root).cards[0]!;assert.equal(c.id,"stable-001");assert.equal(c.version,2);assert.equal(c.due,"2026-01-01T12:00:00.000Z");assert.match(c.answer,/1\. Rule 1\n2\. Rule 2/);
		const exp=exportPersonalReview(root);assert.equal(exp.tables.versions!.length,2);assert.equal(exp.tables.legacy_snapshots![0]!.snapshot,raw);
		await assert.rejects(()=>importPersonalLegacy(JSON.stringify({...snapshot,reviews:[{rating:3}]}),root),/validated engine migration/);
		assert.equal(personalDashboard(root).cards.length,1);
	}finally{fs.rmSync(root,{recursive:true,force:true});}
});
