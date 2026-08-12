"""Задача и её поля.

Всё, что попадает в файл, проходит через эти функции, и всё, что читается из
файла, — тоже. Отсюда правило, на которое опирается остальной код: запись,
собранная из чужого файла, дальше выглядит так же, как только что созданная,
и недостающие поля добираются значениями по умолчанию, а не проверками на
каждом шаге.
"""

from .errors import TaskError, UsageError

MAX_TEXT = 200
MAX_TAG = 24


class Task:
    """Одна строка списка дел."""

    __slots__ = ("text", "done", "tags")

    def __init__(self, text, done=False, tags=None):
        self.text = text
        self.done = done
        self.tags = list(tags) if tags else []

    def __repr__(self):
        return f"Task(text={self.text!r}, done={self.done!r}, tags={self.tags!r})"

    def __eq__(self, other):
        if not isinstance(other, Task):
            return NotImplemented
        return (self.text, self.done, self.tags) == (other.text, other.done, other.tags)

    def has_tag(self, tag):
        return tag in self.tags

    def to_raw(self):
        """Как задача ложится в файл. Порядок ключей — часть формата."""
        return {"text": self.text, "done": self.done, "tags": list(self.tags)}

    @classmethod
    def from_raw(cls, raw, position):
        """Как задача читается из файла.

        Позиция нужна только для внятной жалобы: пользователь видит номер, под
        которым запись стоит в списке, а не индекс в массиве.
        """
        if not isinstance(raw, dict):
            raise TaskError(f"запись {position}: ожидался объект, а не {type(raw).__name__}")

        text = raw.get("text")
        if not isinstance(text, str) or not text.strip():
            raise TaskError(f"запись {position}: пустой или отсутствующий текст")

        done = raw.get("done", False)
        if not isinstance(done, bool):
            raise TaskError(f"запись {position}: поле done должно быть true или false")

        # Поля, появившиеся позже текста и признака выполненности, могут
        # отсутствовать в старом файле: это не ошибка, а значение по умолчанию.
        tags = raw.get("tags", [])
        if not isinstance(tags, list) or any(not isinstance(tag, str) for tag in tags):
            raise TaskError(f"запись {position}: теги должны быть списком строк")

        return cls(text=text, done=done, tags=[tag for tag in tags if tag])


def clean_text(words):
    """Текст задачи из слов командной строки."""
    text = " ".join(word for word in words if word).strip()
    if not text:
        raise UsageError("add: нужен текст задачи")
    if len(text) > MAX_TEXT:
        raise UsageError(f"add: текст длиннее {MAX_TEXT} символов")
    return text


def clean_tag(value):
    """Тег — одно слово без пробелов, чтобы его можно было назвать в фильтре."""
    tag = value.strip()
    if not tag:
        raise UsageError("--tag: пустой тег")
    if len(tag) > MAX_TAG:
        raise UsageError(f"--tag: тег длиннее {MAX_TAG} символов")
    if any(character.isspace() for character in tag):
        raise UsageError(f"--tag: тег должен быть одним словом, а не {tag!r}")
    return tag


def count_tags(tasks):
    """Сколько задач под каждым тегом: теги по алфавиту, счётчик рядом."""
    counts = {}
    for task in tasks:
        for tag in task.tags:
            counts[tag] = counts.get(tag, 0) + 1
    return sorted(counts.items())
