/**
 * MetaMask + smart-contract helpers.
 *
 * The contract address and target network are read from environment variables
 * so a single build can be pointed at Sepolia, a local Hardhat node, or
 * Ganache without touching code.
 */
import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";
import artifact from "../abi/MedicalRecord.json";

export const ABI = artifact.abi;

export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || artifact.address || "";

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 11155111);

export const RPC_URL =
  import.meta.env.VITE_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

export const EXPLORER =
  (import.meta.env.VITE_EXPLORER_BASE || "https://sepolia.etherscan.io").replace(/\/$/, "");

const NETWORKS = {
  11155111: {
    chainId: "0xaa36a7",
    chainName: "Sepolia Test Network",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
  },
  1337: {
    chainId: "0x539",
    chainName: "Ganache",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["http://127.0.0.1:7545"],
    blockExplorerUrls: [],
  },
  31337: {
    chainId: "0x7a69",
    chainName: "Hardhat Local",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["http://127.0.0.1:8545"],
    blockExplorerUrls: [],
  },
};

export const NETWORK_NAME = NETWORKS[CHAIN_ID]?.chainName || `Chain ${CHAIN_ID}`;

export const hasMetaMask = () =>
  typeof window !== "undefined" && typeof window.ethereum !== "undefined";

export const isContractConfigured = () => Boolean(CONTRACT_ADDRESS);

export function txUrl(hash) {
  return `${EXPLORER}/tx/${hash}`;
}

export function addressUrl(addr) {
  return `${EXPLORER}/address/${addr}`;
}

export function shortAddress(addr, size = 4) {
  if (!addr) return "";
  return `${addr.slice(0, 2 + size)}...${addr.slice(-size)}`;
}

/** Connect MetaMask and return { provider, signer, address, chainId }. */
export async function connectWallet() {
  if (!hasMetaMask()) {
    throw new Error(
      "MetaMask was not detected. Install it from metamask.io, then reload this page."
    );
  }

  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!accounts || accounts.length === 0) throw new Error("No account was authorised in MetaMask");

  const provider = new BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  const signer = await provider.getSigner();

  return {
    provider,
    signer,
    address: await signer.getAddress(),
    chainId: Number(network.chainId),
  };
}

/** Ask MetaMask to switch to the configured network, adding it if unknown. */
export async function switchNetwork(target = CHAIN_ID) {
  if (!hasMetaMask()) throw new Error("MetaMask is not installed");
  const net = NETWORKS[target];
  if (!net) throw new Error(`Unsupported network: ${target}`);

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: net.chainId }],
    });
  } catch (err) {
    // 4902 = chain not added to the wallet yet.
    if (err.code === 4902 || (err.data && err.data.originalError?.code === 4902)) {
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [net] });
    } else {
      throw err;
    }
  }
}

/** A contract bound to the user's signer - use for transactions. */
export async function getContract(signer) {
  if (!CONTRACT_ADDRESS) {
    throw new Error(
      "No contract address configured. Deploy the contract and set VITE_CONTRACT_ADDRESS."
    );
  }
  return new Contract(CONTRACT_ADDRESS, ABI, signer);
}

/** A read-only contract that works without a wallet at all. */
export function getReadContract() {
  if (!CONTRACT_ADDRESS) return null;
  return new Contract(CONTRACT_ADDRESS, ABI, new JsonRpcProvider(RPC_URL));
}

/**
 * Turn a raw wallet/RPC error into something a user can act on.
 */
export function humanError(err) {
  const msg = err?.shortMessage || err?.reason || err?.message || String(err);

  if (err?.code === "ACTION_REJECTED" || /user rejected|user denied/i.test(msg)) {
    return "You rejected the transaction in MetaMask.";
  }
  if (/insufficient funds/i.test(msg)) {
    return "Not enough Sepolia ETH to pay for gas. Get some from a Sepolia faucet.";
  }
  if (/MR: /.test(msg)) {
    // A require() message straight from the contract - show it plainly.
    return msg.match(/MR: [^"']+/)[0].replace("MR: ", "Smart contract rejected this: ");
  }
  if (/could not detect network|network changed/i.test(msg)) {
    return "Lost connection to the network. Check MetaMask is on the right chain.";
  }
  if (/nonce/i.test(msg)) {
    return "Transaction nonce problem. In MetaMask: Settings > Advanced > Clear activity tab data.";
  }
  return msg;
}

/** Wait for a receipt and normalise the bits the UI wants to display. */
export async function waitForTx(tx) {
  const receipt = await tx.wait();
  return {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed?.toString() || "0",
    status: receipt.status === 1 ? "success" : "failed",
    url: txUrl(receipt.hash),
    receipt,
  };
}

/** Pull an event argument out of a receipt (e.g. the new record id). */
export function readEventArg(receipt, contract, eventName, argName) {
  for (const log of receipt.logs || []) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === eventName) {
        const v = parsed.args[argName];
        return typeof v === "bigint" ? Number(v) : v;
      }
    } catch {
      // Not one of our events - skip.
    }
  }
  return null;
}
