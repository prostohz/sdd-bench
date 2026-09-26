import json
import tempfile
import unittest
from pathlib import Path

from tasksapp import store
from tasksapp.errors import StoreError
from tasksapp.model import Task


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.path = Path(self.dir.name) / "tasks.json"

    def write(self, payload):
        self.path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    def test_missing_file_is_an_empty_list(self):
        self.assertEqual(store.load(self.dir.name), [])

    def test_round_trip(self):
        tasks = [Task("первая", tags=["дом"]), Task("вторая", done=True)]
        store.save(tasks, self.dir.name)
        self.assertEqual(store.load(self.dir.name), tasks)

    def test_save_writes_the_current_version(self):
        store.save([Task("одна")], self.dir.name)
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8"))["version"], store.FORMAT_VERSION)

    def test_file_without_version_is_read_as_the_first(self):
        self.write({"tasks": [{"text": "старая", "done": True}]})
        self.assertEqual(store.load(self.dir.name), [Task("старая", done=True)])

    def test_missing_tags_default_to_empty(self):
        self.write({"version": 1, "tasks": [{"text": "старая", "done": False}]})
        self.assertEqual(store.load(self.dir.name)[0].tags, [])

    def test_version_one_task_without_priority_defaults_to_normal(self):
        self.write({"version": 1, "tasks": [{"text": "старая", "done": False}]})
        self.assertEqual(store.load(self.dir.name)[0].priority, "normal")

    def test_save_upgrades_old_task_with_normal_priority(self):
        self.write({"version": 1, "tasks": [{"text": "старая", "done": False}]})
        store.save(store.load(self.dir.name), self.dir.name)
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        self.assertEqual(payload["version"], 2)
        self.assertEqual(payload["tasks"][0]["priority"], "normal")

    def test_invalid_priority_is_refused(self):
        self.write({"version": 2, "tasks": [{"text": "задача", "priority": "urgent"}]})
        with self.assertRaises(StoreError):
            store.load(self.dir.name)

    def test_future_version_is_refused(self):
        self.write({"version": 99, "tasks": []})
        with self.assertRaises(StoreError):
            store.load(self.dir.name)

    def test_not_an_object_is_refused(self):
        self.write([{"text": "одна"}])
        with self.assertRaises(StoreError):
            store.load(self.dir.name)

    def test_entry_without_text_is_refused(self):
        self.write({"version": 1, "tasks": [{"done": False}]})
        with self.assertRaises(StoreError):
            store.load(self.dir.name)

    def test_save_leaves_no_temporary_files(self):
        store.save([Task("одна")], self.dir.name)
        self.assertEqual([p.name for p in Path(self.dir.name).iterdir()], ["tasks.json"])

    def test_resolve_takes_a_position(self):
        tasks = [Task("первая"), Task("вторая")]
        number, task = store.resolve(tasks, "2")
        self.assertEqual((number, task.text), (2, "вторая"))

    def test_resolve_refuses_words_and_range(self):
        with self.assertRaises(StoreError):
            store.resolve([Task("одна")], "первую")
        with self.assertRaises(StoreError):
            store.resolve([Task("одна")], "5")


if __name__ == "__main__":
    unittest.main()
