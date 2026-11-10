"use client";
import { useEffect, useRef, useState } from "react";
import { nextPersonalReviewCard, type ReviewAttempt, type ReviewCard, type ReviewContent, type ReviewDashboard } from "@/src/core";
import { MessageResponse } from "@/components/ai-elements/message";
import { uploadManagedFiles } from "@/lib/managed-upload";
import { joinDictation } from "@/components/dictation";
import { ReviewDictation, type ReviewDictationHandle, type ReviewVoiceEvent } from "@/components/review-dictation";

const EMPTY:ReviewContent={prompt:"",answer:"",explanation:"",source:"",deck:"Personal"};
const field="w-full rounded-lg border bg-background p-3 text-sm";
const button="rounded-lg border px-4 py-2 text-sm hover:bg-accent disabled:opacity-40";
async function api(body?:unknown) {
	const response=await fetch("/api/personal/review",body?{method:"POST",headers:{"Content-Type":"application/json","x-lh-personal":"1"},body:JSON.stringify(body)}:{cache:"no-store"});
	const data=await response.json(); if(!response.ok) throw new Error(data.error??"Save failed"); return data;
}
export function PersonalReview({library=false}:{library?:boolean}) {
	const [dashboard,setDashboard]=useState<ReviewDashboard|null>(null);
	const [attempt,setAttempt]=useState<ReviewAttempt|null>(null);
	const [draft,setDraft]=useState(""); const [confidence,setConfidence]=useState("");
	const draftRef=useRef(draft);draftRef.current=draft;
	const confidenceRef=useRef(confidence);confidenceRef.current=confidence;
	const speechRef=useRef<ReviewDictationHandle|null>(null);
	const [speechActive,setSpeechActive]=useState(false);
	const [mode,setMode]=useState<"scheduled"|"practice">("scheduled");
	const [deck,setDeck]=useState(""); const [editing,setEditing]=useState<ReviewCard|ReviewContent|null>(null);
	const [error,setError]=useState(""); const [notice,setNotice]=useState(""); const [busy,setBusy]=useState(false);
	const [saved,setSaved]=useState(""); const session=useRef(""); const draftTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
	const skippedIds=useRef<string[]>([]);
	const answerInput=useRef<HTMLTextAreaElement|null>(null);
	const cardPanel=useRef<HTMLElement|null>(null);
	const refresh=async()=>{const data=await api();setDashboard(data);return data as ReviewDashboard;};
	useEffect(()=>{
		session.current=sessionStorage.getItem("lh-review-session")??crypto.randomUUID();sessionStorage.setItem("lh-review-session",session.current);
		try {const options=JSON.parse(localStorage.getItem("lh-review-options")??"{}");if(options.mode==="practice"||options.mode==="scheduled")setMode(options.mode);if(typeof options.deck==="string")setDeck(options.deck);}catch{}
		void refresh().then(async()=>{
			const cached=localStorage.getItem("lh-review-attempt"); if(!cached) return;
			const item=JSON.parse(cached); const a=await api({action:"get",attemptId:item.id});
			if(a.rated){localStorage.removeItem("lh-review-attempt");return;}
			setAttempt(a);setMode(a.mode);setDraft(a.revealed?a.answerText:item.draft??a.answerText);setConfidence(a.revealed?String(a.confidence??""):item.confidence??String(a.confidence??""));setSaved(a.revealed?"Answer revealed and saved":"Resumed saved attempt");
		}).catch(e=>setError(String(e.message)));
		return ()=>{if(draftTimer.current)clearTimeout(draftTimer.current);};
	},[]);
	useEffect(()=>{localStorage.setItem("lh-review-options",JSON.stringify({mode,deck}));},[mode,deck]);
	useEffect(()=>{
		if(attempt&&!attempt.revealed){answerInput.current?.focus({preventScroll:true});cardPanel.current?.scrollIntoView({behavior:"smooth",block:"start"});}
	},[attempt?.id]);
	const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError("");try{await fn();}catch(e){setError(e instanceof Error?e.message:"Operation failed");}finally{setBusy(false);}};
	const loadNext=async(data?:ReviewDashboard,previousId?:string)=>{
		const current=data??await refresh();
		const c=nextPersonalReviewCard(current.cards,mode,deck,new Date().toISOString(),previousId,skippedIds.current);
		if(!c){setAttempt(null);setNotice(skippedIds.current.length?"Session complete. Skipped cards keep their original due dates.":mode==="scheduled"?"No cards currently due in this deck. Session complete; you can use Practice if you choose.":"No cards in this deck.");return;}
		const id=crypto.randomUUID();const a=await api({action:"show",attemptId:id,cardId:c.id,mode,sessionId:session.current});
		setAttempt(a);draftRef.current="";confidenceRef.current="";setDraft("");setConfidence("");setSaved("Question shown and saved");localStorage.setItem("lh-review-attempt",JSON.stringify({id,draft:"",confidence:""}));
	};
	const start=async()=>{session.current=crypto.randomUUID();sessionStorage.setItem("lh-review-session",session.current);skippedIds.current=[];setNotice("");await loadNext();};
	const cacheDraft=(next:string,conf:string)=>{
		if(!attempt||attempt.revealed)return;
		localStorage.setItem("lh-review-attempt",JSON.stringify({id:attempt.id,draft:next,confidence:conf}));setSaved("Draft saved on this device; saving to library…");
		if(draftTimer.current)clearTimeout(draftTimer.current);
		draftTimer.current=setTimeout(()=>{void api({action:"draft",attemptId:attempt.id,answerText:next,confidence:conf===""?null:Number(conf)}).then(()=>setSaved("Draft saved to library")).catch(e=>{setSaved("Draft not synced to library");setError(e.message);});},500);
	};
	const reveal=async()=>{
		await speechRef.current?.finish();
		if(draftTimer.current)clearTimeout(draftTimer.current);
		const a=await api({action:"reveal",attemptId:attempt!.id,answerText:draftRef.current,confidence:confidenceRef.current===""?null:Number(confidenceRef.current)});setAttempt(a);setSaved("Answer frozen and saved");
	};
	const voiceEvent=(kind:ReviewVoiceEvent)=>{
		if(!attempt)return;
		void api({action:"dictation",attemptId:attempt.id,kind}).catch(e=>setError("Could not record dictation activity: "+e.message));
	};
	const appendTranscript=(text:string)=>{
		if(!attempt||attempt.revealed)return;
		const next=joinDictation(draftRef.current,text);draftRef.current=next;setDraft(next);cacheDraft(next,confidenceRef.current);
	};
	const rate=async(rating:number)=>{
		const key=`lh-review-rating-${attempt!.id}`;
		const pending=localStorage.getItem(key);const request=pending?JSON.parse(pending):{requestId:crypto.randomUUID(),rating};
		if(request.rating!==rating)throw new Error("A previous rating may already be saved. Retry that same rating or reload.");
		localStorage.setItem(key,JSON.stringify(request));
		const result=await api({action:"rate",attemptId:attempt!.id,...request});
		localStorage.removeItem(key);localStorage.removeItem("lh-review-attempt");setNotice(mode==="practice"?"Practice saved. Schedule unchanged.":`Review saved. That card is next due: ${new Date(result.due).toLocaleString()}`);
		try {const data=await refresh();await loadNext(data,attempt!.cardId);}catch(e){setAttempt(null);throw new Error("Your rating was saved, but the next card could not load. Start / next card will continue. "+(e instanceof Error?e.message:""));}
	};
	const endAttempt=async(skip:boolean)=>{
		await speechRef.current?.finish();if(draftTimer.current)clearTimeout(draftTimer.current);
		if(!attempt!.revealed)await api({action:"draft",attemptId:attempt!.id,answerText:draftRef.current,confidence:confidenceRef.current===""?null:Number(confidenceRef.current)});
		await api({action:skip?"skip":"finish",attemptId:attempt!.id});localStorage.removeItem("lh-review-attempt");
		if(skip){skippedIds.current.push(attempt!.cardId);setNotice("Skipped. No rating or schedule change recorded.");try{await loadNext(await refresh(),attempt!.cardId);}catch(e){setAttempt(null);throw e;}}
		else {setAttempt(null);setNotice("Session finished. Your saved ratings and drafts are kept; this unrated card's schedule is unchanged.");}
	};
	return <main className="mx-auto max-w-4xl space-y-6 px-6 py-10 pb-24">
		<header><h1 className="text-3xl font-semibold">{library?"Your source library":"Recall & retention"}</h1><p className="mt-3 text-muted-foreground">{library?"Files are copied here for cross-device handoff. Adding a file does not call an AI model.":"Answer from memory, compare with the explanation, then honestly rate your recall. Reviews run locally; optional dictation uses Deepgram."}</p></header>
		{error&&<div role="alert" className="rounded-lg border border-red-500 p-4">{error} <button className={button} onClick={()=>{localStorage.removeItem("lh-review-attempt");setAttempt(null);setError("");void refresh();}}>Reload cards</button></div>}
		{notice&&<p role="status" className="rounded-lg border p-4">{notice}</p>}
		{!dashboard?<p>Loading local records…</p>:library?<>
			<label className="inline-block cursor-pointer rounded-lg border px-5 py-3">Add documents (up to 25 MiB each)<input aria-label="Add source files" type="file" multiple hidden disabled={busy} onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value="";void run(async()=>{await uploadManagedFiles(files);await refresh();setNotice("Sources saved locally. Finish & sync to transfer them to your other computer.");});}}/></label>
			<p className="text-sm text-muted-foreground">Use the paperclip in a lesson to attach a managed copy directly. Folder references remain local. Source content is sent to a model only when you explicitly use it in a learning session.</p>
			{dashboard.sources.length===0?<p>No source documents yet.</p>:dashboard.sources.map(s=><article key={s.id} className="space-y-2 rounded-xl border p-5"><h2>{s.name}</h2><p className="text-xs text-muted-foreground">{(s.bytes/1024).toFixed(1)} KiB · {new Date(s.created).toLocaleString()}</p><code className="block break-all text-xs">{s.reference}</code><button className={button} onClick={()=>void navigator.clipboard.writeText('`'+s.reference+'`').then(()=>setNotice("Reference copied. Paste it into your lesson."))}>Copy lesson reference</button></article>)}
		</>:<>
			<div className="flex flex-wrap items-center gap-4 text-sm"><span>{dashboard.cards.length} cards · {dashboard.due} due · {dashboard.reviews} saved ratings</span><a className={button} href="/api/personal/review?export=1" download>Export full history</a><button className={button} onClick={()=>setEditing({...EMPTY})}>Create a card</button></div>
			{!attempt&&<section className="flex flex-wrap gap-3"><select className={button} aria-label="Deck" value={deck} onChange={e=>setDeck(e.target.value)}><option value="">All decks</option>{Array.from(new Set(dashboard.cards.map(c=>c.deck))).map(d=><option key={d}>{d}</option>)}</select><select className={button} aria-label="Review mode" value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="scheduled">Due + new · updates schedule</option><option value="practice">Practice · schedule unchanged</option></select><button className={button} disabled={busy} onClick={()=>void run(start)}>Start / next card</button></section>}
			{attempt&&<article ref={cardPanel} className="scroll-mt-5 space-y-6 rounded-2xl border bg-card p-7"><p className="text-xs text-muted-foreground">{attempt.content.deck} · version {attempt.version} · {attempt.mode}</p><section aria-label="Question" data-testid="review-prompt" className="min-w-0"><MessageResponse>{attempt.content.prompt}</MessageResponse></section><label className="block space-y-2"><span className="text-sm">Your answer / reasoning (optional)</span><textarea ref={answerInput} className={field} rows={5} value={draft} disabled={attempt.revealed||busy||speechActive} onChange={e=>{draftRef.current=e.target.value;setDraft(e.target.value);cacheDraft(e.target.value,confidence);}}/></label><label className="flex items-center gap-3 text-sm">Confidence before reveal (optional, 0–100%)<input className="w-24 rounded border bg-background p-2" aria-label="Confidence" type="number" min={0} max={100} disabled={attempt.revealed||busy} value={confidence} onChange={e=>{confidenceRef.current=e.target.value;setConfidence(e.target.value);cacheDraft(draft,e.target.value);}}/></label>
			{!attempt.revealed&&<ReviewDictation key={attempt.id} ref={speechRef} onTranscript={appendTranscript} onActiveChange={setSpeechActive} onEvent={voiceEvent} disabled={busy}/> }
			{!attempt.revealed?<button className={button} disabled={busy||speechActive} onClick={()=>void run(reveal)}>Reveal & save answer</button>:<section className="space-y-5 border-t pt-6"><h3 className="font-semibold">Core answer</h3><MessageResponse>{attempt.content.answer}</MessageResponse>{attempt.content.explanation&&<><h3 className="font-semibold">Why / deeper understanding</h3><MessageResponse>{attempt.content.explanation}</MessageResponse></>}{attempt.content.source&&<p className="whitespace-pre-wrap text-sm text-muted-foreground">Source: {attempt.content.source}</p>}<div className="flex flex-wrap gap-3">{["Again · couldn't recall","Hard · correct, difficult","Good · correct","Easy · effortless"].map((label,i)=><button key={label} className={button} disabled={busy} onClick={()=>void run(()=>rate(i+1))}>{label}</button>)}</div><p className="text-xs text-muted-foreground">These are your recall ratings, not an AI correctness score. Confidence does not select a rating.</p></section>}
			<p role="status" className="text-xs text-muted-foreground">{saved}</p><div className="flex flex-wrap gap-3"><button className={button} disabled={busy||speechActive} onClick={()=>void run(()=>endAttempt(true))}>Skip card</button><button className={button} disabled={busy||speechActive} onClick={()=>void run(()=>endAttempt(false))}>Finish session</button></div></article>}
			{editing&&<form className="space-y-4 rounded-xl border p-6" onSubmit={e=>{e.preventDefault();void run(async()=>{await api({action:"card",card:editing});setEditing(null);await refresh();setNotice("Card content saved. Existing history and scheduling preserved.");});}}><h2 className="text-lg font-semibold">{"id" in editing?"Edit wording (keeps history)":"New recall target"}</h2><p className="text-xs text-muted-foreground">Use a direct question, a clear core answer, and a substantive explanation. For a different learning objective, create a new card.</p>{([['deck','Deck'],['prompt','Question'],['answer','Core answer (Markdown)'],['explanation','Deeper explanation (Markdown)'],['source','Source / section / lesson reference']] as const).map(([key,label])=><label key={key} className="block space-y-2"><span className="text-sm">{label}</span><textarea className={field} rows={key==='explanation'?6:key==='answer'?4:2} required={key==='prompt'||key==='answer'} value={editing[key]} onChange={e=>setEditing({...editing,[key]:e.target.value})}/></label>)}<button className={button} disabled={busy}>Save card</button> <button type="button" className={button} onClick={()=>setEditing(null)}>Cancel</button></form>}
			{!attempt&&<details><summary className="cursor-pointer text-sm">Manage cards</summary>{dashboard.cards.map(c=><div className="flex items-center justify-between gap-4 border-b py-3" key={c.id}><span className="text-sm">{c.prompt}</span><button className={button} onClick={()=>setEditing(c)}>Edit</button></div>)}</details>}
			<p className="text-xs text-muted-foreground">{dashboard.legacyImports ? "Imported legacy content versions and original interaction records are retained in the full export. The original database is preserved as a recovery copy; review these cards here going forward." : "No legacy history has been imported. Existing recall databases are unchanged."}</p>
		</>}
	</main>;
}
