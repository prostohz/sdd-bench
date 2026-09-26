"""Вид вывода.

Строка списка собирается здесь и больше нигде: номер, отметка выполнения,
приоритет, текст и теги в конце. Ширина номера выравнивается по самому
длинному, чтобы столбец не рвался на десятой задаче.
"""


def list_lines(numbered):
    """Строки списка для пар «номер, задача»."""
    if not numbered:
        return []

    width = max(len(str(number)) for number, _ in numbered)
    return [_line(number, task, width) for number, task in numbered]


def _line(number, task, width):
    mark = "x" if task.done else " "
    line = f"{str(number).rjust(width)}. [{mark}] [{task.priority}] {task.text}"
    if task.tags:
        line += f"  {format_tags(task.tags)}"
    return line


def format_tags(tags):
    """Теги в строке задачи: через запятую, в том порядке, в каком записаны."""
    return " ".join(f"#{tag}" for tag in tags)


def tag_lines(counts):
    """Таблица тегов: тег слева, число задач справа, столбец выровнен."""
    if not counts:
        return []

    width = max(len(tag) for tag, _ in counts)
    return [f"{tag.ljust(width)}  {count}" for tag, count in counts]


def usage():
    return "\n".join(
        [
            "tasks — список дел в файле tasks.json",
            "",
            "  tasks add <текст> [--tag <тег>] [--priority <high|normal|low>]",
            "                                       добавить задачу",
            "  tasks list [--done|--open] [--tag <тег>] [--priority <high|normal|low>]",
            "                                       показать задачи",
            "  tasks done <номер>                   отметить выполненной",
            "  tasks tags                           теги и сколько под ними задач",
        ]
    )
