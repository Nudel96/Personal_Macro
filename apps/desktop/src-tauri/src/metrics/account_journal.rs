use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapitalPoint {
    pub id: String,
    pub occurred_at: Option<String>,
    pub kind: String,
    pub label: String,
    pub change_minor: i64,
    pub balance_minor: i64,
    pub cumulative_pnl_minor: i64,
}

#[derive(Debug, sqlx::FromRow)]
pub struct CapitalEvent {
    pub id: String,
    pub occurred_at: String,
    pub kind: String,
    pub label: String,
    pub amount_minor: i64,
}

pub fn capital_curve(initial: i64, mut events: Vec<CapitalEvent>) -> Vec<CapitalPoint> {
    events.sort_by(|a, b| {
        let date = |value: &str| chrono::DateTime::parse_from_rfc3339(value).ok();
        date(&a.occurred_at)
            .cmp(&date(&b.occurred_at))
            .then(a.id.cmp(&b.id))
    });
    let mut balance = initial;
    let mut pnl = 0;
    let mut points = vec![CapitalPoint {
        id: "initial".into(),
        occurred_at: None,
        kind: "initial".into(),
        label: "Startkapital".into(),
        change_minor: initial,
        balance_minor: initial,
        cumulative_pnl_minor: 0,
    }];
    for event in events {
        balance += event.amount_minor;
        if event.kind == "trade" {
            pnl += event.amount_minor;
        }
        points.push(CapitalPoint {
            id: event.id,
            occurred_at: Some(event.occurred_at),
            kind: event.kind,
            label: event.label,
            change_minor: event.amount_minor,
            balance_minor: balance,
            cumulative_pnl_minor: pnl,
        });
    }
    points
}

#[cfg(test)]
mod tests {
    use super::*;
    fn event(id: &str, day: u8, kind: &str, amount: i64) -> CapitalEvent {
        CapitalEvent {
            id: id.into(),
            occurred_at: format!("2026-09-{day:02}T12:00:00Z"),
            kind: kind.into(),
            label: id.into(),
            amount_minor: amount,
        }
    }
    #[test]
    fn new_account_has_capital_before_any_trade() {
        let curve = capital_curve(100_000, vec![]);
        assert_eq!(curve.len(), 1);
        assert_eq!(curve[0].balance_minor, 100_000);
        assert_eq!(curve[0].cumulative_pnl_minor, 0);
    }
    #[test]
    fn capital_and_trading_profit_are_separate_and_chronological() {
        let curve = capital_curve(
            100_000,
            vec![
                event("trade2", 4, "trade", 3459),
                event("deposit", 2, "deposit", 50_000),
                event("trade1", 1, "trade", 4075),
                event("withdrawal", 3, "withdrawal", -20_000),
            ],
        );
        assert_eq!(curve[1].balance_minor, 104_075);
        assert_eq!(curve.last().unwrap().balance_minor, 137_534);
        assert_eq!(curve.last().unwrap().cumulative_pnl_minor, 7534);
    }
}
