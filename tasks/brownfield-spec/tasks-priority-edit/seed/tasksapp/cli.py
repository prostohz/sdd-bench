"""Разбор командной строки и сами команды.

Аргументы разбираются вручную, а не argparse: сообщения об ошибках — часть
того, что видит пользователь, и они пишутся здесь, а не достаются из
библиотеки.
"""

import sys

from . import query, render, store
from .errors import TaskError, UsageError
from .model import clean_priority, clean_tag, clean_text, count_tags


def main(argv):
    """Точка входа. Возвращает код возврата, ничего не бросая наружу."""
    try:
        return _dispatch(argv)
    except TaskError as error:
        print(error.render(), file=sys.stderr)
        return 1


def _dispatch(argv):
    if not argv:
        print(render.usage(), file=sys.stderr)
        raise UsageError("нужна команда")

    name, args = argv[0], argv[1:]
    command = COMMANDS.get(name)
    if command is None:
        raise UsageError(f"неизвестная команда: {name}", hint="есть add, list, done, tags")
    return command(args)


def cmd_add(args):
    words, options = _split_options(args, {"--tag": "tag", "--priority": "priority"})
    text = clean_text(words)
    tags = [clean_tag(options["tag"])] if "tag" in options else []
    priority = clean_priority(options["priority"]) if "priority" in options else "normal"

    tasks = store.load()
    tasks.append(_new_task(text, tags, priority))
    store.save(tasks)
    return 0


def cmd_list(args):
    words, options = _split_options(
        args,
        {"--tag": "tag", "--priority": "priority"},
        flags={"--done": "done", "--open": "open"},
    )
    if words:
        raise UsageError(f"list: лишние аргументы: {' '.join(words)}")
    if "done" in options and "open" in options:
        raise UsageError("list: --done и --open вместе не имеют смысла")

    condition = query.Filter(
        done=True if "done" in options else False if "open" in options else None,
        tag=clean_tag(options["tag"]) if "tag" in options else None,
        priority=clean_priority(options["priority"]) if "priority" in options else None,
    )

    # Номер берётся до отбора: он говорит, где задача лежит, а не какая она
    # по счёту в этом конкретном выводе.
    chosen = query.order(query.select(query.numbered(store.load()), condition))

    for line in render.list_lines(chosen):
        print(line)
    return 0


def cmd_done(args):
    words, _ = _split_options(args, {})
    if len(words) != 1:
        raise UsageError("done: нужен номер задачи")

    tasks = store.load()
    _, task = store.resolve(tasks, words[0])
    task.done = True
    store.save(tasks)
    return 0


def cmd_tags(args):
    words, _ = _split_options(args, {})
    if words:
        raise UsageError(f"tags: лишние аргументы: {' '.join(words)}")

    for line in render.tag_lines(count_tags(store.load())):
        print(line)
    return 0


COMMANDS = {"add": cmd_add, "list": cmd_list, "done": cmd_done, "tags": cmd_tags}


def _new_task(text, tags, priority):
    from .model import Task

    return Task(text=text, done=False, tags=tags, priority=priority)


def _split_options(args, valued, flags=None):
    """Разделяет слова и опции.

    `valued` — опции со значением (`--tag дом`), `flags` — без него. Всё, что
    начинается с двух дефисов и не названо, — ошибка: молча проглоченная
    опечатка хуже отказа.
    """
    flags = flags or {}
    words = []
    options = {}

    index = 0
    while index < len(args):
        argument = args[index]
        if argument in valued:
            if index + 1 >= len(args):
                raise UsageError(f"{argument}: нужно значение")
            options[valued[argument]] = args[index + 1]
            index += 2
            continue
        if argument in flags:
            options[flags[argument]] = True
            index += 1
            continue
        if argument.startswith("--"):
            raise UsageError(f"неизвестная опция: {argument}")
        words.append(argument)
        index += 1

    return words, options
