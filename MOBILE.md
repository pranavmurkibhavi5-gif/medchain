# Mobile application layer

This document covers the changes made in response to the examiner's feedback:
make the system usable by ordinary patients, work as a mobile application, and
support multiple languages — without weakening the blockchain, encryption or
IPFS layers underneath.

---

## What the examiner asked for, and what changed

| Feedback | Response |
|---|---|
| Too complicated — users must understand MetaMask, networks, gas | MetaMask removed from the user experience entirely. See *Embedded wallet* below. |
| Convert into a mobile application | Mobile-first interface with bottom-tab navigation, installable and usable on any Android/iOS browser. |
| Multilingual support | English, ಕನ್ನಡ and हिन्दी, chosen on first launch. Adding a language is one file. |
| More practical for real patients and doctors | Plain clinical language throughout; no CID, hash, gas or wallet terminology in normal use. |

---

## The core problem, and how it was solved

`MedicalRecord.sol` authorises by `msg.sender`:

```solidity
modifier onlyPatient() { require(patients[msg.sender].exists, ...); }
function approveRequest(uint256 id) external { require(r.patient == msg.sender, ...); }
```

Every state change **must** be signed by a key the user controls. Blockchain
interaction therefore cannot simply be "hidden" — the signature is structural.
Two options existed:

1. **Meta-transactions (EIP-2771)** — a relayer submits on the user's behalf.
   Requires modifying and redeploying the contract, losing the existing Sepolia
   deployment and its data.
2. **Embedded wallet** — move the key into the app rather than the extension.
   No contract change at all.

**Option 2 was chosen.** The contract is untouched, the live deployment at
`0xAE246FCcad4F7aF88C1c6B3d17FaF2105D345824` remains valid, and every
transaction is still signed by the patient's own key. What changed is *where
that key lives*, not *who signs*.

### Embedded wallet

```
password + per-user salt
   └─ PBKDF2-SHA256, 310,000 iterations      [browser only]
      └─ vault key
         └─ AES-256-GCM decrypts the vault
            └─ Ethereum private key + record-encryption keypair
```

The server stores only the **encrypted vault** and the salt. It never receives
the password, the vault key, or any private key.

The record-encryption keypair is still derived from a deterministic signature by
the wallet key, exactly as the MetaMask flow did, so `crypto.js` is unchanged and
records encrypted under the old scheme remain readable.

### Gas sponsorship

Users still need a little Sepolia ETH to send their own transactions. Asking a
patient to find a faucet would defeat the purpose, so `backend/src/services/sponsor.js`
tops up each new account once from a dedicated sponsor key. It is deliberately
conservative: a fixed small amount, only below a threshold, only for registered
users, serialised so nonces cannot collide, and hard-capped per process.

---

## Honest security assessment

**This is a real trade-off and should be stated plainly.**

| | Before (MetaMask) | After (embedded wallet) |
|---|---|---|
| Key custody | Browser extension, user-controlled | Derived from the user's password |
| Server sees | Public key only | Encrypted vault + public key |
| Weakest link | Extension compromise | **Password strength** |
| Offline attack | Not applicable | Possible if the vault is stolen |
| Usable by a non-technical patient | No | Yes |

PBKDF2 at 310,000 iterations (OWASP 2023 guidance) makes offline guessing
expensive but does not make it impossible. A weak password is now genuinely the
weak link, which is why the registration screen states that the password
protects the records and cannot be recovered.

**What did not change:** files are still encrypted with AES-256-GCM in the
browser; only ciphertext reaches IPFS; only the keccak256 hash and CID go
on-chain; the server still holds no decryption key; access is still enforced by
the smart contract and still requires both an on-chain permission and a sealed
key envelope.

This is the same trade-off made by Coinbase Wallet-as-a-Service, Magic and
similar embedded-wallet providers. It buys an interface an ordinary patient can
actually use.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  MOBILE UI  (React, mobile-first, 3 languages)          │
│  Home · Records · Requests · Profile   [bottom tabs]    │
│                                                          │
│  AES-256-GCM encryption   ECIES key sealing              │
│  keccak256 hashing        embedded wallet signing        │
│  ── plaintext and private keys exist ONLY here ──        │
└───────────────────────────┬─────────────────────────────┘
                            │  ciphertext + sealed keys
┌───────────────────────────▼─────────────────────────────┐
│  BACKEND  (Node + Express, unchanged core)              │
│  JWT auth · IPFS proxy · sealed-vault storage           │
│  gas sponsor · verifies permissions ON-CHAIN            │
│  ── holds no decryption key, no user private key ──     │
└──────────┬────────────────────────────┬─────────────────┘
           │ hash + CID                 │ ciphertext
