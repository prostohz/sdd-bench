"""Чтение и запись `tasks.json`.

Файл лежит в текущем рабочем каталоге и создаётся при первой записи. У него
есть номер версии, и читаются все версии, которые когда-либо писались: файл
заведён однажды и живёт дольше любой отдельной правки программы.
"""

import json
import os
import tempfile

from .errors import StoreError, TaskError
from .model import Task

STORE_NAME = "tasks.json"

#: Версия формата, в которой пишет эта сборка.
FORMAT_VERSION = 1


def store_path(directory=None):
    return os.path.join(directory or os.getcwd(), STORE_NAME)


def load(directory=None):
    """Задачи из файла. Нет файла — пустой список, а не ошибка."""
    path = store_path(directory)
    if not os.path.exists(path):
        return []

    try:
        with open(path, encoding="utf-8") as handle:
            raw = json.load(handle)
    except OSError as error:
        raise StoreError(f"не читается {STORE_NAME}: {error.strerror or error}") from error
    except ValueError as error:
        raise StoreError(
            f"{STORE_NAME} испорчен: это не JSON",
            hint=f"строка {getattr(error, 'lineno', '?')}",
        ) from error

    return _decode(raw)


def save(tasks, directory=None):
    """Запись целиком и разом.

    Пишется временный файл рядом и переименовывается на место: прерванная
    запись не оставляет от списка дел половину.
    """
    path = store_path(directory)
    payload = {
        "version": FORMAT_VERSION,
        "tasks": [task.to_raw() for task in tasks],
    }

    directory = os.path.dirname(path) or "."
    handle = None
    try:
        descriptor, temporary = tempfile.mkstemp(dir=directory, prefix=".tasks-", suffix=".json")
        handle = os.fdopen(descriptor, "w", encoding="utf-8")
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        handle.close()
        handle = None
        os.replace(temporary, path)
    except OSError as error:
        if handle is not None:
            handle.close()
        raise StoreError(f"не записывается {STORE_NAME}: {error.strerror or error}") from error


def _decode(raw):
    if not isinstance(raw, dict):
        raise StoreError(f"{STORE_NAME} испорчен: ожидался объект на верхнем уровне")

    version = raw.get("version", 1)
    if not isinstance(version, int) or version < 1:
        raise StoreError(f"{STORE_NAME} испорчен: непонятная версия формата {version!r}")
    if version > FORMAT_VERSION:
        raise StoreError(
            f"{STORE_NAME} записан версией формата {version}, а эта сборка знает {FORMAT_VERSION}",
            hint="обновите tasks",
        )

    items = raw.get("tasks")
    if not isinstance(items, list):
        raise StoreError(f"{STORE_NAME} испорчен: нет списка задач")

    tasks = []
    for position, item in enumerate(items, start=1):
        try:
            tasks.append(Task.from_raw(item, position))
        except TaskError as error:
            raise StoreError(f"{STORE_NAME} испорчен: {error.message}") from error
    return tasks


def resolve(tasks, number_text):
    """Номер из командной строки → задача.

    Номер — место задачи в файле, начиная с единицы. Фильтры вывода его не
    меняют: иначе `list --open` и `done` говорили бы на разных языках.
    """
    try:
        number = int(number_text)
    except (TypeError, ValueError):
        raise StoreError(f"не номер задачи: {number_text}") from None

    if number < 1 or number > len(tasks):
        raise StoreError(f"нет задачи с номером {number}")
    return number, tasks[number - 1]
