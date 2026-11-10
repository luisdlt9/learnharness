/** Personal fork contract. These records do not imply objective correctness. */
export interface ReviewContent { prompt: string; answer: string; explanation: string; source: string; deck: string }
export interface ReviewCard extends ReviewContent { id: string; version: number; revision: number; due: string }
export interface ReviewAttempt { id: string; cardId: string; version: number; revision: number; mode: "scheduled" | "practice"; revealed: boolean; answerText: string; confidence: number | null; content: ReviewContent; rated: boolean }
export interface ReviewDashboard { cards: ReviewCard[]; due: number; reviews: number; legacyImports: number; sources: { id: string; name: string; bytes: number; reference: string; created: string }[] }

/** Pure queue selection. Practice rotates; scheduled review obeys saved due dates. */
export function nextPersonalReviewCard(cards: ReviewCard[], mode: "scheduled"|"practice", deck: string, now: string, previousId?: string, skipped: readonly string[] = []): ReviewCard | undefined {
	const eligible=cards.filter(c=>(!deck||c.deck===deck)&&!skipped.includes(c.id)&&(mode==="practice"||c.due<=now));
	if(mode==="scheduled")return eligible.find(c=>c.id!==previousId)??eligible[0];
	const index=eligible.findIndex(c=>c.id===previousId);
	return eligible[(index+1)%eligible.length];
}
