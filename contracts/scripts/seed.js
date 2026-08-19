/**
 * Seeds a local chain with demo patients, doctors, records and access requests
 * so the dashboards have something to show during a demonstration.
 *
 *   npx hardhat node                 (terminal 1)
 *   npm run seed:local               (terminal 2)
 *
 * Never run this against Sepolia - it is for local development only.
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const net = hre.network.name;
  if (net === "sepolia" || net === "mainnet") {
    throw new Error("seed.js is for local networks only");
  }

  const file = path.join(__dirname, "..", "deployments", `${net}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No deployment found for '${net}'. Run the deploy script first.`);
  }
  const { address } = JSON.parse(fs.readFileSync(file, "utf8"));

  const contract = await hre.ethers.getContractAt("MedicalRecord", address);
  const [admin, p1, p2, d1, d2] = await hre.ethers.getSigners();

  console.log(`Seeding ${address} on ${net}...\n`);

  const hash = (s) => hre.ethers.keccak256(hre.ethers.toUtf8Bytes(s));

  await (await contract.connect(p1).registerPatient("Rakesh Patil", "")).wait();
  await (await contract.connect(p2).registerPatient("Manu Nandihalli", "")).wait();
  console.log("  registered 2 patients");

  await (await contract.connect(d1).registerDoctor("Dr. Afziya Garag", "Cardiology", "KA-MED-1042")).wait();
  await (await contract.connect(d2).registerDoctor("Dr. Shankargoud Patil", "Radiology", "KA-MED-2288")).wait();
  console.log("  registered 2 doctors");

  await (await contract.connect(admin).setDoctorVerified(d1.address, true)).wait();

  await (
    await contract
      .connect(p1)
      .uploadRecord(hash("demo-blood-report"), "bafyDemoCid1", "blood-report.pdf", "application/pdf", 24576, "Lab Report")
  ).wait();
  await (
    await contract
      .connect(p1)
      .uploadRecord(hash("demo-xray"), "bafyDemoCid2", "chest-xray.png", "image/png", 102400, "Radiology / Scan")
  ).wait();
  await (
    await contract
      .connect(p2)
      .uploadRecord(hash("demo-prescription"), "bafyDemoCid3", "prescription.pdf", "application/pdf", 8192, "Prescription")
  ).wait();
  console.log("  uploaded 3 records");

  await (await contract.connect(d1).requestAccess(p1.address, 0, "Cardiac review before surgery")).wait();
  await (await contract.connect(d2).requestAccess(p2.address, 0, "Second opinion on chest imaging")).wait();
  console.log("  raised 2 access requests");

  await (await contract.connect(p1).approveRequest(1)).wait();
  console.log("  patient 1 approved request 1");

  const [pc, dc, rc, qc] = await contract.stats();
  console.log(`\nDone. patients=${pc} doctors=${dc} records=${rc} requests=${qc}`);
  console.log("\nAccounts used:");
  console.log(`  admin    ${admin.address}`);
  console.log(`  patient1 ${p1.address}`);
  console.log(`  patient2 ${p2.address}`);
  console.log(`  doctor1  ${d1.address}`);
  console.log(`  doctor2  ${d2.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
