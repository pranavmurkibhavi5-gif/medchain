/**
 * Deploys MedicalRecord and syncs the address + ABI into the frontend and
 * backend so no manual copy/paste is ever needed.
 *
 *   npx hardhat run scripts/deploy.js --network sepolia
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const net = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();

  console.log(`\nNetwork  : ${net}`);
  console.log(`Deployer : ${deployer.address}`);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance  : ${hre.ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.warn("\n!! Deployer has 0 ETH. Fund it from a Sepolia faucet first.\n");
  }

  const Factory = await hre.ethers.getContractFactory("MedicalRecord");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const tx = contract.deploymentTransaction();
  const receipt = tx ? await tx.wait() : null;

  console.log(`\nMedicalRecord deployed to: ${address}`);
  if (receipt) {
    console.log(`Tx hash : ${receipt.hash}`);
    console.log(`Block   : ${receipt.blockNumber}`);
  }

  const artifact = await hre.artifacts.readArtifact("MedicalRecord");
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);

  const deployment = {
    network: net,
    chainId,
    address,
    admin: deployer.address,
    txHash: receipt ? receipt.hash : null,
    blockNumber: receipt ? receipt.blockNumber : null,
    deployedAt: new Date().toISOString(),
  };

  // 1. deployments/<network>.json
  const deployDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deployDir, { recursive: true });
  fs.writeFileSync(
    path.join(deployDir, `${net}.json`),
    JSON.stringify(deployment, null, 2)
  );

  // 2. frontend ABI bundle
  const feAbiDir = path.join(__dirname, "..", "..", "frontend", "src", "abi");
  if (fs.existsSync(path.dirname(feAbiDir))) {
    fs.mkdirSync(feAbiDir, { recursive: true });
    fs.writeFileSync(
      path.join(feAbiDir, "MedicalRecord.json"),
      JSON.stringify({ ...deployment, abi: artifact.abi }, null, 2)
    );
    console.log("Synced   : frontend/src/abi/MedicalRecord.json");
  }

  // 3. backend ABI bundle
  const beAbiDir = path.join(__dirname, "..", "..", "backend", "src", "abi");
  if (fs.existsSync(path.join(__dirname, "..", "..", "backend", "src"))) {
    fs.mkdirSync(beAbiDir, { recursive: true });
    fs.writeFileSync(
      path.join(beAbiDir, "MedicalRecord.json"),
      JSON.stringify({ ...deployment, abi: artifact.abi }, null, 2)
    );
    console.log("Synced   : backend/src/abi/MedicalRecord.json");
  }

  console.log("\nNext steps");
  console.log("----------");
  console.log(`  frontend/.env  ->  VITE_CONTRACT_ADDRESS=${address}`);
  console.log(`  backend/.env   ->  CONTRACT_ADDRESS=${address}`);
  if (net === "sepolia") {
    console.log(`  Explorer       ->  https://sepolia.etherscan.io/address/${address}`);
    console.log(`  Verify         ->  npx hardhat verify --network sepolia ${address}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
