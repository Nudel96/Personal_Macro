from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path


@dataclass(frozen=True)
class JournalTrade:
    id: int
    instrument: str
    direction: str
    status: str
    trade_date: date
    entry_price: float | None
    exit_price: float | None
    result_r: float | None
    pnl_amount: float | None
    strategy: str | None
    setup: str | None
    thesis: str | None
    emotion: str | None
    macro_context: str | None
    seasonality_context: str | None
    notes: str | None
    created_at: datetime


class JournalStore:
    """Small SQLite store for the private, single-user journal."""

    def __init__(self, database_path: Path | None = None) -> None:
        configured_path = os.environ.get("PERSONAL_MACRO_JOURNAL_DB")
        self.database_path = database_path or Path(
            configured_path
            if configured_path
            else Path(__file__).resolve().parents[2] / "data" / "personal_macro.sqlite3"
        )
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_schema(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS journal_trade (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    instrument TEXT NOT NULL,
                    direction TEXT NOT NULL CHECK(direction IN ('long', 'short')),
                    status TEXT NOT NULL CHECK(status IN ('open', 'closed')),
                    trade_date TEXT NOT NULL,
                    entry_price REAL,
                    exit_price REAL,
                    result_r REAL,
                    pnl_amount REAL,
                    strategy TEXT,
                    setup TEXT,
                    thesis TEXT,
                    emotion TEXT,
                    macro_context TEXT,
                    seasonality_context TEXT,
                    notes TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )

    def create_trade(
        self,
        *,
        instrument: str,
        direction: str,
        status: str,
        trade_date: date,
        entry_price: float | None,
        exit_price: float | None,
        result_r: float | None,
        pnl_amount: float | None,
        strategy: str | None,
        setup: str | None,
        thesis: str | None,
        emotion: str | None,
        macro_context: str | None,
        seasonality_context: str | None,
        notes: str | None,
    ) -> JournalTrade:
        created_at = datetime.now(timezone.utc)
        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO journal_trade (
                    instrument, direction, status, trade_date, entry_price, exit_price,
                    result_r, pnl_amount, strategy, setup, thesis, emotion,
                    macro_context, seasonality_context, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    instrument,
                    direction,
                    status,
                    trade_date.isoformat(),
                    entry_price,
                    exit_price,
                    result_r,
                    pnl_amount,
                    strategy,
                    setup,
                    thesis,
                    emotion,
                    macro_context,
                    seasonality_context,
                    notes,
                    created_at.isoformat(),
                ),
            )
            trade_id = int(cursor.lastrowid)
        return self.get_trade(trade_id)

    def get_trade(self, trade_id: int) -> JournalTrade:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM journal_trade WHERE id = ?", (trade_id,)
            ).fetchone()
        if row is None:
            raise KeyError(trade_id)
        return self._row_to_trade(row)

    def list_trades(self) -> list[JournalTrade]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM journal_trade ORDER BY trade_date DESC, id DESC"
            ).fetchall()
        return [self._row_to_trade(row) for row in rows]

    def delete_trade(self, trade_id: int) -> bool:
        with self._connect() as connection:
            cursor = connection.execute("DELETE FROM journal_trade WHERE id = ?", (trade_id,))
        return cursor.rowcount == 1

    @staticmethod
    def _row_to_trade(row: sqlite3.Row) -> JournalTrade:
        return JournalTrade(
            id=int(row["id"]),
            instrument=str(row["instrument"]),
            direction=str(row["direction"]),
            status=str(row["status"]),
            trade_date=date.fromisoformat(str(row["trade_date"])),
            entry_price=row["entry_price"],
            exit_price=row["exit_price"],
            result_r=row["result_r"],
            pnl_amount=row["pnl_amount"],
            strategy=row["strategy"],
            setup=row["setup"],
            thesis=row["thesis"],
            emotion=row["emotion"],
            macro_context=row["macro_context"],
            seasonality_context=row["seasonality_context"],
            notes=row["notes"],
            created_at=datetime.fromisoformat(str(row["created_at"])),
        )
