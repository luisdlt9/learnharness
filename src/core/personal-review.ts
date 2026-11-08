/** Personal fork contract. These records do not imply objective correctness. */
export interface ReviewContent { prompt: string; answer: string; explanation: string; source: string; deck: string }
export interface ReviewCard extends ReviewContent { id: string; version: number; revision: number; due: string }
export interface ReviewAttempt { id: string; cardId: string; version: number; revision: number; mode: "scheduled" | "practice"; revealed: boolean; answerText: string; confidence: number | null; content: ReviewContent; rated: boolean }
export interface ReviewDashboard { cards: ReviewCard[]; due: number; reviews: number; legacyImports: number; sources: { id: string; name: string; bytes: number; reference: string; created: string }[] }
