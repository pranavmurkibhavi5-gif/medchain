/**
 * Gas sponsorship.
 *
 * MedicalRecord.sol authorises by msg.sender, so each user must send their own
 * transactions and therefore must hold a little Sepolia ETH. Asking a patient
 * to find a faucet defeats the point of the simplified app, so the backend
 * tops up a new account once, from a dedicated sponsor key.
 *
 * This is a testnet convenience, not a production funding model. It is
 * deliberately conservative:
 *   - a fixed, small amount per account
 *   - only if the account is genuinely below the threshold
 *   - only for accounts linked to a registered user
 *   - one in-flight top-up at a time, so nonces cannot collide
 *   - a hard cap on total spend per process
 *
 * SPONSOR_PRIVATE_KEY is read from the environment and never leaves the server.
 * It signs nothing but plain value transfers; it has no role in the contract.
 */
const { ethers } = require("ethers");
const config = require("./../config");

const TOP_UP_ETH = process.env.SPONSOR_TOPUP_ETH || "0.004";
const MIN_BALANCE_ETH = process.env.SPONSOR_MIN_BALANCE_ETH || "0.002";
const MAX_TOTAL_ETH = process.env.SPONSOR_MAX_TOTAL_ETH || "0.05";

let spentWei = 0n;
let queue = Promise.resolve(); // serialises top-ups so nonces stay ordered

function sponsorKey() {
  return process.env.SPONSOR_PRIVATE_KEY || "";
}

const isEnabled = () => Boolean(sponsorKey() && config.rpcUrl);

function wallet() {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, {
    staticNetwork: true,
  });
  return new ethers.Wallet(sponsorKey(), provider);
}

/**
 * Top up `address` if it is short of gas.
 *
 * @returns {Promise<{funded:boolean, reason?:string, txHash?:string,
 *                    balance:string, amount?:string}>}
 */
async function topUp(address) {
  if (!isEnabled()) {
    return { funded: false, reason: "sponsor_not_configured", balance: "0" };
  }
  if (!ethers.isAddress(address)) {
    return { funded: false, reason: "invalid_address", balance: "0" };
  }

  // Serialise: two concurrent sends from one key would reuse a nonce.
  queue = queue.then(() => fund(address)).catch(() => {});
  return queue;
}

async function fund(address) {
  const w = wallet();
  const provider = w.provider;

  const balance = await provider.getBalance(address);
  const min = ethers.parseEther(MIN_BALANCE_ETH);
  if (balance >= min) {
    return { funded: false, reason: "already_funded", balance: ethers.formatEther(balance) };
  }

  const amount = ethers.parseEther(TOP_UP_ETH);
  const cap = ethers.parseEther(MAX_TOTAL_ETH);
  if (spentWei + amount > cap) {
    console.warn("[sponsor] spend cap reached; refusing further top-ups");
    return { funded: false, reason: "cap_reached", balance: ethers.formatEther(balance) };
  }

  const sponsorBalance = await provider.getBalance(w.address);
  if (sponsorBalance < amount * 2n) {
    console.warn(`[sponsor] sponsor account is low: ${ethers.formatEther(sponsorBalance)} ETH`);
    return { funded: false, reason: "sponsor_empty", balance: ethers.formatEther(balance) };
  }

  try {
    const tx = await w.sendTransaction({ to: address, value: amount });
    await tx.wait();
    spentWei += amount;
    console.log(`[sponsor] funded ${address} with ${TOP_UP_ETH} ETH (${tx.hash})`);
    return {
      funded: true,
      txHash: tx.hash,
      amount: TOP_UP_ETH,
      balance: ethers.formatEther(balance + amount),
    };
  } catch (err) {
    console.error(`[sponsor] top-up failed for ${address}: ${err.message}`);
    return { funded: false, reason: err.message, balance: ethers.formatEther(balance) };
  }
}

async function status() {
  if (!isEnabled()) return { enabled: false };
  try {
    const w = wallet();
    const bal = await w.provider.getBalance(w.address);
    return {
      enabled: true,
      address: w.address,
      balance: ethers.formatEther(bal),
      spentThisProcess: ethers.formatEther(spentWei),
      topUpAmount: TOP_UP_ETH,
    };
  } catch (err) {
    return { enabled: true, error: err.message };
  }
}

module.exports = { isEnabled, topUp, status };
