UPDATE macro_feed_observations
SET verification_status = 'rejected'
WHERE observation_kind = 'forecast'
  AND verification_status = 'pre_release'
  AND source_published_at IS NOT NULL
  AND julianday(source_published_at) >= julianday((
    SELECT scheduled_at_utc
    FROM macro_feed_release_events
    WHERE id = macro_feed_observations.event_id
  ));
