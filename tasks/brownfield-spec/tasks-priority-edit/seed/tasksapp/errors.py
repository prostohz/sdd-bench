"""Ошибки, которые пользователь должен увидеть словами, а не трассировкой."""


class TaskError(Exception):
    """Что-то пошло не так по вине ввода или файла, а не программы.

    Такие ошибки печатаются одной строкой в поток ошибок и завершают работу
    ненулевым кодом. Всё остальное — падение с трассировкой, и это баг.
    """

    def __init__(self, message, hint=None):
        super().__init__(message)
        self.message = message
        self.hint = hint

    def render(self):
        if self.hint:
            return f"tasks: {self.message}\n       {self.hint}"
        return f"tasks: {self.message}"


class UsageError(TaskError):
    """Команду позвали неправильно: не та команда, не те аргументы."""


class StoreError(TaskError):
    """Файл задач не прочитать или не записать."""
