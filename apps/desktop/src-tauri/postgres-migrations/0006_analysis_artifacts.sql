-- Add only explicitly reviewed analysis families; existing generations and
-- personal data remain immutable. Temporary per-artifact byte limits are kept.
ALTER TABLE cloud_public_transports DROP CONSTRAINT cloud_public_transports_kind_check;
ALTER TABLE cloud_public_transports ADD CONSTRAINT cloud_public_transports_kind_check
  CHECK (kind IN ('rates','seasonality-index','seasonality-symbol','macro','cot',
    'technicals','regime','atlas','bonds','central-bank-reports'));
ALTER TABLE cloud_public_transports DROP CONSTRAINT cloud_public_transports_artifact_key_check;
ALTER TABLE cloud_public_transports ADD CONSTRAINT cloud_public_transports_artifact_key_check
  CHECK (octet_length(artifact_key) BETWEEN 1 AND 256);
