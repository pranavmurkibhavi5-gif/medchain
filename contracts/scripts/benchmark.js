/**
 * Measures the system for the research paper.
 *
 *   npx hardhat run docs/benchmark.js --network localhost   (from contracts/)
 *
 * Produces:
 *   - gas cost per contract operation, with Sepolia/mainnet cost estimates
 *   - on-chain storage footprint per record
 *   - the on-chain vs off-chain saving, quantified
 *   - AES-256-GCM encryption throughput across file sizes
 *   - ECIES key-sealing latency
 *
 * Everything printed here is measured, not estimated, except where a gas price
 * assumption is stated explicitly.
 */
const hre = require("hardhat");
const path = require("path");
const { performance } = require("perf_hooks");

const FRONTEND = path.join(__dirname, "..", "..", "frontend");

// Assumptions used only to convert gas into currency. Stated in the paper.
const GAS_PRICE_GWEI = 20;
const ETH_USD = 3000;

const rows = [];
function record(op, gas, note = "") {
  const g = Number(gas);
  const eth = (g * GAS_PRICE_GWEI) / 1e9;
  rows.push({ op, gas: g, eth, usd: eth * ETH_USD, note });
}

async function gasOf(txPromise) {
  const tx = await txPromise;
  const r = await tx.wait();
  return r.gasUsed;
}

