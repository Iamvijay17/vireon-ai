// Matches our own generated resource ids: <prefix>-<8 alphanumerics>, e.g.
// aud-btclnx2w. New ids are lowercase; legacy ids minted before that switch are
// uppercase (aud-BTCLNX2W) and are still in the DB, so both are accepted. A
// suffix is all-lowercase or all-uppercase, never mixed. Ids are used verbatim
// in URLs and API calls - never case-normalized. Not raw MongoDB ObjectIds -
// those aren't used anywhere in this app anymore.
export const isEntityId = (segment) => /^[a-z]{3}-(?:[0-9a-z]{8}|[0-9A-Z]{8})$/.test(segment);
