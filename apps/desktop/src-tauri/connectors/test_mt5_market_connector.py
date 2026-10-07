import unittest
from types import SimpleNamespace

import mt5_market_connector as connector


def symbol(name="EURUSD", base="EUR", quote="USD", visible=False, mode=0,
           path="", description="", expiration=0):
    return SimpleNamespace(name=name, currency_base=base, currency_profit=quote,
                           visible=visible, trade_calc_mode=mode, path=path,
                           description=description, expiration_time=expiration)


class MarketConnectorTests(unittest.TestCase):
    def test_metadata_and_forex_mode_are_required(self):
        items = [symbol("EURUSD", quote="JPY"), symbol("EURUSD-index", mode=3)]
        self.assertEqual(connector.choose_symbol(items,"EUR","USD",(0,1)),
                         (None,False,"mt5_symbol_unavailable"))

    def test_suffix_selection_and_inverse_pair(self):
        item = symbol("EURUSD.a")
        self.assertEqual(connector.choose_symbol([item],"EUR","USD",(0,1)),(item,False,None))
        self.assertEqual(connector.choose_symbol([item],"USD","EUR",(0,1)),(item,True,None))

    def test_ambiguity_is_not_guessed_and_visible_variant_can_resolve_it(self):
        items = [symbol("EURUSD.a"),symbol("EURUSD.b")]
        self.assertEqual(connector.choose_symbol(items,"EUR","USD",(0,1))[2],"mt5_symbol_ambiguous")
        items[1].visible = True
        self.assertIs(connector.choose_symbol(items,"EUR","USD",(0,1))[0],items[1])

    def test_exact_symbol_resolves_multiple_unselected_variants(self):
        items = [symbol("EURUSD.a"),symbol()]
        self.assertIs(connector.choose_symbol(items,"EUR","USD",(0,1))[0],items[1])

    def test_offshore_yuan_is_not_onshore_yuan(self):
        self.assertEqual(connector.choose_symbol([symbol("USDCNH",base="USD",quote="CNH")],
                         "USD","CNY",(0,1))[2],"mt5_symbol_unavailable")

    def test_metal_cfds_require_matching_metadata_and_keep_their_own_direction(self):
        gold = symbol("GOLD.a", base="XAU", mode=2)
        silver = symbol("SILVER", base="SILVER", mode=4)
        for item, base in ((gold, "XAU"), (silver, "XAG")):
            self.assertEqual(connector.choose_symbol([item], base, "USD", (0,5), (2,4)),
                             (item, False, None))
        rejected = [symbol("GOLD", base="EUR", mode=2),
                    symbol("XAUUSD-future", base="XAU", mode=1),
                    symbol("XAUEUR", base="XAU", quote="EUR", mode=2),
                    symbol("USDXAU", base="USD", quote="XAU", mode=0)]
        self.assertEqual(connector.choose_symbol(rejected, "XAU", "USD", (0,5), (2,4))[2],
                         "mt5_symbol_unavailable")
        self.assertEqual(connector.choose_symbol([symbol(mode=2)], "EUR", "USD", (0,5), (2,4))[2],
                         "mt5_symbol_unavailable")

    def test_ambiguous_metal_symbols_are_not_guessed(self):
        items = [symbol("GOLD.a", base="XAU", mode=2), symbol("GOLD.b", base="XAU", mode=2)]
        self.assertEqual(connector.choose_symbol(items, "XAU", "USD", (0,5), (2,4))[2],
                         "mt5_symbol_ambiguous")
        items[1].visible = True
        self.assertIs(connector.choose_symbol(items, "XAU", "USD", (0,5), (2,4))[0], items[1])

    def test_usd_denominated_metal_metadata_requires_canonical_name_and_metals_path(self):
        for base in ("XAU", "XAG"):
            spot = symbol(base+"USD", base="USD", mode=4, path="Commodities\\Metals(s)\\"+base+"USD")
            self.assertEqual(connector.choose_symbol([spot], base, "USD", (0,5), (2,4)),
                             (spot, False, None))
        suffix = symbol("XAUUSD.a", base="USD", mode=2, path="Commodities/Metals/XAUUSD.a")
        self.assertIs(connector.choose_symbol([suffix], "XAU", "USD", (0,5), (2,4))[0], suffix)
        rejected = [symbol("XAUUSD", base="USD", mode=2),
                    symbol("XAUUSD-PERP", base="USD", mode=2, path="Commodities/Perpetuals"),
                    symbol("XAUUSD.f", base="USD", mode=2, path="Futures/Metals/XAUUSD.f"),
                    symbol("GOLD.f", base="XAU", mode=2, description="Gold Future"),
                    symbol("XAUUSD", base="XAU", mode=2, expiration=1800000000),
                    symbol("XAUEUR", base="USD", mode=2, path="Commodities/Metals"),
                    symbol("GOLD", base="USD", mode=2, path="Commodities/Metals")]
        self.assertEqual(connector.choose_symbol(rejected, "XAU", "USD", (0,5), (2,4))[2],
                         "mt5_symbol_unavailable")

    def test_skips_current_bar_and_rejects_future_or_corrupt_rows(self):
        rows = [dict(time=10,open=1,high=2,low=0.5,close=1.5)]
        calls = []
        mt5 = SimpleNamespace(copy_rates_from_pos=lambda *args: calls.append(args) or rows)
        bars, reason = connector.completed_bars(mt5,"EURUSD",123,14_400,20_000)
        self.assertIsNone(reason)
        self.assertEqual(len(bars),1)
        self.assertEqual(calls[0],("EURUSD",123,1,300))
        rows[0]["time"] = 19_000
        self.assertEqual(connector.completed_bars(mt5,"EURUSD",123,14_400,20_000)[1],"mt5_invalid_candles")
        rows[0].update(time=10,high=float("nan"))
        self.assertEqual(connector.completed_bars(mt5,"EURUSD",123,14_400,20_000)[1],"mt5_invalid_candles")

    def test_no_history_is_not_a_neutral_signal(self):
        mt5 = SimpleNamespace(copy_rates_from_pos=lambda *args: None)
        self.assertEqual(connector.completed_bars(mt5,"EURUSD",1,14_400,20_000),
                         ([],"mt5_history_unavailable"))

    def test_snapshot_contains_only_market_data_and_shutdown_runs(self):
        account = SimpleNamespace(login=12345,server="Broker-Test",balance=9876)
        closed = []
        mt5 = SimpleNamespace(initialize=lambda **kwargs: True,
            terminal_info=lambda: SimpleNamespace(connected=True),account_info=lambda:account,
            symbols_get=lambda:[symbol()],SYMBOL_CALC_MODE_FOREX=0,SYMBOL_CALC_MODE_FOREX_NO_LEVERAGE=5,
            SYMBOL_CALC_MODE_CFD=2,SYMBOL_CALC_MODE_CFDLEVERAGE=4,
            TIMEFRAME_H4=1,TIMEFRAME_D1=2,symbol_select=lambda *args:True,
            copy_rates_from_pos=lambda *args:None,shutdown=lambda:closed.append(True))
        result = connector.read_snapshot(mt5)
        self.assertTrue(result["ok"])
        self.assertEqual(len(result["data"]["pairs"]),38)
        self.assertEqual([(row["base"], row["quote"]) for row in result["data"]["pairs"][-2:]],
                         [("XAU", "USD"), ("XAG", "USD")])
        self.assertEqual(set(result["data"]),{"sourceLabel","observedAt","pairs"})
        self.assertEqual(closed,[True])

    def test_explicit_terminal_path_is_passed_to_mt5(self):
        calls = []
        mt5 = SimpleNamespace(initialize=lambda **kwargs: calls.append(kwargs) or False)
        result = connector.read_snapshot(mt5,"D:/Broker/terminal64.exe")
        self.assertEqual(result["code"],"MT5_INITIALIZE_FAILED")
        self.assertEqual(calls,[dict(path="D:/Broker/terminal64.exe",timeout=10_000)])


if __name__ == "__main__":
    unittest.main()
