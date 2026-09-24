# Methodology

## Task classes

The benchmark examines the path from an initial request through a specification to an implementation.

| Class | Starting point | Assignment |
| --- | --- | --- |
| Greenfield | No project or specification | Write a specification and implement a new feature from scratch |
| Brownfield without a specification | An existing codebase with no maintained formal specification | Write a specification and implement a new feature in the project |
| Brownfield with a current specification | An existing codebase and an up-to-date specification | Update the specification and implement a new feature in the project |

These are the initial task classes. The set can expand as the benchmark develops.

## Workflow stages

The benchmark can evaluate the full workflow or isolate the specification stage.

| Stage | Participant work | Metrics |
| --- | --- | --- |
| `full` | Write a specification and implement it | `spec-quality`, `spec-fit`, `impl-fit` |
| `spec` | Write a specification only | `spec-quality`, `spec-fit` |

An inapplicable metric is omitted rather than scored as zero. The run score is the geometric mean of the metrics produced by its stage. Checks that require code, including regression and held-out tests, do not run at the `spec` stage.

Every run in one result uses the same stage. Scores are comparable within a stage, not across different stages.

## Agent configuration

The participant and judge use the same provider, although their models may differ. Within one result, all participants use the same model and model version, reasoning settings, time and token limits, available tools, and network restrictions. Each participant receives the original task request unchanged. There is no human intervention during a run.

Only the SDD workflow and the tooling it requires differ between participants. The result records the model and tool versions and the run settings.

## Run protocol

Each task, participant, and repeat combination produces a separate run:

1. The starting project is committed to Git and placed in a fresh sandbox.
2. The participant's tools are installed. The agent receives the task request and writes a specification, or a specification and code, according to the selected stage.
3. The specification, final repository, and telemetry are saved. The participant's sandbox is removed.
4. At the `full` stage, the project's original tests, when present, and the held-out tests run separately from the participant.
5. A separate judge evaluates each applicable metric. Its decisions on individual items become a run score; scores are then aggregated by task, class, and participant.

Judging can be repeated from saved artifacts without rerunning the participant. Each result retains the configuration and versions used to produce it.

## Metrics

| Metric | Evaluation | Output |
| --- | --- | --- |
| Specification quality | An LLM judge reads only the specification and identifies defects across five criteria | Defects with severity and location |
| Specification fit to requirements | An LLM judge reads the task request, its itemized requirements, and the specification | A decision for each item and a list of unsupported additions |
| Implementation fit to specification | An LLM judge reads the specification and repository and may run checks | A decision for each specification requirement and the checks performed |
| Regression avoidance | The project's original test suite is run | Share of tests that still pass |
| Efficiency | Run telemetry and an external wall-clock measurement | Elapsed time and token use |

Elapsed time is measured externally rather than taken from the participant's telemetry. A process that delegates work to subagents may report only the lead session's time, substantially understating total duration. Token use and cost come from telemetry.

All participants are evaluated with the same judge model version, prompt, and settings. The judge is not told which participant produced the work.

The judge does not assign a numeric score. It chooses from a fixed set of decisions for each item: covered, partially covered, distorted, or missing. The harness computes the score from those decisions. A single holistic score tends to cluster around “good but not perfect” and distinguishes participants poorly. Item-level decisions make the score reproducible and allow disputes to focus on a specific decision.

The requirements for `spec-fit` are extracted from the task request in advance and stored in `requirements.md`. Every participant and repeat uses the same list. The participant does not receive it; otherwise each judge could evaluate a different set of requirements.

## Aggregate score

The substantive metric scores are normalized to the range `0` to `1`:

- `spec-quality` — specification quality;
- `spec-fit` — specification fit to requirements;
- `impl-fit` — implementation fit to specification.

A run score is the geometric mean of its stage metrics. Here `m_i` is a metric normalized to `0–1`, and `n` is the number of applicable metrics: three for `full` and two for `spec`.

```math
\begin{aligned}
\mathrm{Score}_{\mathrm{run}} &= 100\sqrt[n]{\prod_{i=1}^{n}m_i} \\
\mathrm{Score}_{\mathrm{full}} &= 100\sqrt[3]{\text{spec-quality}\cdot\text{spec-fit}\cdot\text{impl-fit}} \\
\mathrm{Score}_{\mathrm{spec}} &= 100\sqrt{\text{spec-quality}\cdot\text{spec-fit}}
\end{aligned}
```

For example, scores of `8/10`, `6/10`, and `9/10` at the `full` stage yield `100 × ∛(0.8 × 0.6 × 0.9) = 75.6`. A successful run has no aggregate score until all applicable judgments are available.

A run scores `0` if it fails, times out, or regresses the original tests. Regression checks do not apply to greenfield tasks.

A task score is the mean of its runs. A class score is the mean of its tasks. The final score is the mean across classes, giving each class equal weight. Efficiency is reported separately and does not affect the final score.

## Repeats

By default, each task and participant combination runs three times (`n = 3`). The repeat count can be changed in the configuration. Every repeat starts from the same initial state.

## Interpreting results

Compare final scores within one result: its participants ran the same tasks at the same stage with the same agent and judge configuration. Directly comparing scores from different results can mix the effects of workflow, model, tasks, and settings.

The current task set covers only its included scenarios. A score describes behavior under those conditions, not the quality of every possible use of a tool. LLM judges can make mistakes; disputed scores should be checked against the item-level decisions and saved run artifacts.

Tasks, requirement checklists, and tests are public in this repository. They are withheld from the participant during a run, but publication cannot rule out prior exposure of the model to them. This is not a blind evaluation on unseen tasks.

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