┌──────────▼───────────┐   ┌────────────▼────────────────┐
│  Ethereum Sepolia    │   │  IPFS (Pinata) + MongoDB    │
│  MedicalRecord.sol   │   │  encrypted blobs, metadata  │
│  UNCHANGED           │   │  sealed key envelopes       │
└──────────────────────┘   └─────────────────────────────┘
```

---

## Files added

| File | Purpose |
|---|---|
| `frontend/src/i18n/index.jsx` | Localization provider, `t()`, language persistence |
| `frontend/src/i18n/locales/en.js` | English strings (reference locale) |
| `frontend/src/i18n/locales/kn.js` | Kannada strings |
| `frontend/src/i18n/locales/hi.js` | Hindi strings |
| `frontend/src/lib/wallet.js` | Embedded wallet: vault create/open, signer with nonce management |
| `frontend/src/components/MobileLayout.jsx` | Bottom-tab shell, side rail on wide screens |
| `frontend/src/pages/Onboarding.jsx` | Language selection, first screen |
| `frontend/src/pages/app/Unlock.jsx` | Re-enter password after refresh |
| `frontend/src/pages/app/PatientHome.jsx` | Patient dashboard cards |
| `frontend/src/pages/app/Upload.jsx` | Five-step upload |
| `frontend/src/pages/app/Records.jsx` | Record list + viewer (both roles) |
| `frontend/src/pages/app/Requests.jsx` | Approve / reject |
| `frontend/src/pages/app/Doctors.jsx` | Doctors with access, revoke |
| `frontend/src/pages/app/DoctorHome.jsx` | Doctor dashboard |
| `frontend/src/pages/app/FindPatient.jsx` | Search + request access |
| `frontend/src/pages/app/Profile.jsx` | Settings, language, emergency notice, advanced |
| `frontend/src/pages/app/Activity.jsx` | Plain-language history |
| `backend/src/services/sponsor.js` | Gas sponsorship |
| `backend/src/routes/wallet.js` | Vault storage, gas top-up |
| `docs/wallet-test.mjs` | Embedded-wallet verification (14 assertions) |
| `docs/mobile-flow-test.mjs` | Full patient + doctor flow (17 assertions) |

## Files modified

| File | Change |
|---|---|
| `frontend/src/context/AppContext.jsx` | MetaMask replaced by embedded wallet; adds lock/unlock states |
| `frontend/src/App.jsx` | Routes for onboarding and the `/app` mobile shell |
| `frontend/src/main.jsx` | Wraps the app in `I18nProvider` |
| `frontend/src/pages/Login.jsx` | Simplified; unlocks the vault |
| `frontend/src/pages/Register.jsx` | Two-step; creates the blockchain identity |
| `frontend/src/index.css` | `.input-lg` for touch targets |
| `frontend/src/lib/api.js` | Wallet endpoints |
| `backend/src/server.js` | Mounts wallet routes, reports sponsor status |
| `backend/src/routes/auth.js` | `publicUser` no longer returns the vault |
| `backend/src/models/schemas.js` | `vault`, `vaultSalt` fields |
| `backend/src/config/store.js` | Carries vault fields in the memory store |

## Files deliberately unchanged

`contracts/contracts/MedicalRecord.sol`, `frontend/src/lib/crypto.js`,
`frontend/src/lib/records.js`, `backend/src/services/ipfs.js`,
`backend/src/services/chain.js`, `backend/src/routes/records.js`,
`backend/src/routes/admin.js`, `backend/src/routes/audit.js`.

---

## Configuration

One new backend variable enables gas sponsorship:

```
SPONSOR_PRIVATE_KEY=<key of a funded Sepolia account>
SPONSOR_TOPUP_ETH=0.004          # optional, per account
SPONSOR_MIN_BALANCE_ETH=0.002    # optional, top up below this
SPONSOR_MAX_TOTAL_ETH=0.05       # optional, hard cap per process
```

Without it the app still works, but users must fund their own accounts. The key
belongs in the environment only — never in source control.

---

## Running it

```bash
npm run setup
```

```bash
npm run chain          # terminal 1
```

```bash
npm run deploy:local   # terminal 2
```

```bash
npm run backend        # terminal 3
```

```bash
npm run frontend       # terminal 4
```

Open http://localhost:5173 and use a phone-sized viewport.

---

## Testing

```bash
npm run test:contract      # 29 - contract unchanged, still passes
npm run test:integration   # 56 - backend unchanged, still passes
node docs/wallet-test.mjs      # 14 - embedded wallet and sponsorship
node docs/mobile-flow-test.mjs # 17 - full patient + doctor flow
```

The last two require the local chain, a deployment and the backend running with
`SPONSOR_PRIVATE_KEY` set.

---

## Emergency access

Deliberately **not implemented**. The Profile screen describes it as planned and
states plainly that nothing can currently bypass patient approval.

Implementing it safely would need contract changes: a time-locked request
requiring more than one authorised party, a mandatory on-chain event for every
use, and a review process. A shortcut that let any doctor self-declare an
emergency would destroy the property the system exists to provide, so none was
added.
