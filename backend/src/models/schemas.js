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

    // A second sealed copy of the same wallet key, locked with a high-entropy
    // recovery code the user keeps. The server holds two blobs it cannot open
    // and no way to derive either secret.
    recoveryVault: { type: Object, default: null },
    recoverySalt: { type: String, default: "" },
    recoverySetAt: { type: Date, default: null },

    // A pending email verification code. Only its bcrypt hash is stored, so
    // a database dump does not hand over live codes, and the attempt counter
    // stops it being brute-forced within its short life.
    verifyCode: {
      hash: { type: String, default: "" },
      purpose: { type: String, default: "" },
      expiresAt: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
    },

    // Patient fields
    dateOfBirth: { type: String, default: "" },
    bloodGroup: { type: String, default: "" },
    phone: { type: String, default: "" },

    // Doctor fields
    specialization: { type: String, default: "" },
    licenseId: { type: String, default: "" },
    hospital: { type: String, default: "" },
    verified: { type: Boolean, default: false },

    // Professional details a patient sees before choosing a doctor. All
    // self-declared and non-clinical, so they are stored in the clear - they
    // are meant to be read by strangers, which is the point of a directory.
    qualification: { type: String, default: "" },
    experienceYears: { type: Number, default: 0 },
    location: { type: String, default: "" },
    availability: { type: String, default: "" },
    about: { type: String, default: "" },
    expertise: { type: [String], default: [] },

    // Consultation fee and the doctor's own UPI address, both self-declared.
    // Shown to a patient booking with them so they can pay directly; no
    // payment address is hardcoded anywhere in this project.
    consultationFee: { type: Number, default: 0 },
    upiId: { type: String, default: "" },

    // Profile photo, kept small and stored here rather than on IPFS.
    // An avatar has to be readable by other users, so it cannot be encrypted
    // like a record; and IPFS content is effectively permanent, which would
    // make "remove photo" a lie. Storing it here means removing it removes it.
    avatar: {
      data: { type: String, default: "" }, // base64, already resized in the browser
      type: { type: String, default: "" },
      updatedAt: { type: Date, default: null },
    },

    // A doctor may upload the QR their own bank issued, instead of typing a
    // UPI ID and letting the app draw one. Same storage reasoning as the
    // avatar: it is meant to be shown to patients, and it must be removable.
    paymentQr: {
      data: { type: String, default: "" },
      type: { type: String, default: "" },
      updatedAt: { type: Date, default: null },
    },

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

// An appointment between a patient and a doctor.
//
// Deliberately off-chain. The contract governs custody of medical records and
// is fixed; scheduling is coordination, needs to be changed and cancelled
// freely, and gains nothing from immutability. Putting it on-chain would also
// publish who is seeing which specialist, forever.
//
// The parties, time and status are stored in the clear because the server has
// to list and sort them. `reasonEnvelope` is not: what the patient is coming
// in for is clinical, so it is encrypted in the browser and sealed to the
// patient and that one doctor, exactly like a record.
const AppointmentSchema = new mongoose.Schema(
  {
    patient: { type: String, required: true, lowercase: true, index: true },
    doctor: { type: String, required: true, lowercase: true, index: true },
    patientName: { type: String, default: "" },
    doctorName: { type: String, default: "" },
    scheduledFor: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["requested", "confirmed", "declined", "cancelled", "completed"],
      default: "requested",
      index: true,
    },
    reasonEnvelope: { type: Object, default: null },
    reasonKeys: { type: [WrappedKeySchema], default: [] },
    reply: { type: String, default: "" },

    // Payment is recorded honestly rather than optimistically.
    //
    // A static UPI address has no callback, so the server cannot know that
    // money arrived. "claimed" means the patient says they paid; "confirmed"
    // means the doctor checked their own UPI app and said so. Only the doctor
    // can move it to confirmed, because only the doctor can actually see the
    // money. The app never marks a payment successful on its own.
    payment: {
      amount: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ["none", "claimed", "confirmed", "waived"],
        default: "none",
      },
      // The UTR (Unique Transaction Reference) the patient reads off their
      // UPI app. The server checks its shape and that no other appointment
      // already quotes it; it cannot check it against a bank, because that
      // needs a payment gateway this project does not have. The doctor
      // matching it to their own statement is still the real verification.
      utr: { type: String, default: "" },
      claimedAt: { type: Date, default: null },
      confirmedAt: { type: Date, default: null },
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// A message between a patient and a doctor.
//
// The body is ciphertext sealed to the two participants, so the server holds
// something it cannot read. `expiresAt` is set when the recipient first opens
// the message and MongoDB removes the row on its own from that point - the
// index below is what actually deletes it, not application code that might
// never run.
const MessageSchema = new mongoose.Schema(
  {
    thread: { type: String, required: true, index: true },
    from: { type: String, required: true, lowercase: true, index: true },
    to: { type: String, required: true, lowercase: true, index: true },
    fromName: { type: String, default: "" },
    envelope: { type: Object, required: true },
    keys: { type: [WrappedKeySchema], default: [] },
    sentAt: { type: Date, default: Date.now },
    readAt: { type: Date, default: null },
    // Null until read, so an unread message is never removed.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: false }
);

// TTL index: Mongo deletes a document once expiresAt passes. Documents with a
// null expiresAt are ignored by the TTL monitor, which is exactly what an
// unread message needs.
MessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = {
  User: mongoose.model("User", UserSchema),
  Message: mongoose.model("Message", MessageSchema),
  Appointment: mongoose.model("Appointment", AppointmentSchema),
  HealthProfile: mongoose.model("HealthProfile", HealthProfileSchema),
  RecordMeta: mongoose.model("RecordMeta", RecordMetaSchema),
  AuditLog: mongoose.model("AuditLog", AuditLogSchema),
  Blob: mongoose.model("Blob", BlobSchema),
};
