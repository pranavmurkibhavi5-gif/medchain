/**
 * Checks everything needed for a Sepolia deploy BEFORE spending gas.
 *
 *   npx hardhat run scripts/preflight.js --network sepolia
 *
 * Runs automatically before `npm run deploy:sepolia`.
 */
const hre = require("hardhat");

const ok = (m) => console.log(`  [ok]   ${m}`);
const bad = (m) => console.log(`  [FAIL] ${m}`);
const warn = (m) => console.log(`  [warn] ${m}`);

async function main() {
  console.log("\nSepolia preflight check");
  console.log("-----------------------");

  let fatal = 0;

  // 1. Private key present?
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    bad("DEPLOYER_PRIVATE_KEY is not set in contracts/.env");
    console.log("         Create a new MetaMask account, fund it from a Sepolia");
    console.log("         faucet, then paste its private key into contracts/.env");
    fatal++;
  } else {
    ok("DEPLOYER_PRIVATE_KEY is set");
  }

  // 2. Can we reach the network?
  let network;
  try {
    network = await hre.ethers.provider.getNetwork();
    ok(`RPC reachable (chainId ${network.chainId})`);
  } catch (err) {
    bad(`Cannot reach ${process.env.SEPOLIA_RPC_URL || "the RPC endpoint"}: ${err.message}`);
    console.log("\nPreflight failed. Fix the issues above and try again.\n");
    process.exit(1);
  }

  // 3. Right chain?
  if (Number(network.chainId) !== 11155111) {
    bad(`Expected Sepolia (11155111) but the RPC reports ${network.chainId}`);
    fatal++;
  } else {
    ok("Connected to Sepolia");
  }

  // 4. Funded?
  if (process.env.DEPLOYER_PRIVATE_KEY) {
    const [deployer] = await hre.ethers.getSigners();
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    const eth = Number(hre.ethers.formatEther(balance));

    console.log(`         Deployer: ${deployer.address}`);

    if (eth === 0) {
      bad("Deployer has 0 ETH - the deploy will fail");
      console.log("         Faucets: https://sepoliafaucet.com");
      console.log("                  https://www.alchemy.com/faucets/ethereum-sepolia");
      fatal++;
    } else if (eth < 0.005) {
      warn(`Balance is only ${eth} ETH - top up to be safe`);
    } else {
      ok(`Deployer funded with ${eth} ETH`);
    }
  }

  // 5. Contract compiles?
  try {
    await hre.artifacts.readArtifact("MedicalRecord");
    ok("MedicalRecord is compiled");
  } catch {
    warn("Contract not compiled yet - the deploy will compile it first");
  }

  if (fatal > 0) {
    console.log(`\n${fatal} blocking issue(s). Deployment aborted.\n`);
    process.exitCode = 1;
    return;
  }

  console.log("\nAll checks passed. Ready to deploy.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Release the RPC polling handle so Node can exit cleanly on Windows.
    try {
      hre.ethers.provider.destroy?.();
    } catch {
      /* nothing to release */
    }
  });
