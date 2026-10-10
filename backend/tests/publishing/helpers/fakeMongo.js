/**
 * A small in-memory stand-in for the slice of Mongoose the publishing code
 * uses, so the state machine (atomic claim, lease-guarded writes, partial
 * unique index, $push/$slice events, ...) is exercised for real instead of
 * being mocked away. No database, no network.
 *
 * It implements only what publishing relies on: equality / dotted paths,
 * $in $nin $lt $lte $gt $gte $ne $exists $type $or $and in filters, and
 * $set $unset $inc $push($each,$slice) in updates. If production code starts
 * using another operator the fake throws, rather than silently matching.
 */

const clone = (value) => {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
};

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  o[keys.at(-1)] = value;
}

function unsetPath(obj, path) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (o == null) return;
    o = o[k];
  }
  if (o != null) delete o[keys.at(-1)];
}

const cmpValue = (v) => (v instanceof Date ? v.getTime() : v);

function matchCondition(actual, cond) {
  if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, expected]) => {
      const a = cmpValue(actual);
      const e = cmpValue(expected);
      switch (op) {
        case '$in': return expected.some((x) => cmpValue(x) === a);
        case '$nin': return !expected.some((x) => cmpValue(x) === a);
        case '$lt': return a != null && a < e;
        case '$lte': return a != null && a <= e;
        case '$gt': return a != null && a > e;
        case '$gte': return a != null && a >= e;
        case '$ne': return a !== e;
        case '$exists': return (actual !== undefined) === expected;
        case '$type': return expected === 'string' ? typeof actual === 'string' : false;
        default: throw new Error(`fakeMongo: unsupported operator ${op}`);
      }
    });
  }
  // Mongo treats null as "missing or null".
  if (cond === null) return actual == null;
  return cmpValue(actual) === cmpValue(cond);
}

function matches(doc, filter) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    if (key === '$and') return cond.every((f) => matches(doc, f));
    if (key.startsWith('$')) throw new Error(`fakeMongo: unsupported top-level operator ${key}`);
    return matchCondition(getPath(doc, key), cond);
  });
}

function applyUpdate(doc, update) {
  for (const [op, fields] of Object.entries(update)) {
    if (op === '$set') Object.entries(fields).forEach(([k, v]) => setPath(doc, k, clone(v)));
    else if (op === '$unset') Object.keys(fields).forEach((k) => unsetPath(doc, k));
    else if (op === '$inc') Object.entries(fields).forEach(([k, v]) => setPath(doc, k, (getPath(doc, k) || 0) + v));
    else if (op === '$push') {
      Object.entries(fields).forEach(([k, v]) => {
        const arr = getPath(doc, k) || [];
        const items = v && v.$each ? v.$each.map(clone) : [clone(v)];
        let next = [...arr, ...items];
        if (v && v.$slice !== undefined) next = v.$slice < 0 ? next.slice(v.$slice) : next.slice(0, v.$slice);
        setPath(doc, k, next);
      });
    } else throw new Error(`fakeMongo: unsupported update operator ${op}`);
  }
}

