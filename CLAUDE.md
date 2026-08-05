# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Проект

`sdd-bench` — реализация бенчмарка для инструментов SDD (Spec-Driven Development):
набор задач, прогон инструментов на них и сравнение результатов по метрикам качества.

Методология и классы задач описаны в [`METHODOLOGY.md`](./METHODOLOGY.md).

## Участники бенчмарка

| Участник | Описание |
| --- | --- |
| Neutral SDD | Нейтральный процесс spec → plan → code, без конкретного фреймворка |
| OpenSpec | Канонический workflow OpenSpec |
| Spec Kit | Канонический workflow Spec Kit |
| Canon | Полуформальный язык требований (`~/workspace/canon`) |

Определения участников — в `participants/<id>/`: `participant.json` (где лежит
спецификация, что ставить, какие хосты нужны), `setup.sh` и `prompt.md`.

## Предусловия

Прогон требует CLI Docker Sandboxes:

```sh
brew trust docker/tap && brew install docker/tap/sbx && sbx login
sbx policy init deny-all      # в headless-окружении, до первого запуска
```

Участник `canon` собирается из локальной копии `~/workspace/canon`: пакеты
`@canon/*` не опубликованы, поэтому каталог монтируется в sandbox только для
чтения и собирается внутри него.

## Команды

```sh
npm run build                  # tsc
npm test                       # tsc + node --test dist/test/*.test.js
npm run validate               # проверить каталог задач и участников
```

Бенчмарк (`dist/src/cli.js`, он же `sdd-bench`):

```sh
node dist/src/cli.js all --dry-run               # весь конвейер на заглушках
node dist/src/cli.js run --task ledger-cli --participant neutral -n 1
node dist/src/cli.js judge --result <id>         # перезапускаемо отдельно
node dist/src/cli.js score --result <id>
node dist/src/cli.js report --result <id>
```

`--dry-run` подменяет слой sandbox заглушкой: конвейер, скоринг и отчёт
отлаживаются без обращений к API. Настройки — `bench.json` в корне
(модель, effort, модель судьи, лимиты, повторы); без него берутся значения из
`src/config.ts`.

## Архитектура

```
src/model/       Task, Participant, RunRecord, Verdict + валидация дескрипторов
src/catalog.ts   загрузка tasks/ и participants/, все проблемы разом
src/sandbox/     драйвер sbx, холостой драйвер, материализация seed, извлечение
src/run/         запуск участника, вызов claude, телеметрия, тесты проекта
src/judge/       судья по метрике в отдельном sandbox, рубрики в judges/
src/score/       Q,SR,IS → Score_run, агрегация запуск→задача→класс→итог
src/report/      markdown-отчёт
tasks/<class>/<id>/   task.json, intent.md, seed/, tests/
results/<id>/    manifest.json, runs/<задача>--<участник>--<повтор>/
```

Один прогон: seed → git-репозиторий с фиксированным коммитом → sandbox
(`--clone`, `--no-share-skills`) → setup участника → `claude -p` → извлечение
`repo.bundle` и `spec/` → удаление sandbox → базовые и скрытые тесты в
отдельном sandbox → три судьи → скор.

Зависимостей во время работы нет: только Node, `git` и `sbx`.
