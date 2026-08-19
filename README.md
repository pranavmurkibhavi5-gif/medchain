# Blockchain-Based Secure Medical Record

Final-year project — Department of Computer Science and Business Systems,
S.G. Balekundri Institute of Technology, Belagavi (VTU).

A patient-controlled electronic medical record system. Files are encrypted in
the browser, stored off-chain on IPFS, and anchored to Ethereum by cryptographic
hash. Doctors must request access; patients approve, reject and revoke — and
every one of those decisions is a permanent blockchain event.

---

## The one rule that shapes everything

**The complete medical file is never stored on the blockchain.** Only the
keccak256 hash of the *encrypted* file, its IPFS CID and small metadata go
on-chain. That keeps gas costs flat regardless of file size, and still lets
anyone prove a file has not been altered by re-hashing it.

---

## Architecture

```
React + Vite + Tailwind  (Vercel)
        |  ethers.js + MetaMask
        v
Node.js + Express API    (Render)
        |                         \
        v                          v
MedicalRecord.sol            IPFS / Pinata
(Ethereum Sepolia)           (encrypted blobs)
        |
        v
MongoDB Atlas (optional metadata mirror)
```

### What runs where

| Layer | Technology | Holds |
|-------|-----------|-------|
| Frontend | React 18, Vite, Tailwind, ethers v6 | Plaintext, briefly, in memory only |
| Backend | Node.js, Express, JWT | Ciphertext and *sealed* keys — never readable |
| Contract | Solidity 0.8.24, Hardhat | Hashes, CIDs, permissions, audit events |
| Storage | IPFS via Pinata | Encrypted blobs only |
| Database | MongoDB Atlas (optional) | Account records and metadata |

---

## Security model

### Upload path

```
select file -> validate -> AES-256-GCM encrypt (browser)
   -> upload ciphertext to IPFS -> receive CID
   -> keccak256(ciphertext) -> store hash + CID on-chain
   -> transaction confirmed -> record appears in dashboard
```

### How keys work without ever exposing a private key

MetaMask will not export a private key, so the app derives one instead. Each
user signs a fixed domain-separated message; MetaMask's ECDSA is deterministic
(RFC 6979), so that signature is stable, and hashing it yields a stable
secp256k1 keypair that lives only in browser memory for the session. The server
learns only the public half.

- Every record gets a fresh random AES-256 data key.
- The data key is sealed to a recipient's public key using ECIES
  (ephemeral ECDH → HKDF-SHA256 → AES-GCM).
- Granting a doctor access re-seals that data key to *their* public key.
- Revoking deletes those sealed envelopes **and** flips the on-chain permission.

### Two independent gates

A doctor reading a record must pass both:

1. `hasAccess(patient, doctor, recordId)` on the smart contract — re-checked
   server-side, so a client cannot simply claim access.
2. Possession of a key envelope sealed to their own public key.

Revoking either one makes the record unreadable. The server itself holds no
decryption key and cannot read a single record — nor can an administrator.

---

## Roles

**Patient** — register, connect MetaMask, upload and encrypt records, view and
download their own, approve/reject requests, grant and revoke doctor access,
view access history and transaction details.

**Doctor** — register, connect MetaMask, search patients, request access with a
reason, track request status, open authorised records (blocked the instant
access is revoked), view their own activity.

**Admin** — dashboard of users, doctors, patients, records and system health;
enable/disable accounts; verify doctor licences; inspect the on-chain event
trail and the application audit log. Cannot read any medical content.

---

## Current configuration

The `.env` files ship configured for **Sepolia**, ready for public deployment —
you only need to paste in a contract address after deploying. Go straight to
**[DEPLOYMENT.md](DEPLOYMENT.md)** for that.

To develop or demo locally first, follow the Quick start below and switch the
three chain settings to local values (documented in DEPLOYMENT.md under
*Switching the local setup between networks*).

---

## Quick start (local, ~5 minutes)

```bash
npm run setup
```

Then use **three terminals**:

```bash
npm run chain
```

```bash
npm run deploy:local
```

```bash
npm run backend
```

…and a fourth for the UI:

```bash
npm run frontend
```

Open http://localhost:5173. Sign in as the demo admin with
`admin@bmr.local` / `Admin@12345`, or register a patient and doctor.

> `deploy:local` writes the contract address and ABI straight into
> `frontend/src/abi/` and `backend/src/abi/`. Copy the printed address into
> `backend/.env` (`CONTRACT_ADDRESS`) and `frontend/.env`
> (`VITE_CONTRACT_ADDRESS`), then restart both.

To use MetaMask against the local chain, add a network with RPC
`http://127.0.0.1:8545` and chain ID `31337`, and import one of the private
keys the `npm run chain` terminal prints.

### Runs with zero external accounts

Without `MONGODB_URI` the API uses an in-memory store; without `PINATA_JWT` it
stores encrypted blobs in local content-addressed storage using real CIDv1
identifiers. The complete flow works either way — add the cloud services when
you deploy publicly.

---

## Tests

```bash
npm run test:contract
```

29 Hardhat tests covering registration, upload, request/approve/reject,
grant/revoke, unauthorised access, and integrity verification.

```bash
npm run test:integration
```

56 assertions driving the real API, the real contract and the real browser
crypto module end to end — including that an unauthorised doctor is refused by
both the contract and the API, that revocation cuts off access immediately, that
a tampered file fails its hash check, and that the server rejects plaintext.

Requires **local mode**: the Hardhat chain, a local deployment and the backend
all running against chain 31337 (see Quick start). It will not run against
Sepolia, since it sends dozens of transactions.

After deploying publicly, verify the live system instead:

```bash
npm run check:deployment https://your-api.onrender.com https://your-app.vercel.app
```

---

## Public deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full walkthrough: Sepolia,
Pinata, MongoDB Atlas, Render and Vercel. After deploying, the site is reachable
from any laptop with only a browser and MetaMask.

---

## Project layout

```
contracts/         Hardhat project
  contracts/MedicalRecord.sol
  scripts/deploy.js       deploys + syncs ABI to frontend and backend
  scripts/seed.js         demo data for a local chain
  test/MedicalRecord.test.js

backend/           Express API
  src/config/       env config + dual-mode data store
  src/routes/       auth, users, records, admin, audit
  src/services/     ipfs.js (Pinata), chain.js (read-only contract access)
  src/middleware/   JWT auth and role guards

frontend/          React + Vite + Tailwind
  src/lib/crypto.js     AES-GCM, ECIES, key derivation, validation
  src/lib/web3.js       MetaMask, contract, network switching
  src/lib/records.js    shared open/verify/share logic
  src/pages/            patient/, doctor/, admin/

docs/              integration test and reference notes
sample-records/    synthetic files for the demo
```

---

## Smart contract

`MedicalRecord.sol` implements patient and doctor registration, record
registration with ownership, hash and CID storage, access requests, approve and
reject, direct grant and revoke, and access verification — guarded by
`onlyPatient`, `onlyDoctor`, `onlyRecordOwner`, `onlyAdmin` and `validAddress`
modifiers.

Events: `RecordUploaded`, `AccessRequested`, `AccessGranted`, `AccessRejected`,
`AccessRevoked`, `AccessDenied`, `RecordViewed`, `RecordDeactivated`,
`PatientRegistered`, `DoctorRegistered`, `DoctorVerified`.

Records are never deleted — `deactivateRecord` flags them inactive so history
stays verifiable.

---

## Important

This is an academic project on a **public test network**. Upload only the
synthetic files in `sample-records/` or similar dummy data. Change
`JWT_SECRET`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` before exposing it publicly,
and never commit a `.env` file or a private key.