function createModel({ name, idPrefix = 'id', defaults = () => ({}), unique = [], hidden = [], jsonHidden = [] }) {
  const rows = [];
  let seq = 0;

  const present = (row, { includeHidden = [] } = {}) => {
    const out = clone(row);
    for (const path of hidden) if (!includeHidden.includes(path)) unsetPath(out, path);
    Object.defineProperty(out, 'toObject', { value: () => clone(row), enumerable: false });
    Object.defineProperty(out, 'toJSON', {
      value: () => {
        const json = clone(row);
        for (const path of [...hidden, ...jsonHidden]) unsetPath(json, path);
        return json;
      },
      enumerable: false,
    });
    return out;
  };

  const checkUnique = (candidate, selfId) => {
    for (const path of unique) {
      const value = getPath(candidate, path);
      if (typeof value !== 'string') continue;
      if (rows.some((r) => r._id !== selfId && getPath(r, path) === value)) {
        const err = new Error(`E11000 duplicate key (${path})`);
        err.code = 11000;
        throw err;
      }
    }
  };

  class Query {
    constructor(run) { this.run = run; this.include = []; this._sort = null; this._skip = 0; this._limit = Infinity; }
    select(spec) { String(spec || '').split(/\s+/).filter((s) => s.startsWith('+')).forEach((s) => this.include.push(s.slice(1))); return this; }
    lean() { this.isLean = true; return this; }
    sort(spec) { this._sort = spec; return this; }
    skip(n) { this._skip = n; return this; }
    limit(n) { this._limit = n; return this; }
    then(resolve, reject) { return Promise.resolve().then(() => this.run(this)).then(resolve, reject); }
  }

  const Model = {
    modelName: name,
    rows,
    reset() { rows.length = 0; seq = 0; },
    seed(doc) { const row = { ...defaults(), ...clone(doc) }; row._id = row._id || `${idPrefix}-seed${++seq}`; rows.push(row); return row; },

    async create(doc) {
      const row = { ...defaults(), ...clone(doc) };
      row._id = row._id || `${idPrefix}-${String(++seq).padStart(8, '0')}`;
      row.createdAt = row.createdAt || new Date();
      row.updatedAt = new Date();
      checkUnique(row, row._id);
      rows.push(row);
      return present(row);
    },
    findOne(filter = {}) {
      return new Query((q) => {
        const row = rows.find((r) => matches(r, filter));
        return row ? (q.isLean ? clone(row) : present(row, { includeHidden: q.include })) : null;
      });
    },
    findById(id) { return Model.findOne({ _id: id }); },
    find(filter = {}) {
      return new Query((q) => {
        let found = rows.filter((r) => matches(r, filter));
        if (q._sort) {
          const [[key, dir]] = Object.entries(q._sort);
          found = [...found].sort((a, b) => (cmpValue(getPath(a, key)) > cmpValue(getPath(b, key)) ? 1 : -1) * dir);
        }
        found = found.slice(q._skip, q._skip + q._limit);
        return found.map((r) => (q.isLean ? clone(r) : present(r, { includeHidden: q.include })));
      });
    },
    async countDocuments(filter = {}) { return rows.filter((r) => matches(r, filter)).length; },
    async exists(filter = {}) { const r = rows.find((x) => matches(x, filter)); return r ? { _id: r._id } : null; },
    findOneAndUpdate(filter, update, options = {}) {
      return new Query((q) => {
        let row = rows.find((r) => matches(r, filter));
        if (!row && options.upsert) {
          row = { ...defaults(), _id: `${idPrefix}-${String(++seq).padStart(8, '0')}`, createdAt: new Date() };
          Object.entries(filter).forEach(([k, v]) => { if (!k.startsWith('$') && (v === null || typeof v !== 'object')) setPath(row, k, v); });
          rows.push(row);
        }
        if (!row) return null;
        const next = clone(row);
        applyUpdate(next, update);
        checkUnique(next, row._id);
        next.updatedAt = new Date();
        Object.keys(row).forEach((k) => delete row[k]);
        Object.assign(row, next);
        return options.new === false ? null : present(row, { includeHidden: q.include });
      });
    },
    findByIdAndUpdate(id, update, options) { return Model.findOneAndUpdate({ _id: id }, update, options); },
    async updateOne(filter, update) {
      const row = rows.find((r) => matches(r, filter));
      if (row) applyUpdate(row, update);
      return { matchedCount: row ? 1 : 0 };
    },
    async updateMany(filter, update) {
      const hit = rows.filter((r) => matches(r, filter));
      hit.forEach((r) => { applyUpdate(r, update); r.updatedAt = new Date(); });
      return { matchedCount: hit.length, modifiedCount: hit.length };
    },
    async deleteOne(filter) {
      const i = rows.findIndex((r) => matches(r, filter));
      if (i >= 0) rows.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    },
    findOneAndDelete(filter) {
      return new Query(() => {
        const i = rows.findIndex((r) => matches(r, filter));
        if (i < 0) return null;
        const [row] = rows.splice(i, 1);
        return present(row);
      });
    },
  };
  return Model;
}

