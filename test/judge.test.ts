import assert from 'node:assert/strict'
import test from 'node:test'

import { parseVerdict, verdictSchema } from '../src/judge/judge.js'
import { tally } from '../src/judge/tally.js'
import { parseRequirements, requirementProblems } from '../src/model/requirements.js'
import type { Finding } from '../src/model/run.js'

const REQUIREMENTS = parseRequirements(`
# Требования

- R1. Первое требование.
- R2. Второе требование.
- R3. Третье требование.
- R4. Четвёртое требование.
`)

function requirement(item: string, ruling: string): Finding {
  return { kind: 'requirement', item, statement: '', ruling, where: '', note: '' }
}

function defect(axis: string, severity: string): Finding {
  return { kind: 'defect', item: axis, statement: '', ruling: severity, where: '', note: '' }
}

function answer(rulings: string[], additions: { severity: string }[] = []): string {
  return JSON.stringify({
    requirements: rulings.map((ruling, index) => ({
      id: `R${index + 1}`,
      ruling,
      where: 'spec/spec.md:1',
      note: '',
    })),
    additions: additions.map((addition) => ({ what: 'лишнее', ...addition, where: '', note: '' })),
    rationale: 'потому что',
  })
}

test('требования разбираются в список и проверяются на повторы', () => {
  assert.deepEqual(REQUIREMENTS.map((r) => r.id), ['R1', 'R2', 'R3', 'R4'])
  assert.equal(REQUIREMENTS[0]?.text, 'Первое требование.')
  assert.deepEqual(requirementProblems(REQUIREMENTS), [])

  assert.equal(requirementProblems(parseRequirements('пусто')).length, 1)
  assert.equal(requirementProblems(parseRequirements('- R1. а\n- R1. б')).length, 1)
})

test('балл считает харнесс, а не судья: одни и те же решения дают одно число', () => {
  const all = ['covered', 'covered', 'covered', 'covered']
  assert.equal(tally('spec-fit', all.map((r, i) => requirement(`R${i + 1}`, r))), 10)

  // Шаг шкалы — одно требование из четырёх, а не «семь или восемь».
  const one = ['covered', 'covered', 'covered', 'missing']
  assert.equal(tally('spec-fit', one.map((r, i) => requirement(`R${i + 1}`, r))), 7.5)

  const half = ['covered', 'covered', 'covered', 'partial']
  assert.equal(tally('spec-fit', half.map((r, i) => requirement(`R${i + 1}`, r))), 8.75)
})

test('искажение стоит дороже неполноты', () => {
  const partial = tally('spec-fit', [requirement('R1', 'partial'), requirement('R2', 'covered')])
  const distorted = tally('spec-fit', [requirement('R1', 'distorted'), requirement('R2', 'covered')])
  assert.ok(distorted < partial, `${distorted} должно быть меньше ${partial}`)
})

test('приписки снимают баллы, но не топят результат', () => {
  const clean = [requirement('R1', 'covered'), requirement('R2', 'covered')]
  const addition = (ruling: string): Finding => ({
    kind: 'addition',
    item: 'лишнее',
    statement: '',
    ruling,
    where: '',
    note: '',
  })

  // Явно названное решение там, где намерение молчит, — это работа, а не порок.
  assert.equal(tally('spec-fit', [...clean, addition('minor')]), 10)
  assert.equal(tally('spec-fit', [...clean, addition('major')]), 9)
  // Сколько бы приписок ни нашлось, за них снимается не больше трёх баллов.
  const many = Array.from({ length: 20 }, () => addition('blocker'))
  assert.equal(tally('spec-fit', [...clean, ...many]), 7)
})

test('проверенное запуском весит больше прочитанного кода', () => {
  const verified = tally('impl-fit', [requirement('1', 'verified'), requirement('2', 'verified')])
  const present = tally('impl-fit', [requirement('1', 'present'), requirement('2', 'present')])
  assert.equal(verified, 10)
  assert.equal(present, 6)
})

