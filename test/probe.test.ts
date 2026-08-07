import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseMaterial, spreadOf } from '../src/judge/probe.js'

const dir = mkdtempSync(join(tmpdir(), 'sdd-bench-probe-test-'))
const file = join(dir, 'intent.md')
writeFileSync(file, 'intent')

test('материал без имени берёт его у источника', () => {
  assert.deepEqual(parseMaterial(file), { name: 'intent.md', source: file })
})

test('имя материала отделяется от пути первым знаком равенства', () => {
  assert.deepEqual(parseMaterial(`spec/intent.md=${file}`), { name: 'spec/intent.md', source: file })
})

test('материал не может выйти за пределы того, что видит судья', () => {
  assert.throws(() => parseMaterial(`../escape=${file}`), /внутри материалов/)
  assert.throws(() => parseMaterial(`/etc/passwd=${file}`), /внутри материалов/)
})

test('несуществующий источник — ошибка сразу, а не пустой материал', () => {
  assert.throws(() => parseMaterial(`spec=${join(dir, 'нет')}`), /не найдено/)
})

test('разброс считается по тем попыткам, что дали оценку', () => {
  assert.deepEqual(spreadOf([6, undefined, 9]), { count: 2, min: 6, max: 9, mean: 7.5, spread: 3 })
})

test('без единой оценки разброса нет', () => {
  assert.equal(spreadOf([undefined]), undefined)
})
