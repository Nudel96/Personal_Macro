"""Only temporary fixtures are used; never the application's personal database."""

from contextlib import redirect_stderr, redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import inventory


class InventoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = inventory.source_inventory()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "fixture.sqlite"
        source, _ = inventory.build_source_schema()
        target = sqlite3.connect(self.path)
        source.backup(target)
        source.close()
        target.close()

    def write(self, sql, parameters=()):
        with sqlite3.connect(self.path) as db:
            db.execute(sql, parameters)

    @staticmethod
    def table(report, name):
        return next(table for table in report["tables"] if table["name"] == name)

    def test_current_source_schema_and_foreign_key_closures(self):
        self.assertEqual(self.source["migrationCount"], 49)
        self.assertEqual(self.source["tableCount"], 89)
        self.assertEqual(len(self.source["coreDirectTables"]), 23)
        self.assertEqual(len(self.source["coreForeignKeyClosure"]), 25)
        self.assertEqual(len(self.source["candidateForeignKeyClosure"]), 30)
        self.assertEqual(set(self.source["coreForeignKeyClosure"]) - inventory.CORE_TABLES,
                         {"checklist_templates", "checklist_template_items"})
        self.assertEqual(inventory.source_inventory("atlas")["tableCount"], 44)
        self.assertEqual(inventory.source_inventory("bonds")["tableCount"], 4)
        self.assertTrue(self.table(self.source, "atlas_notebook_entries")["definition"])

    def test_snapshot_outputs_counts_and_hashes_but_no_values_or_paths(self):
        secret = "NEVER_PRINT_THIS_PERSONAL_VALUE"
        self.write("INSERT INTO accounts(id,name,created_at,updated_at) VALUES ('account-a',?,?,?)",
                   (secret, "2026-01-01", "2026-01-01"))
        self.write("INSERT INTO app_settings(key,value_json) VALUES (?,?)", (secret, json.dumps(secret)))
        before = self.path.read_bytes()
        before_stat = self.path.stat()
        report = inventory.inspect_snapshot(self.path, self.source)
        encoded = json.dumps(report)
        self.assertNotIn(secret, encoded)
        self.assertNotIn(str(self.path), encoded)
        self.assertNotIn("definition", encoded)
        self.assertEqual(self.table(report, "accounts")["rowCount"], 1)
        self.assertEqual(report["settingRowCounts"]["otherExcluded"], 1)
        self.assertEqual(report["settingRowCounts"]["eligiblePersonalPreferences"], 2)
        self.assertTrue(report["integrityCheckPassed"])
        self.assertTrue(report["schemaMatchesSource"])
        self.assertEqual(report["foreignKeyViolationCount"], 0)
        self.assertFalse(report["migrationApproved"])
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(self.path.stat().st_mtime_ns, before_stat.st_mtime_ns)
        self.assertFalse(Path(str(self.path) + "-journal").exists())
        self.assertFalse(Path(str(self.path) + "-wal").exists())
        self.assertFalse(Path(str(self.path) + "-shm").exists())

    def test_settings_values_are_never_selected_even_under_eligible_names(self):
        sentinel = "SENSITIVE_PROPERTY_MUST_NOT_BE_READ"
        self.write("UPDATE app_settings SET value_json=? WHERE key='appearance'",
                   (json.dumps({"theme": "dark", "apiKey": sentinel}),))
        original = inventory._readonly_authorizer

        def deny_values(action, arg1, arg2, database, trigger):
            if action == sqlite3.SQLITE_READ and arg1 == "app_settings" and arg2 == "value_json":
                return sqlite3.SQLITE_DENY
            return original(action, arg1, arg2, database, trigger)

        with patch.object(inventory, "_readonly_authorizer", side_effect=deny_values):
            report = inventory.inspect_snapshot(self.path, self.source)
        self.assertNotIn(sentinel, json.dumps(report))
        self.assertEqual(report["settingRowCounts"]["eligiblePersonalPreferences"], 2)

    def test_schema_drift_is_hashed_without_exposing_ddl_names_or_literals(self):
        secret = "PRIVATE_SCHEMA_LITERAL"
        self.write(f"ALTER TABLE accounts ADD COLUMN unexpected TEXT DEFAULT '{secret}'")
        self.write(f'CREATE TABLE "{secret}" (value TEXT)')
        report = inventory.inspect_snapshot(self.path, self.source)
        self.assertNotIn(secret, json.dumps(report))
        self.assertFalse(report["schemaMatchesSource"])
        self.assertFalse(self.table(report, "accounts")["schemaMatchesSource"])
        self.assertIsNone(self.table(report, "accounts")["rowCount"])
        self.assertEqual(report["unknownObjectCount"], 1)
        self.assertFalse(report["foreignKeysChecked"])

    def test_foreign_key_failures_are_aggregate_relationship_counts_only(self):
        secret = "DO_NOT_PRINT_INVALID_ACCOUNT_ID"
        self.write("INSERT INTO account_cashflows(id,account_id,occurred_at,amount_minor,kind,created_at) VALUES ('flow',?,'2026-01-01',1,'deposit','2026-01-01')", (secret,))
        report = inventory.inspect_snapshot(self.path, self.source)
        self.assertEqual(report["foreignKeyViolationCount"], 1)
        self.assertEqual(report["foreignKeyViolations"][0]["table"], "account_cashflows")
        self.assertEqual(report["foreignKeyViolations"][0]["parentTable"], "accounts")
        self.assertNotIn(secret, json.dumps(report))
        self.assertNotIn("rowid", json.dumps(report))

    def test_default_mode_rejects_sidecars_and_known_live_app_path(self):
        for suffix in ("-wal", "-shm", "-journal"):
            sidecar = Path(str(self.path) + suffix)
            sidecar.write_bytes(b"")
            with self.assertRaisesRegex(inventory.InventoryError, "SNAPSHOT_HAS_SQLITE_SIDECAR"):
                inventory.inspect_snapshot(self.path, self.source)
            sidecar.unlink()
        live_root = Path(self.temp.name) / "com.personal-macro.app" / "PersonalMacro"
        live_root.mkdir(parents=True)
        live_path = live_root / "fixture.sqlite"
        self.path.rename(live_path)
        with patch.dict(os.environ, {"APPDATA": self.temp.name}):
            with self.assertRaisesRegex(inventory.InventoryError, "LIVE_APP_DATABASE_REJECTED"):
                inventory.inspect_snapshot(live_path, self.source)
            report = inventory.inspect_snapshot(live_path, self.source, live_read_only=True)
            self.assertEqual(report["inspectionMode"], "live-read-only-transaction")

    def test_live_mode_reads_committed_wal_without_uncommitted_rows(self):
        writer = sqlite3.connect(self.path)
        self.addCleanup(writer.close)
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("PRAGMA wal_autocheckpoint=0")
        writer.execute("INSERT INTO accounts(id,name,created_at,updated_at) VALUES ('committed','A','x','x')")
        writer.commit()
        writer.execute("INSERT INTO accounts(id,name,created_at,updated_at) VALUES ('uncommitted','B','x','x')")
        before_database = hashlib.sha256(self.path.read_bytes()).hexdigest()
        wal = Path(str(self.path) + "-wal")
        before_wal = hashlib.sha256(wal.read_bytes()).hexdigest()
        report = inventory.inspect_snapshot(self.path, self.source, live_read_only=True)
        self.assertEqual(self.table(report, "accounts")["rowCount"], 1)
        self.assertEqual(hashlib.sha256(self.path.read_bytes()).hexdigest(), before_database)
        self.assertEqual(hashlib.sha256(wal.read_bytes()).hexdigest(), before_wal)
        writer.rollback()

    def test_live_mode_keeps_one_snapshot_when_another_writer_commits(self):
        writer = sqlite3.connect(self.path)
        self.addCleanup(writer.close)
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("INSERT INTO accounts(id,name,created_at,updated_at) VALUES ('before','A','x','x')")
        writer.commit()
        original = inventory.schema_objects

        def change_after_first_read(db):
            objects = original(db)
            writer.execute("INSERT INTO accounts(id,name,created_at,updated_at) VALUES ('after','B','x','x')")
            writer.commit()
            return objects

        with patch.object(inventory, "schema_objects", side_effect=change_after_first_read):
            report = inventory.inspect_snapshot(self.path, self.source, live_read_only=True)
        self.assertEqual(self.table(report, "accounts")["rowCount"], 1)
        self.assertEqual(writer.execute("SELECT COUNT(*) FROM accounts").fetchone()[0], 2)

    def test_readonly_connection_denies_mutations(self):
        db = sqlite3.connect(self.path.as_uri() + "?mode=ro", uri=True)
        self.addCleanup(db.close)
        db.execute("PRAGMA query_only=ON")
        db.set_authorizer(inventory._readonly_authorizer)
        with self.assertRaises(sqlite3.DatabaseError):
            db.execute("DELETE FROM app_settings")
        with self.assertRaises(sqlite3.DatabaseError):
            db.execute("ATTACH DATABASE ':memory:' AS unsafe")
        self.assertEqual(db.execute("SELECT COUNT(*) FROM app_settings").fetchone()[0], 4)

    def test_cli_errors_are_sanitized_and_failures_have_nonzero_exit(self):
        with redirect_stderr(io.StringIO()) as stderr, redirect_stdout(io.StringIO()):
            result = inventory.main(["--snapshot", str(Path(self.temp.name) / "secret-path-missing.sqlite")])
        self.assertEqual(result, 1)
        self.assertEqual(json.loads(stderr.getvalue()), {"ok": False, "error": "SNAPSHOT_UNREADABLE"})
        self.assertNotIn("secret-path", stderr.getvalue())
        with redirect_stderr(io.StringIO()) as stderr:
            result = inventory.main(["--live-read-only"])
        self.assertEqual(result, 1)
        self.assertEqual(json.loads(stderr.getvalue())["error"], "LIVE_MODE_REQUIRES_EXPLICIT_PATH")
        self.write("DROP TABLE goals")
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(inventory.main(["--snapshot", str(self.path)]), 2)

    def test_non_database_input_does_not_create_a_database(self):
        self.path.write_bytes(b"not a sqlite file")
        with self.assertRaisesRegex(inventory.InventoryError, "SNAPSHOT_NOT_SQLITE"):
            inventory.inspect_snapshot(self.path, self.source)
        self.assertEqual(self.path.read_bytes(), b"not a sqlite file")


if __name__ == "__main__":
    unittest.main()
