import json
import subprocess
import sys
import tempfile
from pathlib import Path


def main():
    executable = Path.cwd() / "tasks"
    results = []

    def check(name, condition):
        results.append((name, bool(condition)))
        print(("ok   " if condition else "FAIL ") + name)

    with tempfile.TemporaryDirectory() as directory:
        work = Path(directory)
        data = work / "tasks.json"

        def run(*args):
            return subprocess.run(
                [sys.executable, str(executable), *args],
                cwd=work,
                capture_output=True,
                text=True,
            )

        run("add", "первая", "--priority", "low")
        run("add", "вторая", "--tag", "дом", "--priority", "high")
        run("add", "третья")
        before = json.loads(data.read_text())
        changed = run("priority", "1", "high")
        after = json.loads(data.read_text())
        check("команда успешно меняет приоритет", changed.returncode == 0 and after["tasks"][0]["priority"] == "high")
        check("остальные поля и записи сохранены", all(
            after["tasks"][index] == ({**task, "priority": "high"} if index == 0 else task)
            for index, task in enumerate(before["tasks"])
        ))
        listed = run("list").stdout.splitlines()
        check("равные приоритеты сохраняют порядок файла", len(listed) == 3 and "первая" in listed[0] and "вторая" in listed[1])
        check("номер остаётся позицией в файле", len(listed) == 3 and listed[0].lstrip().startswith("1.") and listed[1].lstrip().startswith("2."))

        lowered = run("priority", "2", "low")
        filtered = run("list", "--priority", "low").stdout
        check("новый приоритет влияет на фильтр", lowered.returncode == 0 and "вторая" in filtered and "первая" not in filtered)
        check("смена приоритета не ломает теги", "вторая" in run("list", "--tag", "дом").stdout)
        run("done", "2")
        changed_done = run("priority", "2", "normal")
        record = json.loads(data.read_text())["tasks"][1]
        check("выполненную задачу можно переоценить", changed_done.returncode == 0 and record["done"] is True and record["tags"] == ["дом"])
        check("done по постоянному номеру работает", "вторая" in run("list", "--done").stdout)

        legacy = {"tasks": [{"text": "старая", "done": True, "tags": ["дом"]}, {"text": "другая"}]}
        data.write_text(json.dumps(legacy, ensure_ascii=False))
        migrated = run("priority", "1", "low")
        payload = json.loads(data.read_text())
        check("старая запись меняет приоритет", migrated.returncode == 0 and payload["tasks"][0]["priority"] == "low")
        check("соседняя старая запись сохранена", payload["tasks"][1]["text"] == "другая" and payload["tasks"][1].get("priority", "normal") == "normal")
        check("тег и выполнение старой записи сохранены", payload["tasks"][0]["done"] is True and payload["tasks"][0]["tags"] == ["дом"])

        for label, args in (
            ("нулевой номер", ("priority", "0", "high")),
            ("несуществующий номер", ("priority", "99", "high")),
            ("нечисловой номер", ("priority", "номер", "high")),
            ("неизвестный приоритет", ("priority", "1", "urgent")),
            ("нет приоритета", ("priority", "1")),
            ("нет номера", ("priority",)),
        ):
            snapshot = data.read_bytes()
            result = run(*args)
            check(label + " — ошибка без изменения файла", result.returncode != 0 and bool(result.stderr.strip()) and not result.stdout and data.read_bytes() == snapshot)

    passed = sum(ok for _, ok in results)
    print(f"passed {passed} of {len(results)}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
