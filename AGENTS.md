# Project instructions

`sdd-bench` compares specification-driven development workflows under the same tasks and agent settings. [METHODOLOGY.md](METHODOLOGY.md) defines the scoring rules. User-facing commands are in [RUNNING.md](RUNNING.md); result publication is in [PUBLISHING.md](PUBLISHING.md).

## Structure

- `tasks/<class>/<id>/`: task request, requirement checklist, seed project, and tests.
- `participants/<id>/`: participant descriptor, setup, and prompts for the full and specification-only stages.
- `src/run/` and `src/sandbox/`: agent execution in Docker Sandboxes and artifact capture.
- `src/judge/`, `judges/`, and `src/score/`: item-level judge decisions and score calculation.
- `src/web/`: local view of full results; `src/site/`: static public results site.
- `results/` and `judge-probes/`: local artifacts excluded from Git.

## Invariants

- Within a result, all participants receive the same task, model, settings, and limits. Only the workflow and its required tools differ.
- Every run starts from a separate Git seed and sandbox. Requirement checklists, tests, and other runs' results are withheld from the participant, although their source files are public.
- Each judge receives only the materials for its metric and makes item-level decisions. `src/judge/tally.ts` and `src/score/` compute numeric scores.
- The public site contains summaries. Logs, judge responses, and run repositories remain in `results/`.
- Do not add comments to code.

## Static site changes

- After changing the methodology or site presentation, regenerate `public/` locally with `npm run site -- --result <id>` using the result currently published, then inspect the generated page. This is sufficient verification for routine content and styling changes.
- Do not push changes or trigger a GitHub Pages deployment just to verify an edit. Publish only when the user explicitly asks; follow [PUBLISHING.md](PUBLISHING.md) then.

## Checks

~~~sh
npm ci
npm test
npm run validate
node dist/src/cli.js all --dry-run --task ledger-cli --participant neutral -n 1
~~~

Real runs require Docker Sandboxes `sbx` and access to the selected model.
