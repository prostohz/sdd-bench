# Running the benchmark

You need Node.js 22.12+, Git, and npm. A real run also requires the Docker Sandboxes `sbx` CLI, provider authentication, and access to the selected models.

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

Participant runs have no time limit by default. Set `timeoutMs` in `bench.json` to a positive number of milliseconds to impose one; `0` disables it. Judge runs retain their separate `judgeTimeoutMs` limit.

The score uses the participant's active execution time and USD cost. Codex CLI does not report USD cost, so the default GPT-5.6 Terra run uses token-based API rates saved in the result. For another Codex model, set `participantPricing` in `bench.json` to its input, cached input, cache write, and output USD rates per million tokens. Without cost data, a successful task has no final score.

~~~json
{
  "participantModel": "your-model",
  "participantPricing": {
    "inputUsdPerMillion": 2,
    "cachedInputUsdPerMillion": 0.2,
    "cacheWriteUsdPerMillion": 2.5,
    "outputUsdPerMillion": 12
  }
}
~~~

Replace the sample rates with the selected model's published rates. Estimated cost excludes any charges the CLI does not expose.

Inspect or process a saved result:

~~~sh
node dist/src/cli.js judge --result <id>
node dist/src/cli.js score --result <id>
node dist/src/cli.js report --result <id>
~~~

Run `node dist/src/cli.js help` for all options. See [Methodology](METHODOLOGY.md) for the scoring rules and limits of comparison.
