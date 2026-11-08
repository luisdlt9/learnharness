# Personal fork instructions

Luis authorized implementation of the agreed design on 2026-11-08: source-run Mac/Windows, managed portable attachments, controlled single-writer Git handoff, model-free FSRS review and durable versioned history. Within that approved scope, make routine reversible implementation decisions and complete required checks without repeated confirmation. Ask only when a material unresolved decision affects his data, costs or scope. This user direction supersedes the upstream blanket "No guessing" approval rule below for this work.

Read PERSONAL.md before changing the personal modules or syncing. Keep personal data, source documents, credentials and LifeOS context out of this public code repo. Use isolated scratch profiles for tests. Preserve stable IDs, review history and immutable content versions. Do not migrate or reset the existing LifeOS Recall database. No model/network calls in ordinary review. Keep each customization in a small module; retain upstream/main and merge via a tested update branch. Run tests, typecheck, lint and build for relevant code changes. Do not expose the local server beyond loopback.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# No guessing

All design authority belongs to the human. **Never guess a design or implementation decision.** If anything is ambiguous — naming, behavior, data shapes, UX, defaults, scope boundaries, prompt wording — STOP and ask with the ask-user-question tool before proceeding. If you are "a little unsure," you are unsure: ask. A wrong guess is far more expensive than a question. Ask early, ask specific, one question per call.

Concretely: first investigate and plan rigorously (asking the user design questions along the way), get the plan approved by the user, and only then implement. Implementation should be mechanical execution of an approved plan — not interpretation.
