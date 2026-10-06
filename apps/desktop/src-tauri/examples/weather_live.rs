//! Explicit public-provider smoke check; never opens the journal database.
use personal_macro_desktop_lib::commands::{WeatherInput, get_weather_forecast};

#[tokio::main]
async fn main() {
    for asset_id in ["coffee-arabica", "cocoa", "wheat-winter"] {
        match get_weather_forecast(WeatherInput {
            asset_id: asset_id.into(),
        })
        .await
        {
            Ok(data) => {
                let codes_present = data.responses.iter().all(|row| {
                    row["daily"]["weather_code"]
                        .as_array()
                        .is_some_and(|codes| codes.len() == 21)
                });
                if !codes_present {
                    eprintln!("{}: daily weather codes missing", asset_id);
                    std::process::exit(1);
                }
                println!(
                    "{}",
                    serde_json::json!({"assetId": data.asset_id, "fetchedAt": data.fetched_at, "points": data.point_ids.len(), "validated": true, "weatherCodesReturned": codes_present})
                );
            }
            Err(error) => {
                eprintln!("{}: {} · {}", asset_id, error.code, error.message);
                std::process::exit(1);
            }
        }
    }
}
