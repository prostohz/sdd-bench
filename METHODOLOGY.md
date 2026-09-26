# Methodology

## Task classes

The benchmark examines the path from an initial request through a specification to an implementation.

Published results cover the full workflow: each participant writes a specification and implements the task.

| Class | Starting point | Assignment |
| --- | --- | --- |
| Greenfield | No project or specification | Write a specification and implement a new feature from scratch |
| Brownfield without a specification | An existing codebase with no maintained formal specification | Write a specification and implement a new feature in the project |
| Brownfield with a current specification | An existing codebase and an up-to-date specification | Update the specification and implement a new feature in the project |

These are the initial task classes. The set can expand as the benchmark develops.

## Workflow stages

The full workflow is the default and the only stage used for published results. The `spec` stage isolates specification writing for diagnostic runs.

| Stage | Participant work | Metrics |
| --- | --- | --- |
| `full` | Write a specification and implement it | `spec-quality`, `spec-fit`, `impl-fit`, time, cost |
| `spec` | Write a specification only | `spec-quality`, `spec-fit`, time, cost |

For diagnostic `spec` runs, quality is the geometric mean of `spec-quality` and `spec-fit`; `impl-fit` is inapplicable. Checks that require code, including regression and held-out tests, do not run at the `spec` stage.

Every run in one result uses the same stage. Scores are comparable within a stage, not across different stages.

## Run protocol

Each task, participant, and repeat combination produces a separate run:

1. The starting project is committed to Git and placed in a fresh sandbox.
2. The participant's tools are installed. The agent receives the task request, writes a specification, and implements it.
3. The specification, final repository, and telemetry are saved. The participant's sandbox is removed.
4. The project's original tests, when present, and the held-out tests run separately from the participant.
5. A separate judge evaluates each applicable metric. Its decisions on individual items become a run score; scores are then aggregated by task, class, and participant.

For Brownfield with a current specification, every participant receives the same code seed and an equivalent existing specification in its native format. The specification is added after tool setup and included in the baseline commit before the agent begins.

Judging can be repeated from saved artifacts without rerunning the participant. Each result retains the configuration and versions used to produce it.

## Agent configuration

The participant and judge use the same provider, although their models may differ. Within one result, participants use the same model, model version, reasoning settings, and shared network policy. Each participant receives the original task request unchanged. There is no human intervention during a run.

The SDD workflow and its required tools differ between participants. In merged result `2026-09-24T22-57-32-852`, Greenfield and Brownfield without a specification had a 45-minute limit except for GSD Core and Canon, which had no limit. Both Canon runs finished within 45 minutes. Brownfield with a specification was transferred from result `2026-09-26T09-44-06-502` and had a 90-minute limit for every participant. The model, judge, effort, pricing, and stage matched across both result sets. The aggregate score includes classes with different time limits; the result retains the original run artifacts and merge provenance.

## Metrics

| Metric | Evaluation | Output |
| --- | --- | --- |
| Specification quality | An LLM judge reads only the specification and identifies defects across five criteria | Defects with severity and location |
| Specification fit to requirements | An LLM judge reads the task request, its itemized requirements, and the specification | A decision for each item and a list of unsupported additions |
| Implementation fit to specification | An LLM judge reads the specification and repository and may run checks | A decision for each specification requirement and the checks performed |
| Regression avoidance | The project's original test suite is run | Share of tests that still pass |
| Duration | External measurement around the participant agent invocation | Active execution time |
| Cost | Provider-reported cost or a token-based estimate using saved rates | USD per participant run |

