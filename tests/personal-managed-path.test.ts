import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
test("portable source resolves to this device and retains file-access policy",async()=>{
	const root=fs.mkdtempSync(path.join(os.tmpdir(),"lh-portable-source-"));
	process.env.LH_DATA_DIR=root; // isolated test process, before config import
	try{
		const {resolveSourcePath}=await import("../src/agent/tools/fs-shared.ts");
		const bytes=Buffer.from("Chapter fixture");const hash=createHash("sha256").update(bytes).digest("hex");
		const actual=path.join(root,"library","objects",hash,"chapter.md");fs.mkdirSync(path.dirname(actual),{recursive:true});fs.writeFileSync(actual,bytes);
		const reference=`/__lh_sources__/${hash}/chapter.md`;
		assert.equal(resolveSourcePath(reference),fs.realpathSync(actual));
		assert.throws(()=>resolveSourcePath(`/__lh_sources__/${hash}/../escape`),/Invalid/);
		assert.throws(()=>resolveSourcePath(reference,{restricted:true,folders:[],unavailable:[]}),/not allowed|outside|No allowed/i);
	}finally{fs.rmSync(root,{recursive:true,force:true});}
});
