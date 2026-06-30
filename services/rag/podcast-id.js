const crypto = require('crypto');

/**
 * Stable, collision-free, URL-safe id for a podcast transcript, derived from its
 * guest/display name (the archive filename stem).
 *
 * Replaces the old `base64(name).slice(0,12)` scheme, which collided for any two
 * names sharing the first ~9 characters (e.g. "Elena Verna 2.0" / "3.0" / "4.0",
 * "Dan Shipper" / "Dan Shipper 2.0"). A 16-hex SHA-1 prefix (64 bits) is unique
 * across this corpus and safe in `/api/podcasts/:id` URLs (no `/` or `+`).
 */
function transcriptId(guestName) {
  return 'podcast-' + crypto.createHash('sha1').update(String(guestName)).digest('hex').slice(0, 16);
}

module.exports = { transcriptId };
