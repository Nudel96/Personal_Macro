use chrono::DateTime;
use serde::Serialize;

pub mod policy_rates;

pub const CALCULATION_VERSION: &str = "journal-metrics-v1";

#[derive(Debug, Clone)]
pub struct MetricTrade {
    pub id: String,
    pub opened_at: Option<String>,
    pub closed_at: String,
    pub net_pnl_minor: i64,
    pub planned_risk_minor: Option<i64>,
    pub total_costs_minor: i64,
    pub realized_r: Option<f64>,
    pub process_score: Option<f64>,
    pub execution_score: Option<f64>,
    pub setup_quality: Option<f64>,
    pub followed_plan: Option<bool>,
    pub followed_risk_rules: Option<bool>,
    pub followed_entry_rules: Option<bool>,
    pub followed_exit_rules: Option<bool>,
    pub reviewed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricValue {
    pub value: Option<f64>,
    pub formatted_special: Option<String>,
    pub unit: String,
    pub n: usize,
    pub status: String,
    pub reason_code: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardMetrics {
    pub calculation_version: String,
    pub total_trades: usize,
    pub wins: usize,
    pub losses: usize,
    pub break_even: usize,
    pub net_pnl_minor: i64,
    pub gross_profit_minor: i64,
    pub gross_loss_minor: i64,
    pub win_rate: MetricValue,
    pub loss_rate: MetricValue,
    pub profit_factor: MetricValue,
    pub payoff_ratio: MetricValue,
    pub expectancy_minor: MetricValue,
    pub average_winner_minor: MetricValue,
    pub average_loser_minor: MetricValue,
    pub total_r: MetricValue,
    pub average_r: MetricValue,
    pub median_r: MetricValue,
    pub average_win_r: MetricValue,
    pub average_loss_r: MetricValue,
    pub r_standard_deviation: MetricValue,
    pub system_quality_number: MetricValue,
    pub average_process_score: MetricValue,
    pub average_execution_score: MetricValue,
    pub average_setup_quality: MetricValue,
    pub plan_adherence: MetricValue,
    pub risk_adherence: MetricValue,
    pub entry_adherence: MetricValue,
    pub exit_adherence: MetricValue,
    pub review_completion: MetricValue,
    pub average_holding_minutes: MetricValue,
    pub average_planned_risk_minor: MetricValue,
    pub recovery_factor: MetricValue,
    pub profitable_days_rate: MetricValue,
    pub best_day_concentration: MetricValue,
    pub total_costs_minor: i64,
    pub max_planned_risk_minor: Option<i64>,
    pub largest_winner_minor: Option<i64>,
    pub largest_loser_minor: Option<i64>,
    pub max_win_streak: usize,
    pub max_loss_streak: usize,
    pub equity_curve: Vec<EquityPoint>,
    pub drawdown_curve: Vec<DrawdownPoint>,
    pub max_drawdown_minor: i64,
    pub current_drawdown_minor: i64,
    pub average_drawdown_minor: MetricValue,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EquityPoint {
    pub id: String,
    pub date: String,
    pub cumulative_pnl_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawdownPoint {
    pub date: String,
    pub drawdown_minor: i64,
}

fn available(value: f64, unit: &str, n: usize) -> MetricValue {
    MetricValue {
        value: Some(value),
        formatted_special: None,
        unit: unit.into(),
        n,
        status: "available".into(),
        reason_code: None,
    }
}

fn unavailable(unit: &str, reason: &str) -> MetricValue {
    MetricValue {
        value: None,
        formatted_special: None,
        unit: unit.into(),
        n: 0,
        status: "unavailable".into(),
        reason_code: Some(reason.into()),
    }
}

fn average(values: &[f64], unit: &str, reason: &str) -> MetricValue {
    if values.is_empty() {
        unavailable(unit, reason)
    } else {
        available(
            values.iter().sum::<f64>() / values.len() as f64,
            unit,
            values.len(),
        )
    }
}

fn adherence(values: &[Option<bool>], reason: &str) -> MetricValue {
    let evaluated: Vec<bool> = values.iter().flatten().copied().collect();
    if evaluated.is_empty() {
        unavailable("ratio", reason)
    } else {
        available(
            evaluated.iter().filter(|value| **value).count() as f64 / evaluated.len() as f64,
            "ratio",
            evaluated.len(),
        )
    }
}

pub fn calculate_dashboard(trades: &[MetricTrade]) -> DashboardMetrics {
    let total_trades = trades.len();
    let wins = trades
        .iter()
        .filter(|trade| trade.net_pnl_minor > 0)
        .count();
    let losses = trades
        .iter()
        .filter(|trade| trade.net_pnl_minor < 0)
        .count();
    let break_even = total_trades.saturating_sub(wins + losses);
    let net_pnl_minor = trades.iter().map(|trade| trade.net_pnl_minor).sum();
    let gross_profit_minor: i64 = trades.iter().map(|trade| trade.net_pnl_minor.max(0)).sum();
    let gross_loss_minor: i64 = trades.iter().map(|trade| trade.net_pnl_minor.min(0)).sum();

    let win_rate = if total_trades > 0 {
        available(wins as f64 / total_trades as f64, "ratio", total_trades)
    } else {
        unavailable("ratio", "NO_CLOSED_TRADES")
    };
    let loss_rate = if total_trades > 0 {
        available(losses as f64 / total_trades as f64, "ratio", total_trades)
    } else {
        unavailable("ratio", "NO_CLOSED_TRADES")
    };

    let winning_values: Vec<f64> = trades
        .iter()
        .filter(|trade| trade.net_pnl_minor > 0)
        .map(|trade| trade.net_pnl_minor as f64)
        .collect();
    let losing_values: Vec<f64> = trades
        .iter()
        .filter(|trade| trade.net_pnl_minor < 0)
        .map(|trade| trade.net_pnl_minor as f64)
        .collect();
    let average_winner_minor = average(&winning_values, "minor_currency", "NO_WIN_TRADES");
    let average_loser_minor = average(&losing_values, "minor_currency", "NO_LOSS_TRADES");
    let payoff_ratio = match (average_winner_minor.value, average_loser_minor.value) {
        (Some(winner), Some(loser)) if loser != 0.0 => {
            available(winner / loser.abs(), "ratio", wins.min(losses))
        }
        _ => unavailable("ratio", "WIN_AND_LOSS_TRADES_REQUIRED"),
    };

    let profit_factor = if gross_loss_minor < 0 {
        available(
            gross_profit_minor as f64 / gross_loss_minor.abs() as f64,
            "ratio",
            total_trades,
        )
    } else if gross_profit_minor > 0 {
        MetricValue {
            value: None,
            formatted_special: Some("∞".into()),
            unit: "ratio".into(),
            n: total_trades,
            status: "special".into(),
            reason_code: Some("NO_LOSS_TRADES".into()),
        }
    } else {
        unavailable("ratio", "NO_LOSS_TRADES")
    };

    let expectancy_minor = if total_trades > 0 {
        available(
            net_pnl_minor as f64 / total_trades as f64,
            "minor_currency",
            total_trades,
        )
    } else {
        unavailable("minor_currency", "NO_CLOSED_TRADES")
    };

    let r_values: Vec<f64> = trades.iter().filter_map(|trade| trade.realized_r).collect();
    let total_r_value: f64 = r_values.iter().sum();
    let total_r = if r_values.is_empty() {
        unavailable("r", "NO_VALID_INITIAL_RISK")
    } else {
        available(total_r_value, "r", r_values.len())
    };
    let average_r = if r_values.is_empty() {
        unavailable("r", "NO_VALID_INITIAL_RISK")
    } else {
        available(total_r_value / r_values.len() as f64, "r", r_values.len())
    };
    let mut sorted_r = r_values.clone();
    sorted_r.sort_by(f64::total_cmp);
    let median_r = if sorted_r.is_empty() {
        unavailable("r", "NO_VALID_INITIAL_RISK")
    } else {
        let middle = sorted_r.len() / 2;
        let value = if sorted_r.len().is_multiple_of(2) {
            (sorted_r[middle - 1] + sorted_r[middle]) / 2.0
        } else {
            sorted_r[middle]
        };
        available(value, "r", sorted_r.len())
    };
    let winning_r: Vec<f64> = r_values
        .iter()
        .copied()
        .filter(|value| *value > 0.0)
        .collect();
    let losing_r: Vec<f64> = r_values
        .iter()
        .copied()
        .filter(|value| *value < 0.0)
        .collect();
    let average_win_r = average(&winning_r, "r", "NO_WIN_R_VALUES");
    let average_loss_r = average(&losing_r, "r", "NO_LOSS_R_VALUES");
    let r_standard_deviation = if r_values.len() < 2 {
        unavailable("r", "AT_LEAST_TWO_R_VALUES_REQUIRED")
    } else {
        let mean = total_r_value / r_values.len() as f64;
        let variance = r_values
            .iter()
            .map(|value| (value - mean).powi(2))
            .sum::<f64>()
            / (r_values.len() - 1) as f64;
        available(variance.sqrt(), "r", r_values.len())
    };
    let system_quality_number = match (average_r.value, r_standard_deviation.value) {
        (Some(mean), Some(deviation)) if deviation > 0.0 && r_values.len() >= 30 => available(
            mean / deviation * (r_values.len() as f64).sqrt(),
            "ratio",
            r_values.len(),
        ),
        _ => unavailable("ratio", "AT_LEAST_30_R_VALUES_REQUIRED"),
    };

    let process_values: Vec<f64> = trades
        .iter()
        .filter_map(|trade| trade.process_score)
        .collect();
    let average_process_score = if process_values.is_empty() {
        unavailable("score_10", "NO_PROCESS_RATINGS")
    } else {
        available(
            process_values.iter().sum::<f64>() / process_values.len() as f64,
            "score_10",
            process_values.len(),
        )
    };
    let execution_values: Vec<f64> = trades
        .iter()
        .filter_map(|trade| trade.execution_score)
        .collect();
    let setup_values: Vec<f64> = trades
        .iter()
        .filter_map(|trade| trade.setup_quality)
        .collect();
    let average_execution_score = average(&execution_values, "score_10", "NO_EXECUTION_RATINGS");
    let average_setup_quality = average(&setup_values, "score_10", "NO_SETUP_RATINGS");

    let plan_adherence = adherence(
        &trades
            .iter()
            .map(|trade| trade.followed_plan)
            .collect::<Vec<_>>(),
        "NO_PLAN_EVALUATIONS",
    );
    let risk_adherence = adherence(
        &trades
            .iter()
            .map(|trade| trade.followed_risk_rules)
            .collect::<Vec<_>>(),
        "NO_RISK_EVALUATIONS",
    );
    let entry_adherence = adherence(
        &trades
            .iter()
            .map(|trade| trade.followed_entry_rules)
            .collect::<Vec<_>>(),
        "NO_ENTRY_EVALUATIONS",
    );
    let exit_adherence = adherence(
        &trades
            .iter()
            .map(|trade| trade.followed_exit_rules)
            .collect::<Vec<_>>(),
        "NO_EXIT_EVALUATIONS",
    );
    let review_completion = if total_trades > 0 {
        available(
            trades
                .iter()
                .filter(|trade| trade.reviewed_at.is_some())
                .count() as f64
                / total_trades as f64,
            "ratio",
            total_trades,
        )
    } else {
        unavailable("ratio", "NO_CLOSED_TRADES")
    };
    let holding_minutes: Vec<f64> = trades
        .iter()
        .filter_map(|trade| {
            let opened = DateTime::parse_from_rfc3339(trade.opened_at.as_deref()?).ok()?;
            let closed = DateTime::parse_from_rfc3339(&trade.closed_at).ok()?;
            Some((closed - opened).num_seconds().max(0) as f64 / 60.0)
        })
        .collect();
    let average_holding_minutes = average(&holding_minutes, "minutes", "NO_VALID_HOLDING_PERIODS");
    let planned_risks: Vec<f64> = trades
        .iter()
        .filter_map(|trade| trade.planned_risk_minor)
        .filter(|value| *value > 0)
        .map(|value| value as f64)
        .collect();
    let average_planned_risk_minor =
        average(&planned_risks, "minor_currency", "NO_PLANNED_RISK_VALUES");
    let total_costs_minor = trades.iter().map(|trade| trade.total_costs_minor).sum();

    let mut equity_curve = Vec::with_capacity(total_trades);
    let mut drawdown_curve = Vec::with_capacity(total_trades);
    let mut cumulative = 0_i64;
    let mut peak = 0_i64;
    let mut max_drawdown_minor = 0_i64;
    let mut current_win_streak = 0_usize;
    let mut current_loss_streak = 0_usize;
    let mut max_win_streak = 0_usize;
    let mut max_loss_streak = 0_usize;
    let mut day_pnl = std::collections::BTreeMap::<String, i64>::new();

    for trade in trades {
        *day_pnl
            .entry(trade.closed_at.chars().take(10).collect())
            .or_default() += trade.net_pnl_minor;
        cumulative += trade.net_pnl_minor;
        peak = peak.max(cumulative);
        let drawdown = peak.saturating_sub(cumulative);
        max_drawdown_minor = max_drawdown_minor.max(drawdown);
        equity_curve.push(EquityPoint {
            id: trade.id.clone(),
            date: trade.closed_at.clone(),
            cumulative_pnl_minor: cumulative,
        });
        drawdown_curve.push(DrawdownPoint {
            date: trade.closed_at.clone(),
            drawdown_minor: drawdown,
        });

        match trade.net_pnl_minor.cmp(&0) {
            std::cmp::Ordering::Greater => {
                current_win_streak += 1;
                current_loss_streak = 0;
                max_win_streak = max_win_streak.max(current_win_streak);
            }
            std::cmp::Ordering::Less => {
                current_loss_streak += 1;
                current_win_streak = 0;
                max_loss_streak = max_loss_streak.max(current_loss_streak);
            }
            std::cmp::Ordering::Equal => {
                current_win_streak = 0;
                current_loss_streak = 0;
            }
        }
    }

    let current_drawdown_minor = drawdown_curve
        .last()
        .map(|point| point.drawdown_minor)
        .unwrap_or(0);
    let drawdowns: Vec<f64> = drawdown_curve
        .iter()
        .map(|point| point.drawdown_minor as f64)
        .collect();
    let average_drawdown_minor = average(&drawdowns, "minor_currency", "NO_CLOSED_TRADES");
    let recovery_factor = if max_drawdown_minor > 0 {
        available(
            net_pnl_minor as f64 / max_drawdown_minor as f64,
            "ratio",
            total_trades,
        )
    } else {
        unavailable("ratio", "NO_DRAWDOWN")
    };
    let profitable_days = day_pnl.values().filter(|value| **value > 0).count();
    let profitable_days_rate = if day_pnl.is_empty() {
        unavailable("ratio", "NO_TRADING_DAYS")
    } else {
        available(
            profitable_days as f64 / day_pnl.len() as f64,
            "ratio",
            day_pnl.len(),
        )
    };
    let best_day_concentration = if net_pnl_minor > 0 {
        available(
            day_pnl.values().copied().max().unwrap_or(0).max(0) as f64 / net_pnl_minor as f64,
            "ratio",
            day_pnl.len(),
        )
    } else {
        unavailable("ratio", "POSITIVE_NET_PNL_REQUIRED")
    };

    DashboardMetrics {
        calculation_version: CALCULATION_VERSION.into(),
        total_trades,
        wins,
        losses,
        break_even,
        net_pnl_minor,
        gross_profit_minor,
        gross_loss_minor,
        win_rate,
        loss_rate,
        profit_factor,
        payoff_ratio,
        expectancy_minor,
        average_winner_minor,
        average_loser_minor,
        total_r,
        average_r,
        median_r,
        average_win_r,
        average_loss_r,
        r_standard_deviation,
        system_quality_number,
        average_process_score,
        average_execution_score,
        average_setup_quality,
        plan_adherence,
        risk_adherence,
        entry_adherence,
        exit_adherence,
        review_completion,
        average_holding_minutes,
        average_planned_risk_minor,
        recovery_factor,
        profitable_days_rate,
        best_day_concentration,
        total_costs_minor,
        max_planned_risk_minor: trades
            .iter()
            .filter_map(|trade| trade.planned_risk_minor)
            .max(),
        largest_winner_minor: trades
            .iter()
            .filter(|trade| trade.net_pnl_minor > 0)
            .map(|trade| trade.net_pnl_minor)
            .max(),
        largest_loser_minor: trades
            .iter()
            .filter(|trade| trade.net_pnl_minor < 0)
            .map(|trade| trade.net_pnl_minor)
            .min(),
        max_win_streak,
        max_loss_streak,
        equity_curve,
        drawdown_curve,
        max_drawdown_minor,
        current_drawdown_minor,
        average_drawdown_minor,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn trade(id: &str, pnl: i64, r: Option<f64>, plan: Option<bool>) -> MetricTrade {
        MetricTrade {
            id: id.into(),
            opened_at: Some(format!("2026-01-0{id}T10:00:00Z")),
            closed_at: format!("2026-01-0{id}T12:00:00Z"),
            net_pnl_minor: pnl,
            planned_risk_minor: Some(5_000),
            total_costs_minor: 0,
            realized_r: r,
            process_score: None,
            execution_score: None,
            setup_quality: None,
            followed_plan: plan,
            followed_risk_rules: None,
            followed_entry_rules: None,
            followed_exit_rules: None,
            reviewed_at: None,
        }
    }

    #[test]
    fn calculates_core_metrics_and_includes_break_even_in_win_rate() {
        let metrics = calculate_dashboard(&[
            trade("1", 10_000, Some(2.0), Some(true)),
            trade("2", -5_000, Some(-1.0), Some(false)),
            trade("3", 0, Some(0.0), None),
        ]);
        assert_eq!(metrics.total_trades, 3);
        assert_eq!(metrics.win_rate.value, Some(1.0 / 3.0));
        assert_eq!(metrics.profit_factor.value, Some(2.0));
        assert_eq!(metrics.total_r.value, Some(1.0));
        assert_eq!(metrics.plan_adherence.value, Some(0.5));
    }

    #[test]
    fn break_even_resets_streaks() {
        let metrics = calculate_dashboard(&[
            trade("1", 100, None, None),
            trade("2", 200, None, None),
            trade("3", 0, None, None),
            trade("4", 300, None, None),
        ]);
        assert_eq!(metrics.max_win_streak, 2);
    }

    #[test]
    fn profit_factor_without_losses_is_special_not_a_rankable_number() {
        let metrics = calculate_dashboard(&[trade("1", 100, None, None)]);
        assert_eq!(metrics.profit_factor.value, None);
        assert_eq!(
            metrics.profit_factor.formatted_special.as_deref(),
            Some("∞")
        );
    }
}
