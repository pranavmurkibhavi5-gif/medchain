/**
 * Data access layer with two interchangeable backends.
 *
 *  - MongoDB Atlas when MONGODB_URI is set (production).
 *  - An in-memory store otherwise, so the whole system can be demoed with no
 *    database account at all. The API surface below is identical either way,
 *    so routes never branch on which one is live.
 */
const mongoose = require("mongoose");
const config = require("./index");

let mode = "memory";
let M = null; // mongoose models, when connected

// ---------------------------------------------------------------------------
// In-memory tables
// ---------------------------------------------------------------------------
const mem = {
  users: [],
  records: [],
  logs: [],
  blobs: new Map(),
  seq: 1,
};

const nextId = () => String(mem.seq++);
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const lc = (s) => (s || "").toLowerCase();

// Normalise a mongoose doc or memory row into a plain object with `id`.
function norm(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === "function" ? doc.toObject() : clone(doc);
  o.id = String(o._id || o.id);
  delete o._id;
  delete o.__v;
  return o;
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------
async function connect() {
  if (!config.mongoUri) {
    console.log("[store] MONGODB_URI not set - using in-memory store");
    mode = "memory";
    return mode;
  }
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
    M = require("../models/schemas");
    mode = "mongo";
    console.log("[store] connected to MongoDB Atlas");
  } catch (err) {
    console.error(`[store] MongoDB connection failed (${err.message}) - falling back to memory`);
    mode = "memory";
  }
  return mode;
}

