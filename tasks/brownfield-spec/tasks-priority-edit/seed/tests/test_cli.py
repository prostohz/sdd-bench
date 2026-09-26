import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TASKS = Path(__file__).resolve().parent.parent / "tasks"


class CliTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)

    def tasks(self, *args):
        return subprocess.run(
            [sys.executable, str(TASKS), *args],
            cwd=self.dir.name,
            capture_output=True,
            text=True,
        )

    def store(self):
        with open(Path(self.dir.name) / "tasks.json", encoding="utf-8") as handle:
            return json.load(handle)

    def write_store(self, payload):
        path = Path(self.dir.name) / "tasks.json"
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    def test_add_creates_the_file(self):
        result = self.tasks("add", "купить", "хлеб")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertEqual(self.store()["tasks"][0]["text"], "купить хлеб")

    def test_add_keeps_the_tag(self):
        self.tasks("add", "купить хлеб", "--tag", "дом")
        self.assertEqual(self.store()["tasks"][0]["tags"], ["дом"])

    def test_add_keeps_the_priority(self):
        result = self.tasks("add", "сдать отчёт", "--priority", "high")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.store()["tasks"][0]["priority"], "high")

    def test_add_without_priority_uses_normal(self):
        self.tasks("add", "обычная задача")
        self.assertEqual(self.store()["tasks"][0]["priority"], "normal")

    def test_add_with_invalid_priority_fails(self):
        result = self.tasks("add", "задача", "--priority", "urgent")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--priority", result.stderr)

    def test_add_without_text_fails(self):
        result = self.tasks("add")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("текст", result.stderr)

    def test_list_shows_number_mark_and_text(self):
        self.tasks("add", "первая")
        self.tasks("add", "вторая")
        self.tasks("done", "1")

        self.assertEqual(
            self.tasks("list").stdout,
            "1. [x] [normal] первая\n2. [ ] [normal] вторая\n",
        )

    def test_list_numbers_are_positions_not_output_order(self):
        self.tasks("add", "первая")
        self.tasks("add", "вторая")
        self.tasks("add", "третья")
        self.tasks("done", "2")

        self.assertEqual(
            self.tasks("list", "--open").stdout,
            "1. [ ] [normal] первая\n3. [ ] [normal] третья\n",
        )
        self.assertEqual(self.tasks("list", "--done").stdout, "2. [x] [normal] вторая\n")

    def test_list_filters_by_tag(self):
        self.tasks("add", "первая", "--tag", "дом")
        self.tasks("add", "вторая", "--tag", "работа")

        self.assertEqual(
            self.tasks("list", "--tag", "работа").stdout,
            "2. [ ] [normal] вторая  #работа\n",
        )

    def test_list_orders_tasks_by_priority_and_keeps_file_numbers(self):
        self.tasks("add", "обычная первая")
        self.tasks("add", "низкая", "--priority", "low")
        self.tasks("add", "высокая первая", "--priority", "high")
        self.tasks("add", "высокая вторая", "--priority", "high")
        self.tasks("add", "обычная вторая")

        self.assertEqual(
            self.tasks("list").stdout,
            "3. [ ] [high] высокая первая\n"
            "4. [ ] [high] высокая вторая\n"
            "1. [ ] [normal] обычная первая\n"
            "5. [ ] [normal] обычная вторая\n"
            "2. [ ] [low] низкая\n",
        )

    def test_list_filters_by_priority_with_other_filters(self):
        self.tasks("add", "сделать", "--tag", "работа", "--priority", "high")
        self.tasks("add", "готово", "--tag", "работа", "--priority", "high")
        self.tasks("done", "2")
        self.tasks("add", "дом", "--tag", "дом", "--priority", "high")

        self.assertEqual(
            self.tasks("list", "--open", "--tag", "работа", "--priority", "high").stdout,
            "1. [ ] [high] сделать  #работа\n",
        )

    def test_list_with_invalid_priority_fails(self):
        result = self.tasks("list", "--priority", "urgent")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--priority", result.stderr)

    def test_list_aligns_numbers_past_nine(self):
        for number in range(1, 11):
            self.tasks("add", f"задача {number}")

        lines = self.tasks("list").stdout.splitlines()
        self.assertEqual(lines[0], " 1. [ ] [normal] задача 1")
        self.assertEqual(lines[9], "10. [ ] [normal] задача 10")

    def test_empty_list_is_not_an_error(self):
        result = self.tasks("list")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")

    def test_conflicting_filters_fail(self):
        result = self.tasks("list", "--done", "--open")
        self.assertNotEqual(result.returncode, 0)

    def test_unknown_option_fails(self):
        result = self.tasks("list", "--вчера")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--вчера", result.stderr)

    def test_done_marks_by_position(self):
        self.tasks("add", "первая")
        self.tasks("add", "вторая")
        self.tasks("done", "2")

        self.assertEqual([t["done"] for t in self.store()["tasks"]], [False, True])

    def test_done_out_of_range_fails(self):
        self.tasks("add", "одна")
        result = self.tasks("done", "7")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("7", result.stderr)

    def test_done_with_words_fails(self):
        result = self.tasks("done", "первую")
        self.assertNotEqual(result.returncode, 0)

    def test_tags_counts_tasks(self):
        self.tasks("add", "первая", "--tag", "дом")
        self.tasks("add", "вторая", "--tag", "дом")
        self.tasks("add", "третья", "--tag", "работа")

        self.assertEqual(self.tasks("tags").stdout, "дом     2\nработа  1\n")

    def test_no_command_fails_with_usage(self):
        result = self.tasks()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("tasks add", result.stderr)

    def test_unknown_command_fails_on_stderr(self):
        result = self.tasks("нечто")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("нечто", result.stderr)

    def test_file_without_version_still_reads(self):
        self.write_store({"tasks": [{"text": "старая", "done": False}]})
        self.assertEqual(self.tasks("list").stdout, "1. [ ] [normal] старая\n")

    def test_broken_file_fails_with_a_word_about_it(self):
        (Path(self.dir.name) / "tasks.json").write_text("не json", encoding="utf-8")
        result = self.tasks("list")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("tasks.json", result.stderr)


if __name__ == "__main__":
    unittest.main()