Duration is measured externally, excluding host sleep, rather than taken from the participant's telemetry. It includes the participant agent and its delegated work, but excludes setup, tests, and judging. A provider-reported USD cost is used when available. Otherwise, cost is estimated from uncached input, cached input, cache writes, and output tokens using the participant model's rates saved with the result. Unreported tool charges and cache writes cannot be included, so the estimate is not a bill. The default GPT-5.6 Terra rates were recorded from the [OpenAI API pricing page](https://developers.openai.com/api/docs/models/gpt-5.6-terra) on 2026-09-25; other models require explicit `participantPricing` in `bench.json` if the provider does not report cost. Judge costs do not enter the participant score.

All participants are evaluated with the same judge model version, prompt, and settings. The judge is not told which participant produced the work.

The judge does not assign a numeric score. It chooses from a fixed set of decisions for each item: covered, partially covered, distorted, or missing. The harness computes the score from those decisions. A single holistic score tends to cluster around “good but not perfect” and distinguishes participants poorly. Item-level decisions make the score reproducible and allow disputes to focus on a specific decision.

The requirements for `spec-fit` are extracted from the task request in advance and stored in `requirements.md`. Every participant and repeat uses the same list. The participant does not receive it; otherwise each judge could evaluate a different set of requirements.

## Aggregate score

The three quality metrics are normalized to the range `0` to `1`:

- `spec-quality` — specification quality;
- `spec-fit` — specification fit to requirements;
- `impl-fit` — implementation fit to specification.

A run's quality score is the geometric mean of these three metrics. In the formula, `m_1`, `m_2`, and `m_3` correspond to the metrics listed above. `t` and `c` are the run's duration and cost; `t_min` and `c_min` are the lowest values among successful runs of the same task. `S` is the final run score.

```math
\begin{aligned}
Q &= 100\sqrt[3]{m_1m_2m_3} \\[0.6em]
T &= \frac{t_{\mathrm{min}}}{t} \\[0.6em]
C &= \frac{c_{\mathrm{min}}}{c} \\[0.6em]
S &= Q(0.93+0.05T+0.02C)
\end{aligned}
```

For example, scores of `8/10`, `6/10`, and `9/10` give `Q = 75.6`. If that run takes twice the fastest successful run of the same task and costs the same as the cheapest, its final score is `75.6 × (0.93 + 0.05 × 0.5 + 0.02 × 1) = 73.7`. The reference minima use all successful participants and repeats of that task within the result. A zero minimum gives a factor of `1` only to zero-valued runs and `0` to positive-valued runs.

A successful run has no aggregate score until all applicable judgments and every successful peer's time and cost are available. Missing data is not treated as zero. The published table shows each run's time and cost. Token-based costs are estimates, as described above.

A run scores `0` if it fails, times out, or regresses the original tests. Regression checks do not apply to greenfield tasks.

A task score is the mean of its runs. A class score is the mean of its tasks. The final score is the mean across classes, giving each class equal weight.

## Repeats

By default, each task and participant combination runs three times (`n = 3`). The repeat count can be changed in the configuration. Every repeat starts from the same initial state.

## Run isolation

Participants and LLM judges run in separate [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) through the `sbx` CLI. Each task, participant, and repeat combination gets a new sandbox with these restrictions:

- the repository is provided through `--clone`, and work happens in a private copy;
- shared skills are disabled with `--no-share-skills`;
- network access is denied by default, with only required APIs allowed;
- held-out tests, reference solutions, and results from other runs are not passed in;
- the result and telemetry are saved after completion, then the sandbox is removed.

Each judgment uses a fresh judge without previous run history. The judge receives only the materials needed for its metric:

| Metric | Available materials |
| --- | --- |
| Specification quality | Specification |
| Specification fit to requirements | Original task request, itemized requirements, and specification |
| Implementation fit to specification | Specification and a private copy of the final repository |

The specification is placed in a neutral `spec/` directory for judging. Participants store it in different locations, and the original path could reveal the author. This does not provide complete anonymity: for `impl-fit`, the participant's tooling may still be visible in the repository. That is a known limitation.

Held-out tests run separately after the participant finishes and are never placed in its sandbox. They do not enter the final score. They show what the implementation does; the judge assesses how well it follows the specification.

## Interpreting results

Compare final scores within one result: its participants ran the same tasks with the same agent and judge configuration. Directly comparing scores from different results can mix the effects of workflow, model, tasks, and settings.

The current task set covers only its included scenarios. A score describes behavior under those conditions, not the quality of every possible use of a tool. LLM judges can make mistakes; disputed scores should be checked against the item-level decisions and saved run artifacts.

Tasks, requirement checklists, and tests are public in this repository. They are withheld from the participant during a run, but publication cannot rule out prior exposure of the model to them. This is not a blind evaluation on unseen tasks.
