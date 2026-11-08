/** No provider imports or network activity: local review and source storage only. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DefaultScheduler } from "ts-fsrs";
import { PATHS } from "../../config.ts";
import type { ReviewContent, ReviewCard, ReviewAttempt, ReviewDashboard } from "../core/personal-review.ts";

const CONFIG = { version: "FSRS-6" as const, desiredRetention: 0.9, enableFuzz: false };
let schedulerPromise: ReturnType<typeof DefaultScheduler> | undefined;
const scheduler = () => schedulerPromise ??= DefaultScheduler(CONFIG);
type Row = Record<string, string | number | null>;
const text = (v: unknown, max = 50000) => { if (typeof v !== "string" || v.length > max) throw new Error("Invalid text field"); return v; };
function content(value: unknown): ReviewContent {
	const v = value as ReviewContent;
	const c = { prompt: text(v?.prompt), answer: text(v?.answer), explanation: text(v?.explanation ?? ""), source: text(v?.source ?? "", 2000), deck: text(v?.deck ?? "Personal", 200) };
	if (!c.prompt.trim() || !c.answer.trim()) throw new Error("Question and answer are required");
	return c;
}
function db(root = PATHS.data) {
	fs.mkdirSync(path.join(root, "review"), { recursive: true });
	const d = new DatabaseSync(path.join(root, "review", "review.sqlite3"));
	d.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE;");
	const version = (d.prepare("PRAGMA user_version").get() as Row).user_version;
	if (version !== 0 && version !== 1) { d.close(); throw new Error("Unsupported review schema; use a compatible app version"); }
	if (version === 0) d.exec(`BEGIN IMMEDIATE;
	CREATE TABLE cards(id TEXT PRIMARY KEY, version INTEGER NOT NULL, revision INTEGER NOT NULL, state TEXT NOT NULL);
	CREATE TABLE versions(card_id TEXT NOT NULL, version INTEGER NOT NULL, content TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(card_id,version));
	CREATE TABLE attempts(id TEXT PRIMARY KEY, card_id TEXT NOT NULL, version INTEGER NOT NULL, revision INTEGER NOT NULL, mode TEXT NOT NULL, shown TEXT NOT NULL, draft TEXT NOT NULL DEFAULT '', confidence REAL, revealed TEXT, rated TEXT, session_id TEXT NOT NULL);
	CREATE TABLE events(id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL, payload TEXT NOT NULL);
	CREATE TABLE reviews(attempt_id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, rating INTEGER NOT NULL, at TEXT NOT NULL, before_state TEXT NOT NULL, after_state TEXT NOT NULL, revlog TEXT NOT NULL, scheduler TEXT NOT NULL);
	CREATE TABLE sources(id TEXT PRIMARY KEY, name TEXT NOT NULL, bytes INTEGER NOT NULL, hash TEXT NOT NULL, created TEXT NOT NULL, origin TEXT NOT NULL);
	CREATE TABLE legacy_snapshots(id TEXT PRIMARY KEY, imported TEXT NOT NULL, provenance TEXT NOT NULL, snapshot TEXT NOT NULL);
	PRAGMA user_version=1; COMMIT;`);
	return d;
}
function transaction<T>(d: DatabaseSync, fn: () => T): T {
	d.exec("BEGIN IMMEDIATE");
	try { const result = fn(); d.exec("COMMIT"); return result; } catch (e) { d.exec("ROLLBACK"); throw e; }
}
function event(d: DatabaseSync, attempt: string, kind: string, payload: unknown = {}) {
	d.prepare("INSERT INTO events VALUES(?,?,?,?,?)").run(randomUUID(), attempt, kind, new Date().toISOString(), JSON.stringify(payload));
}
function attemptView(d: DatabaseSync, a: Row): ReviewAttempt {
	const v = d.prepare("SELECT content FROM versions WHERE card_id=? AND version=?").get(a.card_id!, a.version!) as Row;
	return { id: String(a.id), cardId: String(a.card_id), version: Number(a.version), revision: Number(a.revision), mode: a.mode as "scheduled" | "practice", revealed: Boolean(a.revealed), rated: Boolean(a.rated), answerText: String(a.draft), confidence: a.confidence as number | null, content: JSON.parse(String(v.content)) };
}
export function personalDashboard(root = PATHS.data): ReviewDashboard {
	const d = db(root);
	try {
		const cards = (d.prepare("SELECT c.*,v.content FROM cards c JOIN versions v ON v.card_id=c.id AND v.version=c.version").all() as Row[]).map(r => ({ ...JSON.parse(String(r.content)), id: String(r.id), version: Number(r.version), revision: Number(r.revision), due: JSON.parse(String(r.state)).dueAt } as ReviewCard));
		cards.sort((a,b) => a.due.localeCompare(b.due));
		return { cards, due: cards.filter(c => c.due <= new Date().toISOString()).length, reviews: Number((d.prepare("SELECT count(*) AS n FROM reviews").get() as Row).n), legacyImports: Number((d.prepare("SELECT count(*) AS n FROM legacy_snapshots").get() as Row).n), sources: (d.prepare("SELECT * FROM sources ORDER BY created DESC").all() as Row[]).map(r => ({ id: String(r.id), name: String(r.name), bytes: Number(r.bytes), reference: `/__lh_sources__/${r.id}`, created: String(r.created) })) };
	} finally { d.close(); }
}
export async function savePersonalCard(value: unknown, root = PATHS.data) {
	const c = content(value); const input = value as { id?: string; version?: number }; const s = await scheduler(); const now = new Date(); const d = db(root);
	try { return transaction(d, () => {
		const id = input.id ? text(input.id, 200) : randomUUID();
		const old = d.prepare("SELECT * FROM cards WHERE id=?").get(id) as Row | undefined;
		if (input.id && !old) throw new Error("Unknown card");
		if (old && input.version !== old.version) throw new Error("Card changed in another tab; reload before editing");
		const version = old ? Number(old.version) + 1 : 1;
		if (!old) d.prepare("INSERT INTO cards VALUES(?,?,?,?)").run(id, version, 0, JSON.stringify(s.newCard({ now, cardId: id })));
		else d.prepare("UPDATE cards SET version=? WHERE id=?").run(version, id);
		d.prepare("INSERT INTO versions VALUES(?,?,?,?)").run(id, version, JSON.stringify(c), now.toISOString());
		return { id, version };
	}); } finally { d.close(); }
}
export function personalAttempt(action: string, input: Record<string, unknown>, root = PATHS.data): ReviewAttempt {
	const d = db(root);
	try { return transaction(d, () => {
		const id = text(input.attemptId, 200);
		let a = d.prepare("SELECT * FROM attempts WHERE id=?").get(id) as Row | undefined;
		if (action === "show" && !a) {
			const cardId = text(input.cardId, 200); const c = d.prepare("SELECT * FROM cards WHERE id=?").get(cardId) as Row | undefined;
			if (!c) throw new Error("Unknown card");
			if (input.mode !== "scheduled" && input.mode !== "practice") throw new Error("Invalid review mode");
			if (input.mode === "scheduled" && JSON.parse(String(c.state)).dueAt > new Date().toISOString()) throw new Error("This card is not due; use Practice");
			d.prepare("INSERT INTO attempts(id,card_id,version,revision,mode,shown,session_id) VALUES(?,?,?,?,?,?,?)").run(id,cardId,c.version!,c.revision!,input.mode,new Date().toISOString(),text(input.sessionId,200));
			event(d,id,"shown"); a = d.prepare("SELECT * FROM attempts WHERE id=?").get(id) as Row;
		}
		if (!a) throw new Error("Unknown attempt");
		if (action === "draft" || action === "reveal") {
			if (!a.revealed) {
				const answer = text(input.answerText ?? ""); const confidence = input.confidence;
				if (confidence !== null && confidence !== undefined && (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 100)) throw new Error("Confidence must be 0–100 or unset");
				d.prepare("UPDATE attempts SET draft=?,confidence=? WHERE id=?").run(answer, confidence as number ?? null, id);
				if (action === "reveal") { d.prepare("UPDATE attempts SET revealed=? WHERE id=?").run(new Date().toISOString(),id); event(d,id,"revealed"); }
			}
		} else if (action === "skip" && !a.rated) { event(d,id,"skipped"); }
		else if (action !== "show" && action !== "get") { if (action !== "skip") throw new Error("Unknown attempt action"); }
		return attemptView(d, d.prepare("SELECT * FROM attempts WHERE id=?").get(id) as Row);
	}); } finally { d.close(); }
}
export async function ratePersonalAttempt(input: Record<string, unknown>, root = PATHS.data) {
	const s = await scheduler(); const d = db(root);
	try { return transaction(d, () => {
		const id = text(input.attemptId,200); const requestId = text(input.requestId,200); const rating = input.rating;
		if (rating !== 1 && rating !== 2 && rating !== 3 && rating !== 4) throw new Error("Invalid recall rating");
		const a = d.prepare("SELECT * FROM attempts WHERE id=?").get(id) as Row | undefined;
		if (!a?.revealed) throw new Error("Reveal the answer before rating");
		const prior = d.prepare("SELECT * FROM reviews WHERE attempt_id=? OR request_id=?").get(id, requestId) as Row | undefined;
		if (prior) { if (prior.attempt_id !== id || prior.rating !== rating || prior.request_id !== requestId) throw new Error("Conflicting review retry"); return { saved: true, due: JSON.parse(String(prior.after_state)).dueAt }; }
		if (a.rated) throw new Error("Attempt already rated");
		const c = d.prepare("SELECT * FROM cards WHERE id=?").get(a.card_id!) as Row;
		if (a.mode === "scheduled" && c.revision !== a.revision) throw new Error("Schedule changed in another tab; start a fresh attempt");
		const before = JSON.parse(String(c.state));
		const state = { ...before, dueAt: new Date(before.dueAt), lastReviewAt: before.lastReviewAt ? new Date(before.lastReviewAt) : null };
		const now = new Date(); const result = a.mode === "scheduled" ? s.review({ card: state, grade: rating, now }) : { card: before, revlog: null };
		d.prepare("INSERT INTO reviews VALUES(?,?,?,?,?,?,?,?)").run(id,requestId,rating,now.toISOString(),String(c.state),JSON.stringify(result.card),JSON.stringify(result.revlog),JSON.stringify({ package: "ts-fsrs", packageVersion: "6.0.0", config: CONFIG, resolved: s.config }));
		if (a.mode === "scheduled") d.prepare("UPDATE cards SET state=?,revision=revision+1 WHERE id=?").run(JSON.stringify(result.card),a.card_id!);
		d.prepare("UPDATE attempts SET rated=? WHERE id=?").run(now.toISOString(),id); event(d,id,"rated",{rating,mode:a.mode});
		return { saved: true, due: (result.card.dueAt instanceof Date ? result.card.dueAt.toISOString() : result.card.dueAt) };
	}); } finally { d.close(); }
}
export function exportPersonalReview(root = PATHS.data) {
	const d = db(root);
	try { return { schema:1, exportedAt:new Date().toISOString(), tables:Object.fromEntries(["cards","versions","attempts","events","reviews","sources","legacy_snapshots"].map(t=>[t,d.prepare(`SELECT * FROM ${t}`).all()])) }; } finally { d.close(); }
}
/** Narrow, lossless bridge for legacy cards with NO scheduled reviews.
 * Reviewed schedules require a separately verified cross-engine migration. */
