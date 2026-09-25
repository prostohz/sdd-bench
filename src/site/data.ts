import { loadCatalog } from '../catalog.js'
import { loadConfig } from '../config.js'
import { METRICS, type ResultManifest, type RunRecord } from '../model/run.js'
import { readManifest, resolveResult } from '../results.js'
import { runCost, scoreRun } from '../score/score.js'

export function loadSiteManifest(root: string, result: string | undefined): ResultManifest | undefined {
  if (result === undefined) return undefined
  const source = readManifest(resolveResult(root, loadConfig(root), result))
  const activeParticipants = new Set(loadCatalog(root).participants.map((participant) => participant.id))
  const manifest = {
    ...source,
    runs: source.runs.filter((run) => activeParticipants.has(run.participantId)),
  }
  if (manifest.runs.length === 0) throw new Error('the result has no active participant runs')
  const pending = manifest.runs.filter((run) => scoreRun(run, manifest.runs, manifest.config.participantPricing).value === null)
  if (pending.length > 0) throw new Error(`the result lacks judgments or efficiency data: ${pending.length} runs`)
  return manifest
}

export function previewManifest(manifest: ResultManifest | undefined): ResultManifest | null {
  if (!manifest) return null
  const runs: RunRecord[] = manifest.runs.map((run) => {
    const verdicts: RunRecord['verdicts'] = {}
    for (const metric of METRICS) {
      const verdict = run.verdicts[metric]
      if (verdict) verdicts[metric] = {
        metric,
        score: verdict.score,
        rationale: '',
        findings: [],
        evidence: [],
        judgeModel: '',
      }
    }
    const price = runCost(run, manifest.config.participantPricing).value
    return {
      runId: run.runId,
      taskId: run.taskId,
      taskClass: run.taskClass,
      stage: run.stage,
      participantId: run.participantId,
      repeat: run.repeat,
      status: run.status,
      statusDetail: undefined,
      startedAt: '',
      finishedAt: '',
      telemetry: run.telemetry && {
        activeMs: run.telemetry.activeMs,
        durationMs: run.telemetry.durationMs,
        apiDurationMs: undefined,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: 0,
        costUsd: price ?? undefined,
        numTurns: undefined,
      },
      baseline: run.baseline && {
        command: '',
        exitCode: run.baseline.exitCode,
        passRatio: run.baseline.passRatio,
        output: '',
      },
      hidden: run.hidden && {
        command: '',
        exitCode: run.hidden.exitCode,
        passRatio: run.hidden.passRatio,
        output: '',
      },
      verdicts,
      versions: run.versions,
    }
  })
  return {
    resultId: manifest.resultId,
    createdAt: '',
    config: {
      provider: '',
      participantModel: '',
      participantEffort: '',
      judgeModel: '',
      judgeEffort: '',
      stage: manifest.config.stage,
      timeoutMs: 0,
      maxBudgetUsd: undefined,
      repeats: manifest.config.repeats,
    },
    versions: {},
    runs,
  }
}
