//! Bounded immutable public-data snapshots for optional, authenticated readers.
pub mod atlas_readers;
pub mod cache;
pub mod macro_readers;
pub mod manifest;
pub mod readers;
pub mod report_readers;
pub mod schema;
pub mod seasonality_extended;

#[cfg(test)]
mod tests;
