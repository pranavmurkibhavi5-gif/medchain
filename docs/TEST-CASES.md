# Test cases

Maps to Chapter 6 of the project report. Two suites cover the system.

Run them with:

```bash
npm run test:contract
```

```bash
npm run test:integration
```

---

## A. Smart contract suite (Hardhat, 29 tests)

`contracts/test/MedicalRecord.test.js`

### TC-01 Registration

| # | Test | Expected |
|---|------|----------|
| 1.1 | Register a patient | Profile stored, role = Patient |
| 1.2 | Register a doctor | Specialization and licence stored, `verified` false |
| 1.3 | Register the same patient twice | Reverts — already registered |
| 1.4 | Patient address registers as doctor | Reverts — one role per address |
| 1.5 | Non-admin verifies a doctor | Reverts — admin only |

### TC-02 Record upload

| # | Test | Expected |
|---|------|----------|
| 2.1 | Upload hash + CID | `RecordUploaded` emitted, record readable |
| 2.2 | Doctor attempts upload | Reverts — patients only |
| 2.3 | Upload with empty hash or CID | Reverts |
| 2.4 | Verify integrity with correct hash | Returns true |
| 2.5 | Verify integrity with wrong hash | Returns false |

### TC-03 Access request workflow

| # | Test | Expected |
|---|------|----------|
| 3.1 | Doctor requests, patient approves | Status Approved, access granted |
| 3.2 | Patient rejects | Status Rejected, `AccessDenied` emitted |
| 3.3 | Another patient approves the request | Reverts — owner only |
| 3.4 | Approve an already-resolved request | Reverts |
| 3.5 | Unregistered doctor requests | Reverts |

### TC-04 Grant and revoke

| # | Test | Expected |
|---|------|----------|
| 4.1 | Grant chart-wide access | Doctor can list all records |
| 4.2 | Grant one record only | Access to that record only |
| 4.3 | Revoke access | Reads revert immediately |
| 4.4 | Revoke after approval | Request flips to Revoked |
| 4.5 | Grant on someone else's record | Reverts — not the owner |
| 4.6 | Grant to the zero address | Reverts |
| 4.7 | List granted doctors | Correct live active/revoked status |

### TC-05 Unauthorised access

| # | Test | Expected |
|---|------|----------|
| 5.1 | Unauthorised doctor lists records | Reverts — access denied |
| 5.2 | Unauthorised doctor opens a record | `AccessDenied` emitted, returns false |
| 5.3 | Authorised doctor opens a record | `RecordViewed` emitted |
| 5.4 | Patient reads another patient's record | Denied |
| 5.5 | Patient reads their own record | Always allowed |

### TC-06 Lifecycle and admin views

| # | Test | Expected |
|---|------|----------|
| 6.1 | Deactivate a record | Flagged inactive, hash still verifiable |
| 6.2 | Non-owner deactivates | Reverts |
| 6.3 | System statistics | Counts match actual state |

---

## B. Full-stack integration suite (56 assertions)

`docs/integration-test.mjs` — drives the real Express API, the real deployed
contract and the real browser crypto module together.

**Prerequisites:** chain running, contract deployed, backend running against it.

| Section | What it proves |
|---------|----------------|
| 0. Environment | API healthy, pointed at the contract, chain reachable |
| 1. Registration | Accounts created, wallets linked by signature, public keys registered, on-chain identities created |
| 2. Upload flow | File encrypted to a BMR1 envelope, no plaintext in ciphertext, CID issued, browser hash equals server hash, hash + CID committed on-chain, **no medical content anywhere on-chain** |
| 3. Patient read | Sealed key released, blob matches the on-chain hash, content decrypts correctly |
| 4. Unauthorised doctor | API refuses the key, refuses the ciphertext, refuses the listing; the contract itself reverts; `AccessDenied` lands on-chain |
| 5. Request → approve | Request raised and approved on-chain, key re-sealed for the doctor, API now releases it, doctor decrypts, `RecordViewed` emitted |
| 6. Revocation | Contract revokes, request flips to Revoked, API refuses key and ciphertext, contract reverts again |
| 7. Cryptography | A different doctor cannot unseal a stolen envelope; tampering changes the hash; the contract detects it; AES-GCM rejects it; the API refuses plaintext |
| 8. Admin | Sees stats, on-chain totals and metadata; responses carry no key material; **cannot fetch a decryption key**; full event trail visible |

### Latest result

```
56 passed, 0 failed
```

---

## C. Manual UI checklist

| Step | Role | Expected |
|------|------|----------|
| Register and connect MetaMask | Patient | Two signature prompts (unlock key, link wallet), no gas |
| Upload `sample-records/blood-report.txt` | Patient | Seven-step pipeline completes, one transaction, record card appears |
| Open the record | Patient | "Integrity verified", content renders |
| Click the transaction link | Patient | Opens on Sepolia Etherscan |
| Search the patient | Doctor | Patient found, "Request access" available |
| Open records before approval | Doctor | Blocked, shown as denied |
| Approve the request | Patient | Transaction confirms, keys shared |
| Open the record | Doctor | Decrypts, integrity verified |
| Revoke access | Patient | Transaction confirms |
| Refresh authorized records | Doctor | Patient no longer listed, record unreadable |
| Review the dashboard | Admin | Users, records, on-chain events and audit log all populated |
| Attempt to read a record | Admin | No decryption path exists |
