/**
 * Health-profile storage and sharing.
 *
 * Split from profile.js so that the cryptography there depends on nothing but
 * the Web Crypto API, and can be exercised outside a browser. Everything in
 * this file talks to the API; everything in that one is pure.
 */
import { api } from "./api";
import {
  EMPTY_PROFILE,
  decryptProfile,
  encryptProfile,
  openProfileKey,
  sealProfileKey,
} from "./profile";

//
// Saving re-seals the profile to the patient and to every doctor currently on
// the list. Revocation is a save with that doctor dropped: their envelope
// disappears from the server, so the on-chain permission alone no longer
// yields a key.
// ---------------------------------------------------------------------------

/** Look up a wallet's registered encryption public key. */
async function publicKeyOf(address) {
  const { user } = await api.userByWallet(address);
  return user?.encryptionPublicKey || "";
}

/**
 * Load and decrypt the signed-in patient's own profile.
 * @returns {Promise<{data: object, dataKey: Uint8Array, recipients: string[]}|null>}
 */
export async function loadMyProfile(keyPair) {
  const res = await api.myHealthProfile();
  if (!res || !res.profile) return null;
  const dataKey = await openProfileKey(res.sealed, keyPair.privateKey);
  return {
    data: { ...EMPTY_PROFILE, ...(await decryptProfile(res.profile.envelope, dataKey)) },
    dataKey,
    recipients: res.recipients || [],
  };
}

/**
 * Encrypt and store the profile, sealed to the owner plus `recipients`.
 * A fresh data key is generated each save, so a doctor removed from the list
 * cannot reuse a key they were given earlier.
 */
export async function saveMyProfile(data, keyPair, ownerAddress, recipients = []) {
  const { envelope, dataKey } = await encryptProfile(data);

  const targets = [{ address: ownerAddress, publicKey: keyPair.publicKey }];
  for (const addr of recipients) {
    // eslint-disable-next-line no-await-in-loop
    const pk = await publicKeyOf(addr);
    if (pk) targets.push({ address: addr, publicKey: pk });
  }

  const wrappedKeys = await sealProfileKey(dataKey, targets);
  return api.putHealthProfile({ envelope, wrappedKeys });
}

/**
 * Add a doctor to the profile's recipient list. Called when a patient approves
 * an access request, so the doctor sees who they are treating alongside the
 * records they were granted. Silent no-op when no profile exists yet.
 */
export async function shareProfileWith(keyPair, ownerAddress, doctorAddress) {
  const mine = await loadMyProfile(keyPair);
  if (!mine) return false;
  const next = [...new Set([...mine.recipients, doctorAddress.toLowerCase()])];
  await saveMyProfile(mine.data, keyPair, ownerAddress, next);
  return true;
}

/** Remove a doctor from the recipient list. Called on revoke. */
export async function unshareProfileFrom(keyPair, ownerAddress, doctorAddress) {
  const mine = await loadMyProfile(keyPair);
  if (!mine) return false;
  const drop = doctorAddress.toLowerCase();
  const next = mine.recipients.filter((a) => a !== drop);
  if (next.length === mine.recipients.length) return false;
  await saveMyProfile(mine.data, keyPair, ownerAddress, next);
  return true;
}

/** A doctor reading an approved patient's profile. */
export async function loadPatientProfile(patientAddress, keyPair) {
  const res = await api.healthProfileOf(patientAddress);
  if (!res || !res.profile) return null;
  const dataKey = await openProfileKey(res.sealed, keyPair.privateKey);
  return { ...EMPTY_PROFILE, ...(await decryptProfile(res.profile.envelope, dataKey)) };
}
