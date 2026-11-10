"use client";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { MicIcon } from "lucide-react";
import { useDictation } from "@/components/dictation";

export interface ReviewDictationHandle { finish: () => Promise<void>; active: boolean }
export type ReviewVoiceEvent = "requested" | "transcribed" | "cancelled" | "failed";
export function ReviewDictation({ref,onTranscript,onActiveChange,onEvent,disabled=false}:{
	ref?:Ref<ReviewDictationHandle>;
	onTranscript:(text:string)=>void;
	onActiveChange:(active:boolean)=>void;
	onEvent:(kind:ReviewVoiceEvent)=>void;
	disabled?:boolean;
}) {
	const callbacks=useRef({onTranscript,onActiveChange,onEvent});callbacks.current={onTranscript,onActiveChange,onEvent};
	const dictation=useDictation({onDemand:true,directTarget:true,append:text=>{callbacks.current.onTranscript(text);callbacks.current.onEvent("transcribed");}});
	useImperativeHandle(ref,()=>({finish:dictation.finish,active:dictation.active}),[dictation.finish,dictation.active]);
	useEffect(()=>{callbacks.current.onActiveChange(dictation.active);},[dictation.active]);
	useEffect(()=>()=>{callbacks.current.onActiveChange(false);},[]);
	useEffect(()=>{if(dictation.error)callbacks.current.onEvent("failed");},[dictation.error]);
	const label=dictation.phase==="idle"?"Dictate answer":dictation.phase==="connecting"?"Connecting… stop":dictation.phase==="stopping"?"Finishing transcript…":"Stop dictation";
	return <div className="space-y-2" data-testid="review-dictation">
		<div className="flex flex-wrap items-center gap-3">
			<button type="button" className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-accent disabled:opacity-40" disabled={dictation.phase==="stopping"||(disabled&&!dictation.active)} aria-pressed={dictation.active} onClick={()=>{if(!dictation.active)callbacks.current.onEvent("requested");dictation.toggle();}}><MicIcon className="size-4"/>{label}</button>
			{dictation.active&&<button type="button" className="rounded-lg border px-3 py-2 text-sm hover:bg-accent" onClick={()=>{dictation.cancel();callbacks.current.onEvent("cancelled");}}>Cancel recording</button>}
			{dictation.active&&<span role="status" className="text-sm text-muted-foreground">{dictation.phase==="stopping"?"Saving the last spoken words…":"Microphone active. Stop to insert and check your transcript."}</span>}
		</div>
		{dictation.error&&<p role="alert" className="text-sm text-red-400">{dictation.error}. Check microphone access or Settings → Providers → Dictation, then retry. Your existing answer is kept.</p>}
		<p className="text-xs text-muted-foreground">Optional Deepgram transcription sends audio to Deepgram and uses its credits. No LLM grading. Stop, check/edit the text, then reveal. Audio is not saved by this app.</p>
	</div>;
}
