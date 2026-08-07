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
| BMad Method | Канонический процесс BMad: `bmad-spec` → `bmad-quick-dev` |

Определения участников — в `participants/<id>/`: `participant.json` (где лежит
спецификация, что ставить, какие хосты нужны), `setup.sh` и промт на каждый
этап (`prompt.md` для полного цикла, `prompt-spec.md` — только спецификация).

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
node dist/src/cli.js all --task ledger-cli --stage spec  # без реализации
node dist/src/cli.js judge --result <id>         # перезапускаемо отдельно
node dist/src/cli.js judge-probe --metric SR -n 3 \
  --material spec=<путь> --material intent.md=<путь>   # отладка судейства
node dist/src/cli.js score --result <id>
node dist/src/cli.js report --result <id>
node dist/src/cli.js show --participant bmad   # развернуть репозиторий запуска
node dist/src/cli.js verdicts --participant bmad  # обоснования судей
node dist/src/cli.js serve                     # просмотр в браузере
```

`serve` поднимает локальный http-сервер (по умолчанию `127.0.0.1:7777`, порт
меняется через `--port`). Главный экран результата — таблица всех его запусков
с метриками; из неё проваливание в запуск (оценки судей, файлы спецификации,
файлы реализации, весь diff) и сравнение двух запусков в две колонки.
Состояния сервер не держит: `results/` читается на каждый запрос, так что
идущий прогон видно перезагрузкой страницы.

`show` разворачивает результат запуска в каталог рядом с бандлом и печатает,
что написал участник — историю отделяет тег `sdd-bench-baseline`, поставленный
после установки инструментария. Запуск выбирается опциями `--task`,
`--participant`, `--stage`, `--repeat`; если под них подходит несколько, команда
их перечислит.

`judge-probe` вызывает судью в отдельном sandbox на материалах, названных в
командной строке, и ни на чём другом: `--material <имя>=<путь>` кладёт файл или
каталог в рабочий каталог судьи под этим именем, `--metric` выбирает рубрику,
`--rubric <path>` подменяет её своей, `-n` спрашивает одно и то же несколько раз
и печатает разброс оценок. Всё, что судья видел, и всё, что он ответил, ложится
в `judge-probes/<время>--<метрика>/` (`materials/`, `rubric.md`,
`attempt-N.json`, `probe.json`); каталог меняется через `--out`.
`--keep-sandbox` оставляет sandbox судьи живым, чтобы зайти в него руками.
Путь до судьи тот же, что в настоящем прогоне (`askJudge` в `src/judge/`).

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