export async function importPersonalLegacy(raw: string, root = PATHS.data) {
	const snapshot=JSON.parse(raw);
	if(snapshot.schema_version!==1||!Array.isArray(snapshot.cards)||!Array.isArray(snapshot.schedule)||!Array.isArray(snapshot.card_versions)||!Array.isArray(snapshot.reviews))throw new Error("Unsupported legacy export");
	if(snapshot.reviews.length||snapshot.schedule.some((r:{revision:number;fsrs_json:string})=>r.revision!==0||JSON.parse(r.fsrs_json).last_review!==null))throw new Error("Reviewed legacy schedules require a validated engine migration; nothing imported");
	const s=await scheduler();const id=createHash("sha256").update(raw).digest("hex");const d=db(root);
	const blocks=(items:{type:string;text?:string;items?:string[];ordered?:boolean;code?:string;language?:string}[]|undefined)=>items?.map(b=>b.type==="list"?(b.items??[]).map((t,i)=>`${b.ordered?`${i+1}.`:"-"} ${t}`).join("\n"):b.type==="code"?`\`\`\`${b.language??"rust"}\n${b.code??b.text??""}\n\`\`\``:b.type==="heading"?`**${b.text??""}**`:b.text??"").join("\n\n")??"";
	try{return transaction(d,()=>{
		if(d.prepare("SELECT id FROM legacy_snapshots WHERE id=?").get(id))return {alreadyImported:true,cards:snapshot.cards.length};
		for(const card of snapshot.cards){
			if(!card.active)throw new Error("Inactive legacy cards require explicit migration support");
			if(d.prepare("SELECT id FROM cards WHERE id=?").get(card.uid))throw new Error("Legacy card ID already exists; refusing overwrite");
			const schedule=snapshot.schedule.find((r:{uid:string})=>r.uid===card.uid);if(!schedule)throw new Error("Missing legacy schedule");
			const old=JSON.parse(schedule.fsrs_json);if(old.stability!==null||old.difficulty!==null)throw new Error("Legacy card has learned state; refusing automatic conversion");
			const state=s.newCard({now:new Date(old.due),cardId:card.uid});
			d.prepare("INSERT INTO cards VALUES(?,?,?,?)").run(card.uid,card.current_version,schedule.revision,JSON.stringify(state));
			for(const version of snapshot.card_versions.filter((v:{uid:string})=>v.uid===card.uid)) {
				const v=JSON.parse(version.content_json);const explanation=[blocks(v.explanation_blocks),v.out?`Expected output:\n\n\`\`\`\n${v.out}\n\`\`\``:"",v.rubric?.length?"Self-check:\n"+v.rubric.map((x:string)=>"- "+x).join("\n"):""].filter(Boolean).join("\n\n");
				const c=content({deck:snapshot.decks.find((r:{id:string})=>r.id===card.deck_id)?.title??card.deck_id,prompt:v.q+(v.code?`\n\n\`\`\`rust\n${v.code}\n\`\`\``:""),answer:blocks(v.answer_blocks)||v.a,explanation,source:v.source_url??v.src??""});
				d.prepare("INSERT INTO versions VALUES(?,?,?,?)").run(card.uid,version.version,JSON.stringify(c),version.recorded_at);
			}
			if(!d.prepare("SELECT content FROM versions WHERE card_id=? AND version=?").get(card.uid,card.current_version))throw new Error("Missing current legacy content version");
		}
		d.prepare("INSERT INTO legacy_snapshots VALUES(?,?,?,?)").run(id,new Date().toISOString(),"LifeOS Recall schema 1; unreviewed schedules only; original records/config preserved verbatim",raw);
		return {alreadyImported:false,cards:snapshot.cards.length};
	});}finally{d.close();}
}
export function savePersonalSource(name: string, bytes: Uint8Array, origin = "attachment", root = PATHS.data) {
	if (!bytes.length || bytes.length > 25*1024*1024) throw new Error("Source must be between 1 byte and 25 MiB");
	const safe = name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-150);
	if (!safe || safe === "." || safe === ".." || /^(?:\.env|auth\.json|.*credentials.*|id_rsa|id_ed25519)$/i.test(safe)) throw new Error("Unsupported or credential-like filename");
	const hash = createHash("sha256").update(bytes).digest("hex"); const id = `${hash}/${safe}`;
	const file = path.join(root,"library","objects",hash,safe); fs.mkdirSync(path.dirname(file),{recursive:true});
	if (!fs.existsSync(file)) { const tmp = `${file}.${randomUUID()}.tmp`; const fd = fs.openSync(tmp,"wx"); try {fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);} finally {fs.closeSync(fd);} fs.renameSync(tmp,file); }
	else if (createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== hash) throw new Error("Source integrity check failed");
	const d = db(root); try { d.prepare("INSERT OR IGNORE INTO sources VALUES(?,?,?,?,?,?)").run(id,text(name,1000),bytes.length,hash,new Date().toISOString(),text(origin,2000)); } finally { d.close(); }
	return {id, name, reference:`/__lh_sources__/${id}`};
}
