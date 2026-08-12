import unittest

from tasksapp import query, render
from tasksapp.errors import UsageError
from tasksapp.model import Task, clean_tag, clean_text, count_tags


class RenderTest(unittest.TestCase):
    def test_line_carries_number_mark_and_text(self):
        lines = render.list_lines([(1, Task("первая")), (2, Task("вторая", done=True))])
        self.assertEqual(lines, ["1. [ ] первая", "2. [x] вторая"])

    def test_tags_go_after_the_text(self):
        lines = render.list_lines([(1, Task("первая", tags=["дом", "срочно"]))])
        self.assertEqual(lines, ["1. [ ] первая  #дом #срочно"])

    def test_numbers_are_right_aligned(self):
        numbered = [(number, Task(f"задача {number}")) for number in (9, 10)]
        self.assertEqual(render.list_lines(numbered), [" 9. [ ] задача 9", "10. [ ] задача 10"])

    def test_empty_list_renders_nothing(self):
        self.assertEqual(render.list_lines([]), [])

    def test_tag_table_is_aligned(self):
        self.assertEqual(render.tag_lines([("дом", 2), ("работа", 1)]), ["дом     2", "работа  1"])


class ModelTest(unittest.TestCase):
    def test_text_joins_words(self):
        self.assertEqual(clean_text(["купить", "хлеб"]), "купить хлеб")

    def test_empty_text_is_refused(self):
        with self.assertRaises(UsageError):
            clean_text([])
        with self.assertRaises(UsageError):
            clean_text(["   "])

    def test_tag_is_one_word(self):
        self.assertEqual(clean_tag(" дом "), "дом")
        with self.assertRaises(UsageError):
            clean_tag("два слова")

    def test_counts_are_sorted_by_tag(self):
        tasks = [Task("a", tags=["работа"]), Task("b", tags=["дом", "работа"])]
        self.assertEqual(count_tags(tasks), [("дом", 1), ("работа", 2)])

    def test_raw_round_trip_keeps_fields(self):
        task = Task("первая", done=True, tags=["дом"])
        self.assertEqual(Task.from_raw(task.to_raw(), 1), task)




class QueryTest(unittest.TestCase):
    def pairs(self):
        return query.numbered(
            [Task("первая", tags=["дом"]), Task("вторая", done=True), Task("третья", tags=["дом"])]
        )

    def test_empty_filter_keeps_everything_in_file_order(self):
        chosen = query.order(query.select(self.pairs(), query.Filter()))
        self.assertEqual([number for number, _ in chosen], [1, 2, 3])

    def test_filter_by_done_keeps_positions(self):
        chosen = query.select(self.pairs(), query.Filter(done=False))
        self.assertEqual([number for number, _ in chosen], [1, 3])

    def test_filter_by_tag(self):
        chosen = query.select(self.pairs(), query.Filter(tag="дом"))
        self.assertEqual([number for number, _ in chosen], [1, 3])

    def test_describe_names_the_conditions(self):
        self.assertEqual(query.describe(query.Filter()), "все задачи")
        self.assertEqual(query.describe(query.Filter(done=False, tag="дом")), "открытые с тегом #дом")

if __name__ == "__main__":
    unittest.main()