const jobDefaults = () => ({
  status: 'DRAFT', attempts: 0, maxAttempts: 5, deferrals: 0, processingChecks: 0, nextRetryAt: null,
  metadata: {}, source: {}, progress: { percent: 0, bytesUploaded: 0, bytesTotal: 0, phase: '' },
  remote: { videoId: '', url: '', studioUrl: '', sessionEnc: '', uploadStatus: '', privacyStatus: '', processingState: '' },
  lease: { owner: '', expiresAt: null }, error: { code: '', message: '', action: '', retryable: false, httpStatus: null, at: null },
  exportOptions: { includeMedia: true, includeCaptions: true, allowIncomplete: false },
  exportResult: { bucket: '', key: '', fileName: '', size: 0, validation: null, totals: null },
  events: [], quotaCountedAt: null, fingerprint: '',
});

const makeJobModel = () => createModel({
  name: 'PublishingJob', idPrefix: 'pub', defaults: jobDefaults, unique: ['dedupeKey'],
  hidden: ['remote.sessionEnc'], jsonHidden: ['dedupeKey', 'lease', 'exportResult.bucket', 'exportResult.key', 'source.bucket', 'source.key'],
});

const makeAccountModel = () => createModel({
  name: 'PlatformAccount', idPrefix: 'pac',
  defaults: () => ({ status: 'connected', statusReason: '', scopes: [] }),
  unique: [], hidden: ['refreshTokenEnc', 'accessTokenEnc'],
});

const socialPostDefaults = () => ({
  status: 'DRAFT', attempts: 0, maxAttempts: 5, retryCount: 0, deferrals: 0, processingChecks: 0, nextRetryAt: null, scheduledFor: null, timezone: '',
  content: { caption: '', hashtags: [], cta: '', linkUrl: '' }, media: { kind: '', bucket: '', key: '', size: 0, etag: '', contentType: '', fileName: '', durationSec: null, width: null, height: null },
  progress: { percent: 0, bytesUploaded: 0, bytesTotal: 0, phase: '' },
  remote: { containerId: '', videoId: '', postId: '', permalink: '', state: '', publishAttemptedAt: null, publishedAt: null },
  lease: { owner: '', expiresAt: null }, error: { code: '', message: '', action: '', retryable: false, requiresReauth: false, httpStatus: null, at: null },
  insights: { fetchedAt: null, metrics: null, error: '' }, events: [], quotaCountedAt: null, fingerprint: '',
});

const makeSocialPostModel = () => {
  const model = createModel({
    name: 'SocialPost', idPrefix: 'spo', defaults: socialPostDefaults, unique: ['dedupeKey'],
    jsonHidden: ['dedupeKey', 'lease', 'media.bucket', 'media.key'],
  });
  model.ACTIVE_STATUSES = ['VALIDATING', 'UPLOADING', 'PROCESSING'];
  return model;
};

const makeCampaignModel = () => {
  const model = createModel({
    name: 'SocialCampaign', idPrefix: 'cam',
    defaults: () => ({ status: 'draft', source: {}, brief: {}, media: null, thumbnail: null, variants: {} }),
    jsonHidden: ['media.bucket', 'media.key', 'thumbnail.bucket', 'thumbnail.key'],
  });
  model.TONES = ['professional', 'educational', 'entertaining', 'promotional', 'casual'];
  return model;
};

const makeStateModel = () => createModel({ name: 'OAuthState', idPrefix: 'st', unique: ['stateHash'] });

module.exports = { createModel, makeJobModel, makeAccountModel, makeStateModel, makeSocialPostModel, makeCampaignModel, clone };
