const mongoose = require('mongoose');

// Generic cheap counter/aggregate store (one tiny doc per metric key) for
// platform metrics that aren't worth their own collection - cache hit/miss
// counts, cumulative TTS synthesis time, etc. `count` + `sum` is enough to
// derive both totals and averages without ever reading historical rows back.
const metricSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  count: { type: Number, default: 0 },
  sum: { type: Number, default: 0 },
});

module.exports = mongoose.model('Metric', metricSchema);
