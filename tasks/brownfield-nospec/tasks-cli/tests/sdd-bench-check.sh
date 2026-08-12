#!/usr/bin/env bash
# Скрытые тесты tasks-cli. В sandbox участника не попадают, в скор не входят.
#
# Проверяется только то, что не зависит от выбранных участником имён: намерение
# не называет ни флаг приоритета, ни слово для него, и угадывать их здесь
# нечестно. Зато оно требует, чтобы всё прежнее осталось прежним, — а это
# ровно то, на чём brownfield-правка ломается.
set -uo pipefail

passed=0
total=0
work="$(mktemp -d)"
repo="$PWD"
trap 'rm -rf "$work"' EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  total=$((total + 1))
  if [ "$expected" = "$actual" ]; then
    passed=$((passed + 1))
    echo "ok   — $name"
  else
    echo "FAIL — $name"
    echo "       ожидалось: $expected"
    echo "       получено:  $actual"
  fi
}

tasks() { (cd "$work" && "$repo/tasks" "$@"); }
fresh() { rm -f "$work/tasks.json"; }

if [ ! -x "$repo/tasks" ]; then
  echo "FAIL — ./tasks не существует или не исполняем"
  echo "passed 0 of 1"
  exit 1
fi

# --- прежние команды на месте -------------------------------------------------

fresh
tasks add первая >/dev/null 2>&1
tasks add вторая >/dev/null 2>&1
tasks add третья >/dev/null 2>&1

check "три задачи добавились" "3" "$(tasks list 2>/dev/null | wc -l | tr -d ' ')"
check "порядок при равных приоритетах — как в файле" \
  "первая вторая третья" \
  "$(tasks list 2>/dev/null | sed 's/^ *[0-9]*\. \[.\] //' | cut -d' ' -f1 | tr '\n' ' ' | sed 's/ $//')"

tasks done 2 >/dev/null 2>&1
check "done отмечает по номеру" "1" "$(tasks list --done 2>/dev/null | wc -l | tr -d ' ')"
check "номер после отбора — место в файле" "2" \
  "$(tasks list --done 2>/dev/null | sed 's/^ *\([0-9]*\)\..*/\1/')"
check "открытых осталось двое" "2" "$(tasks list --open 2>/dev/null | wc -l | tr -d ' ')"

# --- строка списка ------------------------------------------------------------

fresh
tasks add "купить хлеб" >/dev/null 2>&1
check "вид строки: номер, отметка, текст" "1. [ ] купить хлеб" "$(tasks list 2>/dev/null | sed 's/  *#.*$//')"

tasks done 1 >/dev/null 2>&1
check "выполненная отмечена крестиком" "1. [x] купить хлеб" "$(tasks list 2>/dev/null | sed 's/  *#.*$//')"

# --- теги ---------------------------------------------------------------------

fresh
tasks add первая --tag дом >/dev/null 2>&1
tasks add вторая --tag работа >/dev/null 2>&1
tasks add третья --tag дом >/dev/null 2>&1

check "отбор по тегу" "2" "$(tasks list --tag дом 2>/dev/null | wc -l | tr -d ' ')"
check "тег виден в строке" "1" "$(tasks list --tag работа 2>/dev/null | grep -c '#работа')"
check "tags считает задачи" "2" "$(tasks tags 2>/dev/null | grep '^дом' | tr -s ' ' | cut -d' ' -f2)"

# --- накопленный файл ---------------------------------------------------------

fresh
cat > "$work/tasks.json" <<'JSON'
{
  "tasks": [
    {"text": "старая без версии", "done": false},
    {"text": "старая выполненная", "done": true, "tags": ["дом"]}
  ]
}
JSON
check "файл без версии и без приоритетов читается" "2" "$(tasks list 2>/dev/null | wc -l | tr -d ' ')"
check "текст старой записи не потерян" "1" "$(tasks list 2>/dev/null | grep -c 'старая без версии')"
check "отметка выполнения старой записи не потеряна" "1" "$(tasks list --done 2>/dev/null | grep -c 'старая выполненная')"
check "тег старой записи не потерян" "1" "$(tasks list --tag дом 2>/dev/null | grep -c 'старая выполненная')"

tasks add новая >/dev/null 2>&1
check "после дописывания старые записи на месте" "3" "$(tasks list 2>/dev/null | wc -l | tr -d ' ')"

# --- коды возврата и потоки ---------------------------------------------------

fresh
tasks list >/dev/null 2>&1
check "пустой список — не ошибка" "0" "$?"
check "пустой список ничего не печатает" "" "$(tasks list 2>/dev/null)"

tasks нечто >/dev/null 2>&1
check "неизвестная команда — ненулевой код" "1" "$([ $? -ne 0 ] && echo 1 || echo 0)"
check "ошибка идёт в поток ошибок" "" "$(tasks нечто 2>/dev/null)"
check "ошибка что-то говорит" "1" "$([ -n "$(tasks нечто 2>&1 >/dev/null)" ] && echo 1 || echo 0)"

tasks done 99 >/dev/null 2>&1
check "несуществующий номер — ненулевой код" "1" "$([ $? -ne 0 ] && echo 1 || echo 0)"

tasks add >/dev/null 2>&1
check "add без текста — ненулевой код" "1" "$([ $? -ne 0 ] && echo 1 || echo 0)"

printf 'не json' > "$work/tasks.json"
tasks list >/dev/null 2>&1
check "испорченный файл — ненулевой код" "1" "$([ $? -ne 0 ] && echo 1 || echo 0)"

echo
echo "passed $passed of $total"
[ "$passed" -eq "$total" ]
