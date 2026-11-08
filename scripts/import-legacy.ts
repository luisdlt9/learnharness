/** Explicit narrow bridge; never opens or writes the original database. */
import fs from "node:fs";
import { importPersonalLegacy } from "../src/store/personal-review.ts";
const file=process.argv[2];
if(!file)throw new Error("Usage: node --import tsx scripts/import-legacy.ts /path/to/fresh-export.json (set LH_DATA_DIR)");
console.log(JSON.stringify(await importPersonalLegacy(fs.readFileSync(file,"utf8"))));
