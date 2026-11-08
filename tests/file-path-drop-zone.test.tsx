import React, { act } from "react";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { parseHTML } from "linkedom";
import { FilePathDropZone } from "../components/file-path-drop-zone.tsx";
import { useDictationTarget } from "../components/dictation.tsx";
import { PathInput } from "../components/path-input.tsx";
import { readPathInput, restorePathSelection } from "../components/path-input-dom.ts";
import { quoteFilePath } from "../src/core/file-paths.ts";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => { await cleanup?.(); cleanup = undefined; });

/** No native DataTransfer/Selection in linkedom. These shims exercise React's
 * real bubbling handlers and the editor's logical caret contract, not OS drag. */
async function fixture({ desktop = true, claimed = true } = {}) {
	const { window: win, document: doc } = parseHTML("<html><body><div id='root'></div></body></html>");
	let active: Element = doc.body;
	Object.defineProperty(doc, "activeElement", { get: () => active });
	const selection = {
		anchorNode: null as Node | null, anchorOffset: 0, focusNode: null as Node | null, focusOffset: 0,
		setBaseAndExtent(anchorNode: Node, anchorOffset: number, focusNode: Node, focusOffset: number) {
			Object.assign(this, { anchorNode, anchorOffset, focusNode, focusOffset });
		},
	};
	Object.assign(doc, { getSelection: () => selection, oninput: null });
	win.HTMLElement.prototype.focus = function () { active = this; };
	const resolved: File[] = [];
	const backingPaths = new Map<File, string | Error>();
	const appends: string[] = [];
	let byteReads = 0;
	let uploads = 0;
	let submits = 0;
	let keys = 0;
	let value = "readthis";
	const bridge = desktop ? { getPathForFile(file: File) {
		resolved.push(file);
		const result = backingPaths.get(file);
		if (result instanceof Error) throw result;
		return result ?? "";
	} } : undefined;
	const previous = new Map<string, PropertyDescriptor | undefined>();
	for (const [name, next] of Object.entries({
		React, window: win, document: doc, Node: win.Node, HTMLElement: win.HTMLElement, Element: win.Element,
		Event: win.Event, CustomEvent: win.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true,
		fetch: async (_url: string, options: {body:FormData}) => { uploads++; const file=options.body.get("files") as File; return Response.json({sources:[{reference:"/__lh_sources__/"+"a".repeat(64)+"/"+file.name}]}); },
	})) {
		previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: next });
	}
	const oldBridge = Object.getOwnPropertyDescriptor(win, "lh");
	Object.defineProperty(win, "lh", { configurable: true, value: bridge });
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(doc.getElementById("root")!);
	function Harness() {
		useDictationTarget((text) => appends.push(text), claimed);
		return <>
			<aside data-testid="sidebar">Sidebar</aside>
			<FilePathDropZone>
				<form onSubmit={(event) => { event.preventDefault(); submits++; }}>
					<PathInput data-testid="editor" value={value} onValueChange={(next) => { value = next; draw(); }} onKeyDown={() => { keys++; }} />
					<button type="button" data-testid="elsewhere">Elsewhere</button>
					<div data-testid="content">Content away from the input</div>
				</form>
			</FilePathDropZone>
		</>;
	}
	function draw() { root.render(<Harness />); }
	await act(async () => { draw(); });
	cleanup = async () => {
		await act(async () => { root.unmount(); });
		if (oldBridge) Object.defineProperty(win, "lh", oldBridge);
		else delete (win as unknown as Record<string, unknown>).lh;
		for (const [name, descriptor] of previous) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete (globalThis as Record<string, unknown>)[name];
		}
	};
	const editor = doc.querySelector<HTMLElement>('[data-testid="editor"]')!;
	function file(name: string, path?: string | Error) {
		const result = new File(["synthetic bytes must never be read"], name, { type: "application/pdf" });
		for (const method of ["text", "arrayBuffer", "stream"] as const) {
			Object.defineProperty(result, method, { value: () => { byteReads++; throw new Error("No file content reads"); } });
		}
		if (path !== undefined) backingPaths.set(result, path);
		return result;
	}
	function transfer(files: File[], directories: number[] = [], types = ["Files"]) {
		return {
			types,
			files: Object.assign([...files], { item: (index: number) => files[index] ?? null }),
			items: files.map((file, index) => ({ kind: "file", type: file.type, getAsFile: () => file, webkitGetAsEntry: () => ({ isDirectory: directories.includes(index), isFile: !directories.includes(index) }) })),
			dropEffect: "none",
		};
	}
	async function event(type: string, dataTransfer = transfer([]), target: Element = doc.querySelector('[data-testid="content"]')!) {
		const event = Object.assign(new win.Event(type, { bubbles: true, cancelable: true }), { dataTransfer });
		await act(async () => { target.dispatchEvent(event); });
		return event;
	}
	return {
		doc, editor, appends, resolved, file, transfer, event,
		get value() { return value; },
		get uploads() { return uploads; },
		get status() { return doc.querySelector('[role="status"]')?.textContent ?? ""; },
		focusEditor(offset: number) {
			editor.focus();
			restorePathSelection(editor, { anchor: offset, focus: offset });
			doc.dispatchEvent(new win.Event("selectionchange"));
		},
		assertPathOnly() { assert.equal(byteReads, 0); assert.equal(uploads, 0); assert.equal(submits, 0); assert.equal(keys, 0); },
	};
}

