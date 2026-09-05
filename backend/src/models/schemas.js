const mongoose = require("mongoose");

/**
 * Mongoose schemas. Only used when MONGODB_URI is configured; otherwise the
 * store falls back to an equivalent in-memory implementation.
 *
 * Note what is deliberately NOT here: no plaintext medical data, no encryption
 * keys in the clear. `wrappedKeys` holds AES data keys already sealed to a
 * specific wallet's public key, so the database alone reveals nothing.
 */

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["patient", "doctor", "admin"], required: true },
    walletAddress: { type: String, default: "", lowercase: true, index: true },

    // secp256k1 public key of the browser-derived app key (hex, uncompressed).
    // Used to seal record keys to this user. Never a private key.
    encryptionPublicKey: { type: String, default: "" },

    // Embedded-wallet vault: the user's Ethereum private key sealed under a
    // key derived from their password in the browser. Ciphertext only - the
    // server cannot open it and never sees the password.
    vault: { type: Object, default: null },
    vaultSalt: { type: String, default: "" },

    // Patient fields
    dateOfBirth: { type: String, default: "" },
    bloodGroup: { type: String, default: "" },
    phone: { type: String, default: "" },

    // Doctor fields
    specialization: { type: String, default: "" },
    licenseId: { type: String, default: "" },
    hospital: { type: String, default: "" },
    verified: { type: Boolean, default: false },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const WrappedKeySchema = new mongoose.Schema(
  {
    // lowercase wallet address the key is sealed for
    forAddress: { type: String, required: true, lowercase: true },
    // ECIES envelope: { ephemeralPublicKey, iv, ciphertext } base64
    envelope: { type: Object, required: true },
    grantedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const RecordMetaSchema = new mongoose.Schema(
  {
    // on-chain record id; 0 until the tx confirms
    recordId: { type: Number, default: 0, index: true },
    owner: { type: String, required: true, lowercase: true, index: true },
    cid: { type: String, required: true },
    dataHash: { type: String, required: true },
    fileName: { type: String, default: "" },
    fileType: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },
    recordType: { type: String, default: "Other" },
    notes: { type: String, default: "" },
    txHash: { type: String, default: "" },
    blockNumber: { type: Number, default: 0 },
    wrappedKeys: { type: [WrappedKeySchema], default: [] },
  },
  { timestamps: true }
);

const AuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    actor: { type: String, default: "", lowercase: true },
    actorRole: { type: String, default: "" },
    target: { type: String, default: "", lowercase: true },
    recordId: { type: Number, default: 0 },
    txHash: { type: String, default: "" },
    detail: { type: String, default: "" },
    ip: { type: String, default: "" },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

const BlobSchema = new mongoose.Schema(
  {
    cid: { type: String, required: true, unique: true, index: true },
    data: { type: Buffer, required: true },
    size: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// The patient's health details. Stored exactly like a record: the server holds
// ciphertext plus per-recipient sealed keys, and can read neither. `envelope`
// is the AES-256-GCM output produced in the browser; `wrappedKeys` holds that
// data key sealed to the patient and to each doctor they have approved.
const HealthProfileSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true, unique: true, lowercase: true, index: true },
    envelope: { type: Object, required: true },
    wrappedKeys: { type: [WrappedKeySchema], default: [] },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

module.exports = {
  User: mongoose.model("User", UserSchema),
  HealthProfile: mongoose.model("HealthProfile", HealthProfileSchema),
  RecordMeta: mongoose.model("RecordMeta", RecordMetaSchema),
  AuditLog: mongoose.model("AuditLog", AuditLogSchema),
  Blob: mongoose.model("Blob", BlobSchema),
};
