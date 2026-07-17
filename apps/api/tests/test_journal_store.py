from datetime import date

from app.services.journal_store import JournalStore


def test_journal_store_persists_and_deletes_a_trade(tmp_path) -> None:
    store = JournalStore(tmp_path / "journal.sqlite3")

    created = store.create_trade(
        instrument="AUD/CHF",
        direction="long",
        status="closed",
        trade_date=date(2026, 7, 17),
        entry_price=0.52,
        exit_price=0.53,
        result_r=1.5,
        pnl_amount=150.0,
        strategy="Macro swing",
        setup="Growth divergence",
        thesis="AUD growth surprise beats CHF.",
        emotion="calm",
        macro_context="AUD growth +1, CHF growth -1",
        seasonality_context="positive next four weeks",
        notes="Followed plan.",
    )

    assert created.id == 1
    assert store.list_trades()[0].instrument == "AUD/CHF"
    assert store.delete_trade(created.id) is True
    assert store.list_trades() == []
