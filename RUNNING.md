# Запуск бенчмарка

Нужны Node.js 22+, Git и npm. Для реального прогона также нужны Docker Sandboxes CLI `sbx`, авторизация провайдера агента и доступ к выбранным моделям.

```sh
npm ci
npm run build
node dist/src/cli.js validate
```

Холостой прогон проверяет весь конвейер без Docker и вызовов API. Его оценки искусственные:

```sh
node dist/src/cli.js all --dry-run --task ledger-cli --participant neutral -n 1
```

Для `sbx` на macOS:

```sh
brew trust docker/tap && brew install docker/tap/sbx && sbx login
sbx policy init deny-all
```

Проверьте доступность исполнителя и судьи, затем начните с одной задачи и одного участника:

```sh
node dist/src/cli.js doctor
node dist/src/cli.js all --task ledger-cli --participant neutral -n 1
```

`all` выполняет запуск, судейство и отчёт. Результат сохраняется в `results/<id>/`.

По умолчанию используются Codex для исполнителя и судьи, модели и лимиты из `src/config.ts`, три повтора. Настройки можно переопределить в локальном `bench.json` или передать другой файл через `--config`. Поля конфигурации перечислены в `BenchConfig` в `src/config.ts`.

Участник `canon` требует локальную копию Canon по пути из `participants/canon/participant.json`. Остальные участники устанавливают инструментарий внутри sandbox. Наличие Canon не требуется для проверки каталога и прогонов других участников.

Просмотр и повторная обработка сохранённого результата:

```sh
node dist/src/cli.js serve
node dist/src/cli.js judge --result <id>
node dist/src/cli.js score --result <id>
node dist/src/cli.js report --result <id>
```

Полный список опций выводит `node dist/src/cli.js help`. Метод оценки и ограничения сравнения описаны в [METHODOLOGY.md](METHODOLOGY.md).
