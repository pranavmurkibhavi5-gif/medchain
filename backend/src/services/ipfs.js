/**
 * IPFS gateway service.
 *
 * Primary path  : Pinata (PINATA_JWT set) - a real, public, pinned CID.
 * Fallback path : content-addressed local storage using the same CIDv1/raw
 *                 multihash rules, so the demo still produces a genuine CID
 *                 and the end-to-end flow is unchanged when no Pinata account
 *                 is configured.
 *
 * Only ENCRYPTED bytes ever reach this module. Plaintext never leaves the
 * patient's browser.
 */
const crypto = require("crypto");
const config = require("../config");
const store = require("../config/store");

// --- base32 (RFC 4648, lowercase, no padding) for CIDv1 -------------------
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/**
 * CIDv1, raw codec (0x55), sha2-256 multihash - the same shape Pinata returns
 * for `cidVersion: 1` raw blocks, so both paths look identical to the UI.
 */
function computeCid(buffer) {
  const digest = crypto.createHash("sha256").update(buffer).digest();
  const bytes = Buffer.concat([
    Buffer.from([0x01, 0x55, 0x12, digest.length]), // version, codec, hash fn, length
    digest,
  ]);
  return "b" + base32Encode(bytes); // 'b' = base32 multibase prefix
}

async function uploadToPinata(buffer, fileName) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/octet-stream" }), fileName);
  form.append(
    "pinataMetadata",
    JSON.stringify({ name: fileName, keyvalues: { app: "bmr", encrypted: "true" } })
  );
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.pinataJwt}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pinata upload failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.IpfsHash;
}

// Remembers why Pinata last failed so /api/health can report it.
let lastPinataError = null;
const getLastPinataError = () => lastPinataError;

/**
 * Store the encrypted blob.
 *
 * Pinata is preferred, but a Pinata outage, an expired JWT or an exhausted
 * quota must not make the system unusable: the upload falls back to the
 * content-addressed store, which is backed by MongoDB when one is configured
 * and therefore still survives a restart. The CID is computed with the same
 * CIDv1/raw rules either way, so the on-chain reference stays valid.
 *
 * @returns {Promise<{cid:string, provider:string, size:number, gatewayUrl:string, warning?:string}>}
 */
async function upload(buffer, fileName = "record.enc") {
  if (config.usingPinata) {
    try {
      const cid = await uploadToPinata(buffer, fileName);
      lastPinataError = null;
      // Keep a local copy too so retrieval works even if the gateway is slow.
      await store.blobs.put(cid, buffer).catch(() => {});
      return { cid, provider: "pinata", size: buffer.length, gatewayUrl: gatewayUrl(cid) };
    } catch (err) {
      lastPinataError = err.message;
      console.error(`[ipfs] Pinata failed, falling back to local store: ${err.message}`);
      const cid = computeCid(buffer);
      await store.blobs.put(cid, buffer);
      return {
        cid,
        provider: "local-fallback",
        size: buffer.length,
        gatewayUrl: localUrl(cid),
        warning:
          "Pinata rejected the upload, so the encrypted file was stored in the application's " +
          "own content-addressed store instead. The record is fully usable; fix the Pinata " +
          "credentials to have it pinned to the public IPFS network as well.",
      };
    }
  }

  const cid = computeCid(buffer);
  await store.blobs.put(cid, buffer);
  return { cid, provider: "local", size: buffer.length, gatewayUrl: localUrl(cid) };
}

/** Is the configured Pinata credential actually usable right now? */
async function pinataStatus() {
  if (!config.usingPinata) return { configured: false };
  try {
    const res = await fetch("https://api.pinata.cloud/data/testAuthentication", {
      headers: { Authorization: `Bearer ${config.pinataJwt}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return { configured: true, working: true };
    const text = await res.text().catch(() => "");
    return { configured: true, working: false, status: res.status, reason: text.slice(0, 200) };
  } catch (err) {
    return { configured: true, working: false, reason: err.message };
  }
}

function localUrl(cid) {
  return `${config.publicGateway}/ipfs/${cid}`;
}

function gatewayUrl(cid) {
  if (config.usingPinata) return `${config.pinataGateway}/ipfs/${cid}`;
  return `${config.publicGateway}/ipfs/${cid}`;
}

/** Fetch the encrypted blob back. Tries local cache, then public gateways. */
async function fetchBlob(cid) {
  const local = await store.blobs.get(cid);
  if (local) return local;

  const candidates = [
    `${config.pinataGateway}/ipfs/${cid}`,
    `${config.publicGateway}/ipfs/${cid}`,
    `https://dweb.link/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`,
  ];

  let lastErr = null;
  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        lastErr = new Error(`${url} -> ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await store.blobs.put(cid, buf).catch(() => {});
      return buf;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Could not retrieve ${cid} from IPFS: ${lastErr ? lastErr.message : "unknown"}`);
}

module.exports = { upload, fetchBlob, gatewayUrl, computeCid, pinataStatus, getLastPinataError };
