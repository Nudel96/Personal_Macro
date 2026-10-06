"""Source schema inventory and read-only, value-free SQLite snapshot inspection.

This is preparation for a migration, not an exporter or a migration runner.
It never discovers or opens the personal database without an explicit path.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import time
from typing import Any


DESKTOP_ROOT = Path(__file__).resolve().parents[2]
MIGRATION_DIRECTORIES = {
    "journal": DESKTOP_ROOT / "src-tauri" / "migrations",
    "atlas": DESKTOP_ROOT / "src-tauri" / "atlas-migrations",
    "bonds": DESKTOP_ROOT / "src-tauri" / "bond-migrations",
}
CORE_TABLES = frozenset({
    "account_cashflows", "accounts", "app_settings", "broker_account_connections",
    "custom_field_values", "custom_fields", "deleted_items", "emotions",
    "goal_progress", "goals", "mistakes", "reviews", "saved_views", "setup_versions",
    "setups", "strategies", "tags", "trade_checklist_items", "trade_emotions",
    "trade_legs", "trade_mistakes", "trade_tags", "trades",
})
MEDIA_TABLES = frozenset({"media_files", "trade_media", "media_annotations"})
PERSONAL_ATLAS_TABLES = frozenset({"atlas_notebook_entries", "atlas_personal_preferences"})
ADDITIONAL_PERSONAL_TABLES = frozenset({
    "dashboard_layouts", "saved_filters", "trade_context_links", "metric_snapshots",
    "import_runs", "import_rows", "export_runs", "metatrader_import_sources",
    "metatrader_trade_links", "ctrader_import_sources", "ctrader_trade_links",
    "myfxbook_connections", "myfxbook_links", "mt5_accounts", "mt5_account_snapshots",
    "mt5_deals", "mt5_open_positions", "mt5_position_links", "mt5_sync_runs",
    "cot_broker_links", "eodhd_mapping_candidates",
})
METADATA_TABLES = frozenset({"schema_migrations", "_sqlx_migrations"})
ELIGIBLE_SETTING_KEYS = ("appearance", "analytics")
PERSONAL_UNSUPPORTED_SETTING_KEYS = ("locale",)
LOCAL_SETTING_KEYS = ("backup",)
RETIRED_SETTING_KEYS = ("macroDataAutomation", "macroSync", "weeklyMacroResearch")


class InventoryError(Exception):
    """A stable public error code, never an SQLite message or a supplied path."""


def digest(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def quote_identifier(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def build_source_schema(family: str = "journal") -> tuple[sqlite3.Connection, list[dict[str, Any]]]:
    """Execute repository-owned migration SQL only, against temporary memory."""
    db = sqlite3.connect(":memory:")
    migrations = []
    try:
        for path in sorted(MIGRATION_DIRECTORIES[family].glob("*.sql")):
            contents = path.read_bytes()
            db.executescript(contents.decode("utf-8-sig"))
            migrations.append({"file": path.name, "sha256": hashlib.sha256(contents).hexdigest()})
    except (OSError, sqlite3.Error, UnicodeError, KeyError) as error:
        db.close()
        raise InventoryError("SOURCE_SCHEMA_UNAVAILABLE") from error
    if not migrations:
        db.close()
        raise InventoryError("SOURCE_SCHEMA_UNAVAILABLE")
    return db, migrations


def schema_objects(db: sqlite3.Connection) -> list[dict[str, str | None]]:
    return [dict(zip(("type", "name", "table", "sql"), row)) for row in db.execute(
        "SELECT type, name, tbl_name, sql FROM sqlite_schema "
        "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
    )]


def foreign_keys(db: sqlite3.Connection, table: str) -> list[dict[str, Any]]:
    return [{
        "id": row[0], "sequence": row[1], "targetTable": row[2],
        "fromColumn": row[3], "toColumn": row[4],
        "onUpdate": row[5], "onDelete": row[6], "match": row[7],
    } for row in db.execute(f"PRAGMA foreign_key_list({quote_identifier(table)})")]


def foreign_key_closure(tables: dict[str, dict[str, Any]], roots: frozenset[str]) -> list[str]:
    pending = list(roots)
    found: set[str] = set()
    while pending:
        table = pending.pop()
        if table in found:
            continue
        if table not in tables:
            raise InventoryError("SOURCE_SCHEMA_MISSING_REQUIRED_TABLE")
        found.add(table)
        pending.extend(fk["targetTable"] for fk in tables[table]["foreignKeys"])
    return sorted(found)


def table_policy(name: str, family: str, candidate_tables: set[str]) -> str:
    if name in METADATA_TABLES:
        return "rebuild_destination_metadata"
    if family != "journal":
        return "separate_public_cache_not_personal_journal"
    if name == "app_settings":
        return "explicit_setting_and_property_allowlist_required"
    if name == "broker_account_connections":
        return "balance_snapshot_only_no_credentials_or_live_connection"
    if name in MEDIA_TABLES:
        return "private_blob_mapping_and_integrity_required"
    if name in PERSONAL_ATLAS_TABLES:
        return "personal_atlas_preserve_context_revision_and_snapshot"
    if name in candidate_tables:
        return "core_journal_candidate"
    if name in ADDITIONAL_PERSONAL_TABLES:
        return "additional_personal_or_import_history_requires_explicit_port"
    return "provider_or_legacy_data_retained_locally_pending_separate_review"


def source_inventory(family: str = "journal") -> dict[str, Any]:
    db, migrations = build_source_schema(family)
    try:
        objects = schema_objects(db)
        tables: dict[str, dict[str, Any]] = {}
        for obj in objects:
            if obj["type"] != "table":
                continue
            name = str(obj["name"])
            definitions = [item for item in objects if item["table"] == name]
            tables[name] = {
                "name": name,
                "definition": obj["sql"],
                "objects": definitions,
                "schemaSha256": digest(definitions),
                "columns": [{
                    "name": row[1], "type": row[2], "notNull": bool(row[3]),
                    "defaultSql": row[4], "primaryKeyOrder": row[5], "hidden": row[6],
                } for row in db.execute(f"PRAGMA table_xinfo({quote_identifier(name)})")],
                "foreignKeys": foreign_keys(db, name),
            }
        core = foreign_key_closure(tables, CORE_TABLES) if family == "journal" else []
        candidates = foreign_key_closure(
            tables, CORE_TABLES | MEDIA_TABLES | PERSONAL_ATLAS_TABLES
        ) if family == "journal" else []
        for name, table in tables.items():
            table["migrationPolicy"] = table_policy(name, family, set(candidates))
        return {
            "formatVersion": 1,
            "kind": "trusted-source-schema",
            "family": family,
            "migrationCount": len(migrations),
            "migrations": migrations,
            "schemaSha256": digest(objects),
            "tableCount": len(tables),
            "coreDirectTables": sorted(CORE_TABLES) if family == "journal" else [],
            "coreForeignKeyClosure": core,
            "mediaTables": sorted(MEDIA_TABLES) if family == "journal" else [],
            "personalAtlasTables": sorted(PERSONAL_ATLAS_TABLES) if family == "journal" else [],
            "candidateForeignKeyClosure": candidates,
            "settingsPolicy": settings_policy() if family == "journal" else None,
            "tables": [tables[name] for name in sorted(tables)],
        }
    finally:
        db.close()


def settings_policy() -> dict[str, Any]:
    # This describes policy. The inspector never reads a value_json field.
    return {
        "eligibleKeys": list(ELIGIBLE_SETTING_KEYS),
        "eligibleProperties": {
            "appearance": ["theme", "density", "sidebarCollapsed"],
            "analytics": ["minimumRankingSample", "minimumCorrelationSample", "rollingWindow"],
        },
        "personalButNotYetCloudSupported": list(PERSONAL_UNSUPPORTED_SETTING_KEYS),
        "localRuntimeOnly": list(LOCAL_SETTING_KEYS),
        "retiredAndExcluded": list(RETIRED_SETTING_KEYS),
        "allOtherKeys": "exclude_until_reviewed_never_print_names_or_values",
        "allOtherProperties": "exclude_until_reviewed_never_print_names_or_values",
        "valuesInspected": False,
    }


def _snapshot_path(path: Path, live_read_only: bool = False) -> Path:
    try:
        resolved = path.resolve(strict=True)
        if not resolved.is_file():
            raise InventoryError("SNAPSHOT_NOT_REGULAR_FILE")
        # Explicitly reject the known live app directory, including public caches.
        appdata = os.environ.get("APPDATA")
        if appdata and not live_read_only:
            live_root = (Path(appdata) / "com.personal-macro.app" / "PersonalMacro").resolve()
            if resolved.is_relative_to(live_root):
                raise InventoryError("LIVE_APP_DATABASE_REJECTED")
        if not live_read_only:
            for suffix in ("-wal", "-shm", "-journal"):
                if Path(str(resolved) + suffix).exists():
                    raise InventoryError("SNAPSHOT_HAS_SQLITE_SIDECAR")
        with resolved.open("rb") as handle:
            if handle.read(16) != b"SQLite format 3\x00":
                raise InventoryError("SNAPSHOT_NOT_SQLITE")
        return resolved
    except OSError as error:
        raise InventoryError("SNAPSHOT_UNREADABLE") from error


def _readonly_authorizer(action: int, arg1: str | None, arg2: str | None,
                         database: str | None, trigger: str | None) -> int:
    del arg1, arg2, database, trigger
    # Defense in depth: immutable + mode=ro and query_only are also active.
    forbidden = {
        sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH, sqlite3.SQLITE_INSERT,
        sqlite3.SQLITE_UPDATE, sqlite3.SQLITE_DELETE, sqlite3.SQLITE_CREATE_INDEX,
        sqlite3.SQLITE_CREATE_TABLE, sqlite3.SQLITE_CREATE_TEMP_INDEX,
        sqlite3.SQLITE_CREATE_TEMP_TABLE, sqlite3.SQLITE_CREATE_TEMP_TRIGGER,
        sqlite3.SQLITE_CREATE_TEMP_VIEW, sqlite3.SQLITE_CREATE_TRIGGER,
        sqlite3.SQLITE_CREATE_VIEW, sqlite3.SQLITE_DROP_INDEX, sqlite3.SQLITE_DROP_TABLE,
        sqlite3.SQLITE_DROP_TEMP_INDEX, sqlite3.SQLITE_DROP_TEMP_TABLE,
        sqlite3.SQLITE_DROP_TEMP_TRIGGER, sqlite3.SQLITE_DROP_TEMP_VIEW,
        sqlite3.SQLITE_DROP_TRIGGER, sqlite3.SQLITE_DROP_VIEW, sqlite3.SQLITE_ALTER_TABLE,
        sqlite3.SQLITE_CREATE_VTABLE, sqlite3.SQLITE_DROP_VTABLE,
    }
    return sqlite3.SQLITE_DENY if action in forbidden else sqlite3.SQLITE_OK


def inspect_snapshot(path: Path, source: dict[str, Any], timeout_seconds: int = 60,
                     *, live_read_only: bool = False) -> dict[str, Any]:
    if not 1 <= timeout_seconds <= 600:
        raise InventoryError("INVALID_TIMEOUT")
    snapshot = _snapshot_path(path, live_read_only)
    before = snapshot.stat()
    deadline = time.monotonic() + timeout_seconds
    query = "?mode=ro" if live_read_only else "?mode=ro&immutable=1"
    db = sqlite3.connect(snapshot.as_uri() + query, uri=True, timeout=5)
    try:
        db.execute("PRAGMA query_only = ON")
        db.execute("PRAGMA trusted_schema = OFF")
        db.enable_load_extension(False)
        db.set_authorizer(_readonly_authorizer)
        db.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
        # Establish one coherent read snapshot, including committed WAL pages.
        # No checkpoint, backup, journal-mode change, or migration is performed.
        db.execute("BEGIN")
        objects = schema_objects(db)
        expected = {table["name"]: table for table in source["tables"]}
        actual_tables = {obj["name"]: obj for obj in objects if obj["type"] == "table"}
        unknown_objects = [obj for obj in objects if obj["table"] not in expected
                           and obj["table"] not in METADATA_TABLES]
        metadata_objects = [obj for obj in objects if obj["table"] in METADATA_TABLES
                            and obj["table"] not in expected]
        page_size = db.execute("PRAGMA page_size").fetchone()[0]
        page_count = db.execute("PRAGMA page_count").fetchone()[0]
        free_pages = db.execute("PRAGMA freelist_count").fetchone()[0]
        # dbstat exposes allocated pages, not payload bytes. Availability depends
        # on the Python SQLite build; null means unavailable, never zero.
        allocations: dict[str, int] | None = None
        try:
            allocations = dict(db.execute("SELECT name, SUM(pgsize) FROM dbstat GROUP BY name"))
        except sqlite3.DatabaseError:
            pass
        tables = []
        all_match = True
        for name, definition in sorted(expected.items()):
            actual = actual_tables.get(name)
            related = [obj for obj in objects if obj["table"] == name]
            actual_hash = digest(related) if actual else None
            matches = actual_hash == definition["schemaSha256"]
            all_match = all_match and matches
            # Never query a view, unknown table, virtual table or drifted schema.
            row_count = db.execute(f"SELECT COUNT(*) FROM {quote_identifier(name)}").fetchone()[0] if matches else None
            tree_names = [name] + [row[1] for row in db.execute(f"PRAGMA index_list({quote_identifier(name)})")] if matches else []
            table_bytes = sum(allocations.get(tree, 0) for tree in tree_names) if allocations is not None and matches else None
            tables.append({
                "name": name, "present": actual is not None,
                "migrationPolicy": definition["migrationPolicy"],
                "schemaMatchesSource": matches, "schemaSha256": actual_hash,
                "expectedSchemaSha256": definition["schemaSha256"],
                "rowCount": row_count, "allocatedBytesIncludingIndexes": table_bytes,
                "foreignKeys": definition["foreignKeys"],
            })
        # quick_check can return diagnostic text containing row identifiers or
        # schema text. Reduce to a boolean without exposing the messages.
        quick_check_rows = db.execute("PRAGMA quick_check").fetchall()
        integrity_ok = quick_check_rows == [("ok",)]
        violations: dict[tuple[str, str, int], int] = {}
        unknown_violation_count = 0
        fk_checked = all_match and not unknown_objects
        if fk_checked:
            for table, _rowid, parent, fk_id in db.execute("PRAGMA foreign_key_check"):
                if table in expected and parent in expected:
                    key = (table, parent, fk_id)
                    violations[key] = violations.get(key, 0) + 1
                else:
                    unknown_violation_count += 1
        setting_counts = None
        if source["family"] == "journal" and next(t for t in tables if t["name"] == "app_settings")["schemaMatchesSource"]:
            # Only counts of fixed, source-owned names. Never enumerate keys.
            setting_counts = {}
            known = ELIGIBLE_SETTING_KEYS + PERSONAL_UNSUPPORTED_SETTING_KEYS + LOCAL_SETTING_KEYS + RETIRED_SETTING_KEYS
            for label, keys in (
                ("eligiblePersonalPreferences", ELIGIBLE_SETTING_KEYS),
                ("personalNotYetSupported", PERSONAL_UNSUPPORTED_SETTING_KEYS),
                ("localRuntimeOnly", LOCAL_SETTING_KEYS),
                ("retired", RETIRED_SETTING_KEYS),
            ):
                placeholders = ",".join("?" for _ in keys)
                setting_counts[label] = db.execute(f"SELECT COUNT(*) FROM app_settings WHERE key IN ({placeholders})", keys).fetchone()[0]
            placeholders = ",".join("?" for _ in known)
            setting_counts["otherExcluded"] = db.execute(f"SELECT COUNT(*) FROM app_settings WHERE key NOT IN ({placeholders})", known).fetchone()[0]
        after = snapshot.stat()
        if not live_read_only and (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise InventoryError("SNAPSHOT_CHANGED_DURING_INSPECTION")
        if not live_read_only:
            _snapshot_path(snapshot)  # Reject sidecars created while inspecting.
        return {
            "formatVersion": 1, "kind": "value-free-snapshot-inventory",
            "inspectionMode": "live-read-only-transaction" if live_read_only else "immutable-snapshot",
            "family": source["family"], "sourceSchemaSha256": source["schemaSha256"],
            "snapshotSchemaSha256": digest(objects),
            "fileBytes": before.st_size, "pageSize": page_size, "pageCount": page_count,
            "freelistBytes": free_pages * page_size,
            "tableCount": len(actual_tables),
            "unknownObjectCount": len(unknown_objects),
            "unknownObjectsSha256": digest(unknown_objects),
            "additionalMetadataObjectCount": len(metadata_objects),
            "additionalMetadataObjectsSha256": digest(metadata_objects),
            "schemaMatchesSource": all_match and not unknown_objects,
            "integrityCheckPassed": integrity_ok,
            "foreignKeysChecked": fk_checked,
            "foreignKeyViolationCount": sum(violations.values()) + unknown_violation_count if fk_checked else None,
            "foreignKeyViolations": [{
                "table": key[0], "parentTable": key[1], "foreignKeyId": key[2], "count": count,
            } for key, count in sorted(violations.items())],
            "unknownForeignKeyViolationCount": unknown_violation_count if fk_checked else None,
            "settingRowCounts": setting_counts,
            "tables": tables,
            # Count/hash agreement is necessary but never proves a complete migration.
            "migrationExecuted": False,
            "migrationApproved": False,
        }
    except sqlite3.Error as error:
        raise InventoryError("SNAPSHOT_INSPECTION_FAILED") from error
    finally:
        db.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--family", choices=tuple(MIGRATION_DIRECTORIES), default="journal")
    parser.add_argument("--snapshot", type=Path, help="Explicit closed, self-contained snapshot; never the live app DB.")
    parser.add_argument("--live-read-only", action="store_true", help="Explicitly permit a live DB at --snapshot, reading one transaction including WAL.")
    parser.add_argument("--timeout-seconds", type=int, default=60)
    args = parser.parse_args(argv)
    try:
        if args.live_read_only and args.snapshot is None:
            raise InventoryError("LIVE_MODE_REQUIRES_EXPLICIT_PATH")
        source = source_inventory(args.family)
        report = inspect_snapshot(args.snapshot, source, args.timeout_seconds,
                                  live_read_only=args.live_read_only) if args.snapshot else source
        print(json.dumps(report, ensure_ascii=True, indent=2, sort_keys=True))
        if args.snapshot and (not report["schemaMatchesSource"] or not report["integrityCheckPassed"]
                              or report["foreignKeyViolationCount"] != 0):
            return 2
        return 0
    except (InventoryError, OSError, sqlite3.Error) as error:
        code = str(error) if isinstance(error, InventoryError) else "INVENTORY_FAILED"
        print(json.dumps({"ok": False, "error": code}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
