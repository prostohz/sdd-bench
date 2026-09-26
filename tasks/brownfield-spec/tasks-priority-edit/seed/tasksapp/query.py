"""Что показывать и в каком порядке.

Отбор и порядок держатся отдельно от вывода: `list` решает, какие задачи
показать, `render` — как они выглядят. Номер задачи сюда приходит вместе с
ней и дальше не меняется, потому что он говорит о месте в файле.
"""


from .model import PRIORITIES


class Filter:
    """Условия отбора, собранные из опций командной строки."""

    __slots__ = ("done", "tag", "priority")

    def __init__(self, done=None, tag=None, priority=None):
        #: True — только выполненные, False — только открытые, None — все.
        self.done = done
        #: Тег, под которым должна стоять задача, либо None.
        self.tag = tag
        #: Приоритет, по которому отбирают задачи, либо None.
        self.priority = priority

    def __repr__(self):
        return f"Filter(done={self.done!r}, tag={self.tag!r}, priority={self.priority!r})"

    def matches(self, task):
        if self.done is not None and task.done != self.done:
            return False
        if self.tag is not None and not task.has_tag(self.tag):
            return False
        if self.priority is not None and task.priority != self.priority:
            return False
        return True

    def is_empty(self):
        return self.done is None and self.tag is None and self.priority is None


def numbered(tasks):
    """Задачи вместе с их номерами — местом в файле, начиная с единицы."""
    return list(enumerate(tasks, start=1))


def select(pairs, condition):
    """Пары «номер, задача», прошедшие отбор, в порядке файла."""
    return [(number, task) for number, task in pairs if condition.matches(task)]


def order(pairs):
    """Порядок вывода.

    Высокий приоритет идёт перед обычным, обычный — перед низким. Внутри одного
    приоритета сохраняется порядок файла. Сортировка живёт здесь, чтобы менять
    её в одном месте, а не в каждой команде.
    """
    return sorted(pairs, key=sort_key)


def sort_key(pair):
    """Высокий приоритет раньше, одинаковые — в порядке файла."""
    number, task = pair
    return (PRIORITIES.index(task.priority), number)


def describe(condition):
    """Условия отбора словами — для сообщений об ошибках."""
    if condition.is_empty():
        return "все задачи"

    parts = []
    if condition.done is True:
        parts.append("выполненные")
    if condition.done is False:
        parts.append("открытые")
    if condition.tag is not None:
        parts.append(f"с тегом #{condition.tag}")
    if condition.priority is not None:
        parts.append(f"с приоритетом {condition.priority}")
    return " ".join(parts)