test('качество спецификации — среднее по пяти признакам, а не общее впечатление', () => {
  assert.equal(tally('spec-quality', []), 10, 'признак без дефектов — это десять')

  // Один blocker роняет свой признак на 4 балла, то есть итог — на 0.8.
  assert.equal(tally('spec-quality', [defect('ambiguity', 'blocker')]), 9.2)
  // Дефекты одного признака складываются и ниже нуля его не уводят.
  const buried = Array.from({ length: 5 }, () => defect('structure', 'blocker'))
  assert.equal(tally('spec-quality', buried), 8)
  // Слабость размазана по всем признакам — это уже другая спецификация.
  const everywhere = ['completeness', 'ambiguity', 'verifiability', 'structure', 'proportion'].map((axis) =>
    defect(axis, 'blocker'),
  )
  assert.equal(tally('spec-quality', everywhere), 6)
})

test('пропущенное требование делает вердикт недействительным, а не низким', () => {
  assert.throws(
    () => parseVerdict(answer(['covered', 'covered', 'covered']), 'spec-fit', REQUIREMENTS),
    /не вынес решения по требованиям: R4/,
  )
})

test('решение вне словаря — ошибка, а не молчаливый ноль', () => {
  assert.throws(
    () => parseVerdict(answer(['covered', 'covered', 'covered', 'отлично']), 'spec-fit', REQUIREMENTS),
    /ожидалось одно из: covered, partial, distorted, missing/,
  )
})

test('вердикт по пунктам читается целиком', () => {
  const verdict = parseVerdict(
    answer(['covered', 'partial', 'missing', 'covered'], [{ severity: 'minor' }]),
    'spec-fit',
    REQUIREMENTS,
  )

  // (1 + 0.5 + 0 + 1) / 4 за требования; приписка степени minor не стоит ничего.
  assert.equal(verdict.score, 6.25)
  assert.equal(verdict.rationale, 'потому что')
  assert.equal(verdict.findings.length, 5)
  // Формулировку требования подставляет харнесс — судья её не переписывает.
  assert.equal(verdict.findings[0]?.statement, 'Первое требование.')
})

test('судья impl-fit сам называет требования, и пустой список не проходит', () => {
  const text = JSON.stringify({
    requirements: [{ statement: 'balance печатает итог', ruling: 'verified', where: './ledger balance', note: '' }],
    contradictions: [],
    checks: ['./ledger balance'],
    rationale: 'работает',
  })

  const verdict = parseVerdict(text, 'impl-fit')
  assert.equal(verdict.score, 10)
  assert.deepEqual(verdict.evidence, ['./ledger balance'])
  assert.equal(verdict.findings[0]?.statement, 'balance печатает итог')

  assert.throws(
    () => parseVerdict(JSON.stringify({ requirements: [], contradictions: [], checks: [] }), 'impl-fit'),
    /не назвал ни одного требования/,
  )
})

test('схема не оставляет судье места для собственной оценки', () => {
  for (const metric of ['spec-quality', 'spec-fit', 'impl-fit'] as const) {
    const schema = verdictSchema(metric, REQUIREMENTS.map((r) => r.id))
    assert.ok(!schema.includes('"score"'), `${metric}: в схеме не должно быть оценки`)
  }

  // Чек-лист входит в схему: судья не может ни пропустить пункт, ни выдумать.
  const schema = JSON.parse(verdictSchema('spec-fit', ['R1', 'R2'])) as {
    properties: { requirements: { minItems: number; maxItems: number; items: { properties: { id: { enum: string[] } } } } }
  }
  assert.equal(schema.properties.requirements.minItems, 2)
  assert.equal(schema.properties.requirements.maxItems, 2)
  assert.deepEqual(schema.properties.requirements.items.properties.id.enum, ['R1', 'R2'])
})
