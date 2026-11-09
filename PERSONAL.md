# Personal learning fork

This fork adds an explicit model-free Review mode, managed source documents, and controlled Mac/Windows handoff. Upstream teaching and practice remain available. The source code is public; the learning-state repository must be private. Never copy credentials or real learner records into this repository, tests, screenshots for publication, or issue reports.

## Daily use

Windows: double-click **Start-LearnHarness.cmd**. On macOS use **Start-LearnHarness.command** after the one-time setup below. Opening requires Internet/GitHub access to acquire the single-writer session; an already-open local Review session does not need a model connection. Do not use a second app instance or `npm run dev` against this live profile.

Windows shortcut update: every invocation opens a fresh Chrome browser window (Edge fallback) after the local app is ready, using the browser's normal profile. If the app is already running, it reuses the same owned server/session rather than starting another. Closing only the browser window does not stop/sync the backend; use **Finish and sync LearnHarness** before switching computers. The native desktop lifetime and Mac launcher are unchanged.

Use **Review** for due/new cards or unscheduled Practice. Read the prompt, optionally type reasoning/confidence, reveal the stored explanation, then choose Again/Hard/Good/Easy. Practice records the attempt without changing its due date. Ratings are self-assessed recall, not objective AI grades. Revealing freezes the answer; a card edit appends a content version without deleting history. SQLite commits precede save confirmations. Failed ratings can be retried safely. A stale tab cannot overwrite a newer schedule. Export downloads all cards, content versions, attempts, events, reviews, scheduler state/configuration and source metadata. Wall-clock timestamps include possible idle time; they are not active-study estimates.

No model is called by review or its storage module. Review/library do not mount background job or teaching observers. Optional LLM feedback/batch analysis has not been added: start a teaching session explicitly if needed. Existing built-in Deepgram dictation is an external service and is not silently enabled in Review.

Use the paperclip **Files · copy to synced library**, drag individual files into a lesson, or use **Source library**. Each file is copied, content-hashed and catalogued, with a portable `/__lh_sources__/<hash>/<name>` reference resolved on the server. Graph file imports also retain their originals before model processing. The current per-file limit is 25 MiB; folders attached as references remain local and are explicitly labelled. Copying a file alone does not extract its graph or call a model. Credential-like filenames are refused, but this is not content inspection: only select documents intended for the private learning library. A changed source gets a new hash; old cited versions remain available. Old un-managed absolute paths are not retrospectively repaired.

Close the desktop window (on Mac, quit the app), or run **Finish-and-Sync.cmd** / **Finish-and-Sync.command**. This stops the owned app/server processes, checks integrity, backs up, pushes a coherent snapshot and releases the session. Verify success with `npm run personal:status` or the result file before switching machines. If there are unfinished teaching jobs, reopen the same machine to finish/cancel them first. Do not force shutdown and assume sync succeeded.

## Paths and authority

Defaults are relative to your OS home, on both computers:

| Path under `~/LearnHarness/` | Purpose |
| --- | --- |
| `data/review/review.sqlite3` | Authoritative fork review database; schema v1, DELETE journal, atomic SQLite transactions |
| `data/library/objects/` | Immutable, hashed source-file bytes; metadata in review SQLite |
| `data/chats`, `graph`, `jobs`, `settings.json`, `prompts` | Upstream learning state |
| `sync-repo/` | Separate private Git repo with `snapshot/`, hashed manifest and writer handoff record |
| `credentials/` | Device-local auth and subscription tokens; never synced |
| `config.json`, `baseline.json`, `running.json` | Device configuration, prior snapshot baseline and process ownership |
| `backups/` | Local pre-restore/pre-sync recovery copies; do not silently prune |
| `last-result.json`, `launcher*.log` | Sync result and local diagnostic logs; never synced |

Git snapshots are transport/backup, not a second independent live store. Review uses ts-fsrs 6.0.0 with explicitly selected FSRS-6, retention target 0.9 and fuzz disabled. Each review stores its scheduler configuration, raw log and before/after state. Package version and FSRS algorithm version are distinct. Do not change either for existing cards without a documented migration. The legacy bridge in `scripts/import-legacy.ts` is deliberately limited to never-reviewed cards: it preserves stable IDs, original due dates and all content versions, and retains the entire original export (sessions, attempts, events, study reports and scheduler configuration) verbatim in `legacy_snapshots`. Any recorded rating, learned memory state or nonzero schedule revision blocks import until a validated cross-engine migration exists. No past ratings are inferred. Once explicitly imported, review the moved cards here; keep the original database as a recovery copy rather than running two independent schedules.

