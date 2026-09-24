# Running the benchmark

You need Node.js 22+, Git, and npm. A real run also requires the Docker Sandboxes `sbx` CLI, provider authentication, and access to the selected models.

~~~sh
npm ci
npm run build
node dist/src/cli.js validate
~~~

A dry run checks the full pipeline without Docker or API calls. Its scores are synthetic:

~~~sh
node dist/src/cli.js all --dry-run --task ledger-cli --participant neutral -n 1
~~~

On macOS, install and initialize `sbx`:

~~~sh
brew trust docker/tap && brew install docker/tap/sbx && sbx login
sbx policy init deny-all
~~~

Check access to the participant and judge models, then start with one task and one participant:

~~~sh
node dist/src/cli.js doctor
node dist/src/cli.js all --task ledger-cli --participant neutral -n 1
~~~

`all` runs the participant, judges the output, and writes a report. Artifacts are saved in `results/<id>/`.

By default, both participant and judge use Codex; models, limits, and three repeats come from `src/config.ts`. Override them in a local `bench.json` or pass another file with `--config`. The `provider` setting applies to both participant and judge; their models can differ. The available fields are defined by `BenchConfig` in `src/config.ts`.

Inspect or process a saved result:

~~~sh
node dist/src/cli.js serve
node dist/src/cli.js judge --result <id>
node dist/src/cli.js score --result <id>
node dist/src/cli.js report --result <id>
~~~

Run `node dist/src/cli.js help` for all options. See [Methodology](METHODOLOGY.md) for the scoring rules and limits of comparison.
