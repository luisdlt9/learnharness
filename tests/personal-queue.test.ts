import {test} from "node:test";
import assert from "node:assert/strict";
import {nextPersonalReviewCard} from "../src/core/personal-review.ts";
import type {ReviewCard} from "../src/core/personal-review.ts";
const c=(id:string,due:string,deck="Rust"):ReviewCard=>({id,due,deck,prompt:id,answer:id,explanation:"",source:"",version:1,revision:0});
test("continuous scheduled queue respects deck, due times, skips and completion",()=>{
	const now="2026-11-10T12:00:00Z";
	const cards=[c("rated","2026-11-11T12:00:00Z"),c("next","2026-11-09T12:00:00Z"),c("other","2026-11-09T12:00:00Z","Other")];
	assert.equal(nextPersonalReviewCard(cards,"scheduled","Rust",now,"rated")?.id,"next");
	assert.equal(nextPersonalReviewCard(cards,"scheduled","Rust",now,"next",["next"]),undefined);
	assert.equal(nextPersonalReviewCard(cards,"scheduled","",now,"rated",["next"])?.id,"other");
});
test("practice rotates continuously without mutating saved schedules",()=>{
	const cards=[c("a","2099-01-01T00:00:00Z"),c("b","2099-01-01T00:00:00Z")];const before=JSON.stringify(cards);
	assert.equal(nextPersonalReviewCard(cards,"practice","Rust","2026-11-10T12:00:00Z")?.id,"a");
	assert.equal(nextPersonalReviewCard(cards,"practice","Rust","2026-11-10T12:00:00Z","a")?.id,"b");
	assert.equal(nextPersonalReviewCard(cards,"practice","Rust","2026-11-10T12:00:00Z","b")?.id,"a");
	assert.equal(nextPersonalReviewCard([],"practice","Rust","2026-11-10T12:00:00Z"),undefined);assert.equal(JSON.stringify(cards),before);
});
