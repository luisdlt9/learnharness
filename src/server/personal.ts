import { exportPersonalReview, personalAttempt, personalDashboard, ratePersonalAttempt, savePersonalCard, savePersonalSource } from "../store/personal-review.ts";
export { savePersonalSource } from "../store/personal-review.ts";

/** Explicit local operations only; this module never calls teaching/extraction. */
function mutationAllowed(request: Request) {
	const origin = request.headers.get("origin");
	const host=request.headers.get("host")??new URL(request.url).host;
	const expected=new URL(`http://${host}`);
	if (!["127.0.0.1","localhost","[::1]"].includes(expected.hostname) || request.headers.get("x-lh-personal") !== "1" || (origin && origin !== expected.origin)) throw new Error("Same-origin application request required");
}
async function boundedBytes(request: Request, limit: number) {
	if (Number(request.headers.get("content-length")) > limit) throw new Error("Request is too large");
	const reader = request.body?.getReader(); if (!reader) throw new Error("Missing request body");
	const parts: Uint8Array[]=[]; let size=0;
	try { for (;;) { const {value,done}=await reader.read(); if(done) break; size+=value.length; if(size>limit) throw new Error("Request is too large"); parts.push(value); } }
	finally { void reader.cancel().catch(()=>{}); reader.releaseLock(); }
	return Buffer.concat(parts);
}
export async function personalGet(request: Request) {
	try {
		if (new URL(request.url).searchParams.has("export")) return Response.json(exportPersonalReview(), {headers:{"Content-Disposition":"attachment; filename=review-export.json", "Cache-Control":"no-store"}});
		return Response.json(personalDashboard(), {headers:{"Cache-Control":"no-store"}});
	} catch(e) {return Response.json({error:e instanceof Error?e.message:"Read failed"},{status:409});}
}
export async function personalPost(request: Request) {
	try {
		mutationAllowed(request);
		const body=JSON.parse((await boundedBytes(request,256*1024)).toString("utf8")) as Record<string,unknown>;
		if(body.action==="card") return Response.json(await savePersonalCard(body.card));
		if(body.action==="rate") return Response.json(await ratePersonalAttempt(body));
		if(typeof body.action!=="string") throw new Error("Missing action");
		return Response.json(personalAttempt(body.action,body));
	} catch(e) {return Response.json({error:e instanceof Error?e.message:"Save failed"},{status:409});}
}
export async function personalUpload(request: Request) {
	try {
		mutationAllowed(request);
		const bytes=await boundedBytes(request,26*1024*1024);
		const form=await new Response(bytes,{headers:{"Content-Type":request.headers.get("content-type")??""}}).formData();
		const files=form.getAll("files"); if(!files.length||files.length>20) throw new Error("Choose 1–20 files");
		const sources=[];
		for(const f of files) {if(!(f instanceof File)) throw new Error("Invalid source file"); sources.push(savePersonalSource(f.name,new Uint8Array(await f.arrayBuffer())));}
		return Response.json({sources});
	} catch(e) {return Response.json({error:e instanceof Error?e.message:"Upload failed"},{status:400});}
}