test("managed file drop preserves the focused caret and inserts portable references", async () => {
    const f=await fixture();f.focusEditor(4);const file=f.file("chapter.pdf","C:\\local\\chapter.pdf");
    const drop=await f.event("drop",f.transfer([file]));assert.equal(drop.defaultPrevented,true);
    const reference="/__lh_sources__/"+"a".repeat(64)+"/chapter.pdf";
    assert.equal(f.value,`read ${quoteFilePath(reference)} this`);assert.equal(readPathInput(f.editor),f.value);
    assert.deepEqual(f.resolved,[]);assert.deepEqual(f.appends,[]);assert.equal(f.uploads,1);
});
test("browser drops copy files instead of guessing local paths",async()=>{
    const f=await fixture({desktop:false});await f.event("drop",f.transfer([f.file("source.md")]));
    assert.deepEqual(f.appends,[quoteFilePath("/__lh_sources__/"+"a".repeat(64)+"/source.md")]);assert.equal(f.uploads,1);
});
test("directory drops are refused without enumeration or partial attachment",async()=>{
    const f=await fixture();const transfer=f.transfer([f.file("folder"),f.file("file.md")],[0]);
    transfer.items[0]!.webkitGetAsEntry=()=>({isDirectory:true,isFile:false,createReader(){throw new Error("Must not traverse");}});
    await f.event("drop",transfer);assert.match(f.status,/individual files/);assert.deepEqual(f.appends,[]);f.assertPathOnly();
});
test("saved files remain discoverable when no composer is available",async()=>{
    const f=await fixture({claimed:false});await f.event("drop",f.transfer([f.file("source.md")]));assert.match(f.status,/Files saved in Source library/);assert.equal(f.uploads,1);
});
test("non-file drags and sidebar drops never upload",async()=>{
    const f=await fixture();for(const type of ["dragenter","dragover","drop"])assert.equal((await f.event(type,f.transfer([],[],["text/plain"]))).defaultPrevented,false);
    const sidebar=f.doc.querySelector('[data-testid="sidebar"]')!;
    assert.equal((await f.event("drop",f.transfer([f.file("a.md")]),sidebar)).defaultPrevented,true);f.assertPathOnly();
});

test("production AppShell places the sidebar outside its content-only drop zone", () => {
	const source = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");
	const shell = source.slice(source.indexOf("export function AppShell("));
	assert.match(shell, /<SessionsSidebar\s*\/>\s*<FilePathDropZone\b[^>]*>\{children\}<\/FilePathDropZone>/);
	assert.doesNotMatch(shell, /<FilePathDropZone\b[^>]*>[\s\S]*<SessionsSidebar/);
});
