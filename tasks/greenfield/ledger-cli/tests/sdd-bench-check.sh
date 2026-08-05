#!/usr/bin/env bash
# Hidden tests for ledger-cli: they check only the contract the intent states,
# and never reach the participant's sandbox. Reported, not scored.
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

ledger() { (cd "$work" && "$repo/ledger" "$@"); }

if [ ! -x "$repo/ledger" ]; then
  echo "FAIL — ./ledger не существует или не исполняем"
  echo "passed 0 of 1"
  exit 1
fi

check "первый баланс — ноль" "0.00" "$(ledger balance 2>&1)"

ledger add -1250 еда "обед в столовой" >/dev/null 2>&1
ledger add 3000.50 зарплата >/dev/null 2>&1
ledger add -99.99 еда >/dev/null 2>&1

check "баланс после трёх операций" "1650.51" "$(ledger balance 2>&1)"
check "баланс по категории" "-1349.99" "$(ledger balance --category еда 2>&1)"
check "список — три строки" "3" "$(ledger list 2>/dev/null | wc -l | tr -d ' ')"
check "список — первая строка" "1  -1250.00  еда  обед в столовой" "$(ledger list 2>/dev/null | head -1)"
check "список — пустое описание" "3  -99.99  еда" "$(ledger list 2>/dev/null | sed -n 3p | sed 's/ *$//')"
check "список по категории — две строки" "2" "$(ledger list --category еда 2>/dev/null | wc -l | tr -d ' ')"

fails() {
  local name="$1"
  shift
  ledger "$@" >/dev/null 2>&1
  local status=$?
  check "$name" "ненулевой" "$([ "$status" -eq 0 ] && echo ноль || echo ненулевой)"
}

fails "неизвестная команда" unknown-command
fails "неразборчивая сумма" add не-число еда
fails "недостающие аргументы" add

echo "не json" >"$work/ledger.json"
fails "испорченный файл данных" list

echo
echo "passed $passed of $total"
[ "$passed" -eq "$total" ]