## One-time setup on another computer

Install Git (authenticated to your own GitHub account) and Node 26, then clone the owner's code fork and check out `codex/personal-learning`. Use the exact tested commit referenced by the private snapshot manifest. In that checkout:

```sh
npm ci
npm run personal:setup -- https://github.com/YOUR-ACCOUNT/learnharness-data.git
npm run personal:open
```

Before opening on the second computer, Finish & sync on the first. Setup creates its own device identity and auth file. Configure learning providers and model slots in Settings; GitHub repository authentication does not configure LearnHarness's model connections. Never copy tokens between machines. `.command` launchers may need `chmod +x Start-LearnHarness.command Finish-and-Sync.command` on macOS. Windows can use the separate runtime installed at `%LOCALAPPDATA%\LifeOS\runtime\node-v26.13.0-win-x64\node.exe`; no system Node switch is necessary. The first device's config is not portable; run setup rather than copying it.

## Sync protocol and limits

Acquire a single-writer lease by a normal Git commit/push before starting the server. A competing claim loses the push and fails; no force-push or automatic graph/JSON merges. Restore only when the local data matches its known baseline; a conflicting unsynced edit blocks restoration. Restore and publish verify source hashes, the snapshot manifest and SQLite integrity/schema. The app binds `127.0.0.1:3020`. Another computer cannot access it as a hosted service.

This requires using these launchers. It is not a distributed filesystem lock against manually bypassing them. There is no automatic simultaneous/offline multi-device merge. GitHub outage means no new handoff; already-saved local data stays intact. Secrets/debug/caches are excluded; an unfamiliar data family blocks sync for deliberate allowlist review. Background jobs must settle before publish. Git's non-fast-forward rejection is an additional guard, not an automatic recovery procedure.

On failed sync: keep the machine/data as-is, read `last-result.json` and logs, back up `data/` plus `sync-repo/`, and have an assistant inspect the divergence. Never delete the data folder, force-push, or automatically clear another device's lease. If only the launcher crashed and all app children are stopped, `npm run personal:finish` can publish its owned session. Otherwise reopen the same device and resolve outstanding jobs. A rejected lease/push may leave a local Git commit requiring deliberate reconciliation; preserve it.

## Updates and development

`upstream` is the creator's repository; `origin` is this fork. Finish & sync first. `npm run personal:update` fetches both remotes without merging. Create an update branch, merge `upstream/main`, resolve conflicts, run checks on isolated data, then push the tested custom branch. Keep each feature in a separate commit where practical. Do not replace this fork with an official installer or run its packaged updater. Source-run desktop has no packaged updater.

After testing a descendant code update, use `node scripts/personal.mjs open --accept-code-update` once on the first machine, then Finish & sync to stamp the new tested code commit. Update the second computer to that commit before opening. The launcher refuses a different code commit by default. This guard does not establish migration safety: test the new build on a copied/scratch profile before accepting it.

Code checks:

```sh
npm run test:personal
npm run typecheck
npm run lint
npm run build
```

Use a temporary `LH_DATA_DIR` and separate empty `LH_AUTH_FILE` for direct development, with a port other than 3020. Do not inject real provider credentials into tests. Personal API routes deliberately import the isolated personal server module instead of the broad server barrel so recall does not initialize agent services. The lint exception is narrowly scoped. Public tests use synthetic temporary data only. Windows launchers use their own Node executable; app requirements need not change the user's global Node.

## Current limitations

Mac installation/runtime are prepared but require verification on the actual Mac. No learning provider is selected or authorized by setup. A narrow never-reviewed legacy bridge is available and tested; use its recorded installation outcome to determine whether data has actually been imported. Card creation/editing is local and manual; AI can supply content through explicit authoring, but automatic candidate-card generation, optional AI review feedback, and batch study analysis are not implemented. No unspecified cosmetic redesign was assumed.

## Validation notes (initial Windows implementation)

Personal storage/handoff tests and browser smoke use synthetic temporary data. The browser smoke exercises create, draft, reload/resume, reveal, rating, restart persistence and source upload while blocking nonlocal requests and rejecting any API outside `/api/personal/`. A selected upstream source-access suite cannot run fully without Windows file-symlink privileges; this is an explicit test limitation, not a passed check. The file-access/junction, attachment, path and notes-import checks are run separately. Production build retains upstream filesystem-tracing warnings; this project is source-run, not an audited packaged distribution. Compatible dependency patches were applied and unused `ansi-to-react` removed; eight moderate development/packaging dependency advisories remained at initial setup. No forced breaking dependency downgrades were applied.