function table(title, headers, data) {
  console.log(`\n${title}`);
  console.log("=".repeat(title.length));
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...data.map((r) => String(r[i]).length))
  );
  const line = (cells) =>
    cells.map((c, i) => String(c).padEnd(widths[i])).join("  ");
  console.log(line(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  data.forEach((r) => console.log(line(r)));
}

async function main() {
  console.log("\nBlockchain-Based Secure Medical Record - measurement run");
  console.log(`Network: ${hre.network.name}`);
  console.log(`Assumptions for cost columns: ${GAS_PRICE_GWEI} gwei, 1 ETH = $${ETH_USD}\n`);

  const [admin, patient, patient2, doctor] = await hre.ethers.getSigners();

  // ---------------------------------------------------------------- deploy
  const Factory = await hre.ethers.getContractFactory("MedicalRecord");
  const c = await Factory.deploy();
  await c.waitForDeployment();
  const deployRc = await c.deploymentTransaction().wait();
  record("Contract deployment", deployRc.gasUsed, "one-time");

  const artifact = await hre.artifacts.readArtifact("MedicalRecord");
  const bytecodeBytes = (artifact.deployedBytecode.length - 2) / 2;

  // ------------------------------------------------------------ operations
  record("registerPatient", await gasOf(c.connect(patient).registerPatient("Rakesh Patil", "")), "per patient");
  await c.connect(patient2).registerPatient("Manu Nandihalli", "");
  record("registerDoctor", await gasOf(c.connect(doctor).registerDoctor("Dr. Afziya Garag", "Cardiology", "KA-MED-1042")), "per doctor");
  record("setDoctorVerified", await gasOf(c.connect(admin).setDoctorVerified(doctor.address, true)), "admin only");

  const HASH = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("encrypted-blood-report"));
  const CID = "bafkreigfjhhuccyptqfq2gkgqhuaj6lenmgnudaobidcd6dwj645rhj7f4"; // real CIDv1, 59 chars

  record(
    "uploadRecord",
    await gasOf(
      c.connect(patient).uploadRecord(HASH, CID, "blood-report.pdf", "application/pdf", 24576, "Lab Report")
    ),
    "per record"
  );

  record("requestAccess", await gasOf(c.connect(doctor).requestAccess(patient.address, 0, "Cardiac review")), "per request");
  record("approveRequest", await gasOf(c.connect(patient).approveRequest(1)), "per approval");
  record("logRecordAccess (allowed)", await gasOf(c.connect(doctor).logRecordAccess(1)), "audit event");
  record("revokeAccess", await gasOf(c.connect(patient).revokeAccess(doctor.address, 0)), "per revocation");
  record("logRecordAccess (denied)", await gasOf(c.connect(doctor).logRecordAccess(1)), "audit event");
  record("grantAccess (direct)", await gasOf(c.connect(patient).grantAccess(doctor.address, 0)), "per grant");

  await c.connect(doctor).requestAccess(patient2.address, 0, "second opinion");
  record("rejectRequest", await gasOf(c.connect(patient2).rejectRequest(2)), "per rejection");

  table(
    "TABLE I. MEASURED GAS COST PER OPERATION",
    ["Operation", "Gas", "ETH", "USD", "Frequency"],
    rows.map((r) => [r.op, r.gas.toLocaleString(), r.eth.toFixed(6), "$" + r.usd.toFixed(3), r.note])
  );

  // ------------------------------------------- on-chain vs off-chain saving
  const uploadGas = rows.find((r) => r.op === "uploadRecord").gas;

  // Solidity charges ~640 gas per 32-byte word of calldata-to-storage for
  // non-zero bytes (16 gas/byte calldata + 20000 per SSTORE word).
  const GAS_PER_BYTE_ONCHAIN = 16 + 20000 / 32; // calldata + storage
  const sizes = [
    ["24 KB (text report)", 24 * 1024],
    ["512 KB (scanned PDF)", 512 * 1024],
    ["2 MB (X-ray image)", 2 * 1024 * 1024],
    ["10 MB (MRI series)", 10 * 1024 * 1024],
  ];

  const comparison = sizes.map(([label, bytes]) => {
    const naive = Math.round(bytes * GAS_PER_BYTE_ONCHAIN);
    const naiveUsd = ((naive * GAS_PRICE_GWEI) / 1e9) * ETH_USD;
    const ourUsd = ((uploadGas * GAS_PRICE_GWEI) / 1e9) * ETH_USD;
    return [
      label,
      naive.toLocaleString(),
      "$" + naiveUsd.toFixed(2),
      uploadGas.toLocaleString(),
      "$" + ourUsd.toFixed(3),
      (naive / uploadGas).toFixed(0) + "x",
    ];
  });

  table(
    "TABLE II. HASH-ONLY ANCHORING vs STORING THE FILE ON-CHAIN",
    ["File size", "Naive gas", "Naive cost", "Our gas", "Our cost", "Saving"],
    comparison
  );
  console.log(
    "\n  Note: our gas is CONSTANT regardless of file size - the defining property\n" +
    "  of the design. Naive figures assume 16 gas/byte calldata + 20000 gas per\n" +
    "  32-byte SSTORE word, and ignore the 24 KB contract and ~30M block gas limits\n" +
    "  which make the larger rows physically impossible on Ethereum."
  );

  // ---------------------------------------------- on-chain storage per record
  const rec = await c.getRecord(1);
  const onChainBytes =
    32 + 20 + 32 + rec.cid.length + rec.fileName.length + rec.fileType.length + 32 + rec.recordType.length + 32 + 1;
  table(
    "TABLE III. ON-CHAIN FOOTPRINT PER RECORD",
    ["Field", "Bytes", "Purpose"],
    [
      ["recordId (uint256)", "32", "identifier"],
      ["owner (address)", "20", "ownership"],
      ["dataHash (bytes32)", "32", "integrity proof"],
      [`cid (string, ${rec.cid.length} chars)`, String(rec.cid.length), "IPFS pointer"],
      [`fileName (${rec.fileName.length})`, String(rec.fileName.length), "display"],
      [`fileType (${rec.fileType.length})`, String(rec.fileType.length), "display"],
      ["fileSize (uint256)", "32", "display"],
      [`recordType (${rec.recordType.length})`, String(rec.recordType.length), "classification"],
      ["timestamp (uint256)", "32", "ordering"],
      ["active (bool)", "1", "lifecycle"],
      ["TOTAL", String(onChainBytes), "no medical content"],
    ]
  );

  // --------------------------------------------------- cryptographic timings
  const { encryptFile, decryptEnvelope, sealKey, unsealKey, deriveKeyPairFromSignature, keccakHex } =
    await import("file://" + path.join(FRONTEND, "src", "lib", "crypto.js").replace(/\\/g, "/"));

  const cryptoRows = [];
  for (const [label, bytes] of [
    ["100 KB", 100 * 1024],
    ["500 KB", 500 * 1024],
    ["1 MB", 1024 * 1024],
    ["5 MB", 5 * 1024 * 1024],
    ["10 MB", 10 * 1024 * 1024],
  ]) {
    const data = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i += 4096) data[i] = i % 251; // avoid all-zero pages
    const file = {
      name: "record.bin",
      type: "application/octet-stream",
      size: bytes,
      arrayBuffer: async () => data.buffer,
    };

    const REPS = bytes > 2 * 1024 * 1024 ? 3 : 10;
    let pipeMs = 0, aesMs = 0, decMs = 0, hashMs = 0;
    let env, key;

    // AES-only timing, isolated from hashing and envelope assembly.
    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    const aesKey = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]);

    for (let r = 0; r < REPS; r++) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      let t = performance.now();
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, data);
      aesMs += performance.now() - t;

      // Full pipeline as the application actually runs it (encrypt + hash).
      t = performance.now();
      const out = await encryptFile(file);
      pipeMs += performance.now() - t;
      env = out.envelope;
      key = out.dataKey;

      t = performance.now();
      keccakHex(env);
      hashMs += performance.now() - t;

      t = performance.now();
      await decryptEnvelope(env, key);
      decMs += performance.now() - t;
    }

    const pipe = pipeMs / REPS, aes = aesMs / REPS, d = decMs / REPS, h = hashMs / REPS;
    const mb = bytes / 1024 / 1024;
    cryptoRows.push([
      label,
      aes.toFixed(1),
      (mb / (aes / 1000)).toFixed(0),
      h.toFixed(1),
      (mb / (h / 1000)).toFixed(0),
      pipe.toFixed(1),
      d.toFixed(1),
    ]);
  }

  table(
    "TABLE IV. CLIENT-SIDE CRYPTOGRAPHY, BROKEN DOWN BY STAGE",
    ["File size", "AES enc ms", "AES MB/s", "keccak ms", "keccak MB/s", "Pipeline ms", "Decrypt ms"],
    cryptoRows
  );

  // ECIES key sealing
  const kp = deriveKeyPairFromSignature("0x" + "ab".repeat(65));
  const dk = new Uint8Array(32).fill(7);
  let sealMs = 0, unsealMs = 0, deriveMs = 0;
  const N = 50;
  for (let i = 0; i < N; i++) {
    let t = performance.now();
    deriveKeyPairFromSignature("0x" + i.toString(16).padStart(2, "0").repeat(65));
    deriveMs += performance.now() - t;

    t = performance.now();
    const sealed = await sealKey(dk, kp.publicKey);
    sealMs += performance.now() - t;

    t = performance.now();
    await unsealKey(sealed, kp.privateKey);
    unsealMs += performance.now() - t;
  }

  table(
    "TABLE V. KEY MANAGEMENT LATENCY (mean of 50 runs)",
    ["Operation", "Mean ms", "Purpose"],
    [
      ["Keypair derivation from signature", (deriveMs / N).toFixed(2), "session unlock"],
      ["ECIES seal (grant access)", (sealMs / N).toFixed(2), "per record shared"],
      ["ECIES unseal (read record)", (unsealMs / N).toFixed(2), "per record opened"],
    ]
  );

  const [p, d, r, q] = await c.stats();
  console.log(`\nFinal contract state: ${p} patients, ${d} doctors, ${r} records, ${q} requests`);
  console.log(`Deployed bytecode: ${bytecodeBytes} bytes (EIP-170 limit 24576)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
