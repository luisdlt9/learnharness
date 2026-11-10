# Recall card writing and explanation guidance

Use this guide when creating or revising recall cards. It is authoring guidance for assistants/maintainers, not an automatically injected teaching prompt and not a request to generate cards during every lesson. The review UI displays stored content without calling an LLM. Preserve stable IDs, append content versions, and keep previous reviews pinned to their original versions. A new learning objective needs a new card.

## Question

Ask one clear, specific question. Name the subject and the decision being tested; don't make the learner infer what a vague phrase means. For a code question, ask what compiles/prints/moves and request a reason. Put executable examples in fenced, language-labelled code blocks, not prose or a heading. Use inline code for identifiers and types. Keep answer clues out of the question.

## Core answer

Give the direct answer first. Put each rule or condition on its own numbered/bulleted line. Use the source's canonical wording for rules/definitions where meaningful, and correct technical vocabulary throughout. Accurate paraphrases are acceptable evidence of understanding; exact quotation is not the general grading standard.

## Deeper explanation

The answer should be a useful learning moment after an attempt, not a bare verdict. Explain the mechanism and causal reasoning, the conditions/limitations that matter, and the practical implication. For an invalid code example, identify the conflicting operations and why they overlap, and show a minimal repair when useful. For a distinction, explain when the learner would choose each option. Prefer one focused example or counterexample to repetitive prose.

Add a short vocabulary note when it helps the learner speak precisely, and a small self-check rubric distinguishing the essential idea from optional detail. Show code and expected output separately and accurately. List the source section/link; label supplementary material beyond that scope. Verify against the supplied source rather than trusting generated explanations.

## Field mapping

- `prompt`: focused question and any fenced example, without the solution.
- `answer`: direct core answer; lists/rules on separate lines.
- `explanation`: reasoning, relevant terminology, example/repair and self-check criteria as needed.
- `source`: book/document edition, section/page or URL and relevant lesson reference.
- `deck`: existing subject deck where appropriate; don't create redundant decks.

Depth should serve understanding. Don't force every trivial fact into a long template. Don't shorten a difficult explanation until its mechanism or important conditions disappear. A confident wrong answer and a hesitant correct answer need different follow-up, but neither an LLM nor a confidence number may silently choose the learner's FSRS rating.

## Relation to teaching prompts

Keep probing and attempt-first teaching intact. A lesson should ask and wait before explaining. If runtime personalization is later requested, scope it to post-attempt explanations or explicit card authoring through the app's supported prompt overrides; preserve upstream prompt segments and their enabled switches. Do not inject this whole guide into every agent or alter probing/tool contracts merely to increase answer length. The app currently has no automatic card-generation/persistence bridge from teaching sessions.