const getMode = () => mode;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
const users = {
  async create(data) {
    const doc = {
      name: data.name,
      email: lc(data.email),
      passwordHash: data.passwordHash,
      role: data.role,
      walletAddress: lc(data.walletAddress || ""),
      encryptionPublicKey: data.encryptionPublicKey || "",
      dateOfBirth: data.dateOfBirth || "",
      bloodGroup: data.bloodGroup || "",
      phone: data.phone || "",
      specialization: data.specialization || "",
      licenseId: data.licenseId || "",
      hospital: data.hospital || "",
      verified: Boolean(data.verified),
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (mode === "mongo") return norm(await M.User.create(doc));
    doc._id = nextId();
    mem.users.push(doc);
    return norm(doc);
  },

  async findByEmail(email) {
    if (mode === "mongo") return norm(await M.User.findOne({ email: lc(email) }));
    return norm(mem.users.find((u) => u.email === lc(email)));
  },

  async findById(id) {
    if (mode === "mongo") {
      if (!mongoose.isValidObjectId(id)) return null;
      return norm(await M.User.findById(id));
    }
    return norm(mem.users.find((u) => u._id === String(id)));
  },

  async findByWallet(wallet) {
    if (!wallet) return null;
    if (mode === "mongo") return norm(await M.User.findOne({ walletAddress: lc(wallet) }));
    return norm(mem.users.find((u) => u.walletAddress === lc(wallet)));
  },

  async list(filter = {}) {
    if (mode === "mongo") {
      const q = {};
      if (filter.role) q.role = filter.role;
      const docs = await M.User.find(q).sort({ createdAt: -1 }).limit(500);
      return docs.map(norm);
    }
    return mem.users
      .filter((u) => (filter.role ? u.role === filter.role : true))
      .slice()
      .reverse()
      .map(norm);
  },

  async update(id, patch) {
    if (mode === "mongo") {
      if (!mongoose.isValidObjectId(id)) return null;
      return norm(await M.User.findByIdAndUpdate(id, { $set: patch }, { new: true }));
    }
    const u = mem.users.find((x) => x._id === String(id));
    if (!u) return null;
    Object.assign(u, patch, { updatedAt: new Date().toISOString() });
    return norm(u);
  },

  async count(role) {
    if (mode === "mongo") return M.User.countDocuments(role ? { role } : {});
    return mem.users.filter((u) => (role ? u.role === role : true)).length;
  },

  /** Search doctors/patients by name, email or wallet. */
  async search(role, term) {
    const t = (term || "").trim().toLowerCase();
    const all = await users.list({ role });
    if (!t) return all;
    return all.filter(
      (u) =>
        u.name.toLowerCase().includes(t) ||
        u.email.toLowerCase().includes(t) ||
        (u.walletAddress || "").includes(t)
    );
  },
};

// ---------------------------------------------------------------------------
// Record metadata (mirror of on-chain data + sealed key envelopes)
// ---------------------------------------------------------------------------
const records = {
  async create(data) {
    const doc = {
      recordId: Number(data.recordId || 0),
      owner: lc(data.owner),
      cid: data.cid,
      dataHash: data.dataHash,
      fileName: data.fileName || "",
      fileType: data.fileType || "",
      fileSize: Number(data.fileSize || 0),
      recordType: data.recordType || "Other",
      notes: data.notes || "",
      txHash: data.txHash || "",
      blockNumber: Number(data.blockNumber || 0),
      wrappedKeys: data.wrappedKeys || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (mode === "mongo") return norm(await M.RecordMeta.create(doc));
    doc._id = nextId();
    mem.records.push(doc);
    return norm(doc);
  },

  async findByCid(cid) {
    if (mode === "mongo") return norm(await M.RecordMeta.findOne({ cid }));
    return norm(mem.records.find((r) => r.cid === cid));
  },

  async findByRecordId(recordId) {
    const id = Number(recordId);
    if (mode === "mongo") return norm(await M.RecordMeta.findOne({ recordId: id }));
    return norm(mem.records.find((r) => r.recordId === id));
  },

  async listByOwner(owner) {
    if (mode === "mongo") {
      const docs = await M.RecordMeta.find({ owner: lc(owner) }).sort({ createdAt: -1 });
      return docs.map(norm);
    }
    return mem.records
      .filter((r) => r.owner === lc(owner))
      .slice()
      .reverse()
      .map(norm);
  },

  async listAll() {
    if (mode === "mongo") {
      const docs = await M.RecordMeta.find({}).sort({ createdAt: -1 }).limit(500);
      return docs.map(norm);
    }
    return mem.records.slice().reverse().map(norm);
  },

  async update(id, patch) {
    if (mode === "mongo") {
      if (!mongoose.isValidObjectId(id)) return null;
      return norm(await M.RecordMeta.findByIdAndUpdate(id, { $set: patch }, { new: true }));
    }
    const r = mem.records.find((x) => x._id === String(id));
    if (!r) return null;
    Object.assign(r, patch, { updatedAt: new Date().toISOString() });
    return norm(r);
  },

  /** Seal a data key for another wallet (idempotent per address). */
  async putWrappedKey(recordId, forAddress, envelope) {
    const addr = lc(forAddress);
    const entry = { forAddress: addr, envelope, grantedAt: new Date().toISOString() };
    if (mode === "mongo") {
      await M.RecordMeta.updateOne(
        { recordId: Number(recordId) },
        { $pull: { wrappedKeys: { forAddress: addr } } }
      );
      const doc = await M.RecordMeta.findOneAndUpdate(
        { recordId: Number(recordId) },
        { $push: { wrappedKeys: entry } },
        { new: true }
      );
      return norm(doc);
    }
    const r = mem.records.find((x) => x.recordId === Number(recordId));
    if (!r) return null;
    r.wrappedKeys = (r.wrappedKeys || []).filter((k) => k.forAddress !== addr);
    r.wrappedKeys.push(entry);
    return norm(r);
  },

  async removeWrappedKey(recordId, forAddress) {
    const addr = lc(forAddress);
    if (mode === "mongo") {
      await M.RecordMeta.updateOne(
        { recordId: Number(recordId) },
        { $pull: { wrappedKeys: { forAddress: addr } } }
      );
      return true;
    }
    const r = mem.records.find((x) => x.recordId === Number(recordId));
    if (r) r.wrappedKeys = (r.wrappedKeys || []).filter((k) => k.forAddress !== addr);
    return true;
  },

  /** Drop every key sealed for `forAddress` across all records of `owner`. */
  async removeWrappedKeysForOwner(owner, forAddress) {
    const addr = lc(forAddress);
    if (mode === "mongo") {
      await M.RecordMeta.updateMany(
        { owner: lc(owner) },
        { $pull: { wrappedKeys: { forAddress: addr } } }
      );
      return true;
    }
    mem.records
      .filter((r) => r.owner === lc(owner))
      .forEach((r) => {
        r.wrappedKeys = (r.wrappedKeys || []).filter((k) => k.forAddress !== addr);
      });
    return true;
  },

  async count() {
    if (mode === "mongo") return M.RecordMeta.countDocuments({});
    return mem.records.length;
  },
};

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
const logs = {
  async add(entry) {
    const doc = {
      action: entry.action,
      actor: lc(entry.actor || ""),
      actorRole: entry.actorRole || "",
      target: lc(entry.target || ""),
      recordId: Number(entry.recordId || 0),
      txHash: entry.txHash || "",
      detail: entry.detail || "",
      ip: entry.ip || "",
      at: new Date().toISOString(),
    };
    if (mode === "mongo") return norm(await M.AuditLog.create(doc));
    doc._id = nextId();
    mem.logs.push(doc);
    if (mem.logs.length > 5000) mem.logs.shift();
    return norm(doc);
  },

  async list({ actor, target, limit = 200 } = {}) {
    if (mode === "mongo") {
      const q = {};
      if (actor) q.actor = lc(actor);
      if (target) q.target = lc(target);
      const docs = await M.AuditLog.find(q).sort({ at: -1 }).limit(Number(limit));
      return docs.map(norm);
    }
    return mem.logs
      .filter((l) => (actor ? l.actor === lc(actor) : true))
      .filter((l) => (target ? l.target === lc(target) : true))
      .slice()
      .reverse()
      .slice(0, Number(limit))
      .map(norm);
  },

  /** Everything involving this wallet, as actor or as subject. */
  async listInvolving(wallet, limit = 200) {
    const w = lc(wallet);
    if (mode === "mongo") {
      const docs = await M.AuditLog.find({ $or: [{ actor: w }, { target: w }] })
        .sort({ at: -1 })
        .limit(Number(limit));
      return docs.map(norm);
    }
    return mem.logs
      .filter((l) => l.actor === w || l.target === w)
      .slice()
      .reverse()
      .slice(0, Number(limit))
      .map(norm);
  },

  async count() {
    if (mode === "mongo") return M.AuditLog.countDocuments({});
    return mem.logs.length;
  },
};

// ---------------------------------------------------------------------------
// Blob fallback (used only when Pinata is not configured)
// ---------------------------------------------------------------------------
const blobs = {
  async put(cid, buffer) {
    if (mode === "mongo") {
      await M.Blob.updateOne(
        { cid },
        { $set: { cid, data: buffer, size: buffer.length, createdAt: new Date() } },
        { upsert: true }
      );
      return cid;
    }
    mem.blobs.set(cid, buffer);
    return cid;
  },

  async get(cid) {
    if (mode === "mongo") {
      const doc = await M.Blob.findOne({ cid });
      return doc ? Buffer.from(doc.data) : null;
    }
    return mem.blobs.get(cid) || null;
  },

  async has(cid) {
    if (mode === "mongo") return Boolean(await M.Blob.exists({ cid }));
    return mem.blobs.has(cid);
  },
};

module.exports = { connect, getMode, users, records, logs, blobs };
