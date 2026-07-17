from app.services.demo_market_data import demo_pair


def test_aud_chf_growth_cell_uses_base_minus_quote() -> None:
    pair = demo_pair("AUD", "CHF")

    assert pair["symbol"] == "AUD/CHF"
    assert pair["cells"]["growth"] == 2


def test_equal_factor_signals_cancel_each_other() -> None:
    pair = demo_pair("AUD", "CHF")

    assert pair["cells"]["inflation"] == 0
    assert pair["cells"]["rates"] == 0
