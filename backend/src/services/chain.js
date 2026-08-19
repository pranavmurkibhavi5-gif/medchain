/**
 * Read-only blockchain access.
 *
 * The backend holds no private key and never signs anything: every state change
 * is signed by the user in MetaMask. This module exists so the API can
 * independently verify on-chain permissions before releasing a sealed key
 * envelope - the server must not take the client's word for "I have access".
 */
const { ethers } = require("ethers");
const config = require("../config");

let artifact = null;
try {
  artifact = require("../abi/MedicalRecord.json");
} catch {
  artifact = { abi: [] };
}

let provider = null;
let contract = null;

function getProvider() {
  if (!provider && config.rpcUrl) {
    provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, { staticNetwork: true });
  }
  return provider;
}

function getContract() {
  if (contract) return contract;
  const p = getProvider();
  if (!p || !config.contractAddress || !ethers.isAddress(config.contractAddress)) return null;
  if (!artifact.abi || artifact.abi.length === 0) return null;
  contract = new ethers.Contract(config.contractAddress, artifact.abi, p);
  return contract;
}

const isConfigured = () => Boolean(getContract());

/**
 * Authoritative permission check straight from the chain.
 * Returns false (never throws) so callers can treat it as a hard gate.
 */
async function hasAccess(patient, doctor, recordId = 0) {
  const c = getContract();
  if (!c) return false;
  try {
    return await c.hasAccess(patient, doctor, BigInt(recordId || 0));
  } catch (err) {
    console.error("[chain] hasAccess failed:", err.message);
    return false;
  }
}

async function canAccessRecord(recordId, viewer) {
  const c = getContract();
  if (!c) return false;
  try {
    return await c.canAccessRecord(BigInt(recordId), viewer);
  } catch (err) {
    console.error("[chain] canAccessRecord failed:", err.message);
    return false;
  }
}

async function getRecord(recordId) {
  const c = getContract();
  if (!c) return null;
  try {
    const r = await c.getRecord(BigInt(recordId));
    return {
      id: Number(r.id),
      owner: r.owner,
      dataHash: r.dataHash,
      cid: r.cid,
      fileName: r.fileName,
      fileType: r.fileType,
      fileSize: Number(r.fileSize),
      recordType: r.recordType,
      timestamp: Number(r.timestamp),
      active: r.active,
    };
  } catch {
    return null;
  }
}

async function stats() {
  const c = getContract();
  if (!c) return null;
  try {
    const [p, d, r, q] = await c.stats();
    return {
      patients: Number(p),
      doctors: Number(d),
      records: Number(r),
      requests: Number(q),
    };
  } catch (err) {
    console.error("[chain] stats failed:", err.message);
    return null;
  }
}

/** Recent contract events, newest first - powers the admin activity feed. */
async function recentEvents(limit = 60, lookbackBlocks = 50000) {
  const c = getContract();
  const p = getProvider();
  if (!c || !p) return [];
  try {
    const latest = await p.getBlockNumber();
    const from = Math.max(0, latest - lookbackBlocks);
    const raw = await c.queryFilter("*", from, latest);
    const out = raw.slice(-limit).map((e) => ({
      event: e.fragment ? e.fragment.name : e.eventName || "Unknown",
      args: e.args ? serialiseArgs(e.fragment, e.args) : {},
      txHash: e.transactionHash,
      blockNumber: e.blockNumber,
      explorerUrl: `${config.explorerBase}/tx/${e.transactionHash}`,
    }));
    return out.reverse();
  } catch (err) {
    console.error("[chain] recentEvents failed:", err.message);
    return [];
  }
}

function serialiseArgs(fragment, args) {
  const out = {};
  if (!fragment) return out;
  fragment.inputs.forEach((input, i) => {
    const v = args[i];
    out[input.name || `arg${i}`] = typeof v === "bigint" ? v.toString() : String(v);
  });
  return out;
}

async function health() {
  const p = getProvider();
  if (!p) return { connected: false, reason: "no RPC url" };
  try {
    const [net, block] = await Promise.all([p.getNetwork(), p.getBlockNumber()]);
    return {
      connected: true,
      chainId: Number(net.chainId),
      blockNumber: block,
      contractAddress: config.contractAddress || null,
      contractConfigured: isConfigured(),
    };
  } catch (err) {
    return { connected: false, reason: err.message };
  }
}

module.exports = {
  isConfigured,
  hasAccess,
  canAccessRecord,
  getRecord,
  stats,
  recentEvents,
  health,
};
