const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Test cases for the Blockchain-Based Secure Medical Record System.
 * Mirrors Chapter 6 (Test Cases) of the project report.
 */
describe("MedicalRecord", function () {
  let contract, admin, patient, patient2, doctor, doctor2, outsider;

  const HASH = ethers.keccak256(ethers.toUtf8Bytes("encrypted-blood-report-v1"));
  const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

  beforeEach(async function () {
    [admin, patient, patient2, doctor, doctor2, outsider] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MedicalRecord");
    contract = await Factory.deploy();
    await contract.waitForDeployment();

    await contract.connect(patient).registerPatient("Rakesh Patil", "");
    await contract.connect(patient2).registerPatient("Manu Nandihalli", "");
    await contract.connect(doctor).registerDoctor("Dr. Afziya Garag", "Cardiology", "KA-MED-1042");
    await contract.connect(doctor2).registerDoctor("Dr. Shankargoud Patil", "Radiology", "KA-MED-2288");
  });

  // -------------------------------------------------------------------
  describe("TC-01 Registration", function () {
    it("registers a patient and exposes the profile", async function () {
      const p = await contract.getPatient(patient.address);
      expect(p.exists).to.equal(true);
      expect(p.name).to.equal("Rakesh Patil");
      expect(await contract.roleOf(patient.address)).to.equal(1n); // Role.Patient
    });

    it("registers a doctor with specialization and licence", async function () {
      const d = await contract.getDoctor(doctor.address);
      expect(d.exists).to.equal(true);
      expect(d.specialization).to.equal("Cardiology");
      expect(d.licenseId).to.equal("KA-MED-1042");
      expect(d.verified).to.equal(false);
    });

    it("rejects duplicate registration", async function () {
      await expect(
        contract.connect(patient).registerPatient("Rakesh Again", "")
      ).to.be.revertedWith("MR: patient already registered");
    });

    it("prevents one address from being both patient and doctor", async function () {
      await expect(
        contract.connect(patient).registerDoctor("Fake", "General", "X-1")
      ).to.be.revertedWith("MR: address already registered as patient");
    });

    it("lets only the admin verify a doctor", async function () {
      await expect(
        contract.connect(outsider).setDoctorVerified(doctor.address, true)
      ).to.be.revertedWith("MR: caller is not admin");

      await contract.connect(admin).setDoctorVerified(doctor.address, true);
      expect((await contract.getDoctor(doctor.address)).verified).to.equal(true);
    });
  });

  // -------------------------------------------------------------------
  describe("TC-02 Record upload", function () {
    it("stores hash + CID on chain and emits RecordUploaded", async function () {
      await expect(
        contract
          .connect(patient)
          .uploadRecord(HASH, CID, "blood-report.pdf", "application/pdf", 24576, "Lab Report")
      )
        .to.emit(contract, "RecordUploaded")
        .withArgs(1n, patient.address, HASH, CID, "Lab Report", anyUint());

      const rec = await contract.getRecord(1);
      expect(rec.owner).to.equal(patient.address);
      expect(rec.dataHash).to.equal(HASH);
      expect(rec.cid).to.equal(CID);
      expect(rec.fileSize).to.equal(24576n);
      expect(rec.active).to.equal(true);
    });

    it("blocks uploads from non-patients", async function () {
      await expect(
        contract.connect(doctor).uploadRecord(HASH, CID, "f.pdf", "application/pdf", 1, "Lab Report")
      ).to.be.revertedWith("MR: caller is not a registered patient");
    });

    it("rejects an empty hash or empty CID", async function () {
      await expect(
        contract.connect(patient).uploadRecord(ethers.ZeroHash, CID, "f", "t", 1, "Lab Report")
      ).to.be.revertedWith("MR: empty hash");

      await expect(
        contract.connect(patient).uploadRecord(HASH, "", "f", "t", 1, "Lab Report")
      ).to.be.revertedWith("MR: empty cid");
    });

    it("verifies integrity against the stored hash", async function () {
      await contract.connect(patient).uploadRecord(HASH, CID, "f", "t", 1, "Lab Report");
      expect(await contract.verifyRecordIntegrity(1, HASH)).to.equal(true);
      expect(
        await contract.verifyRecordIntegrity(1, ethers.keccak256(ethers.toUtf8Bytes("tampered")))
      ).to.equal(false);
    });
  });

  // -------------------------------------------------------------------
  describe("TC-03 Access request workflow", function () {
    beforeEach(async function () {
      await contract.connect(patient).uploadRecord(HASH, CID, "f.pdf", "application/pdf", 100, "Lab Report");
    });

    it("lets a doctor raise a request and the patient approve it", async function () {
      await expect(contract.connect(doctor).requestAccess(patient.address, 0, "Cardiac review"))
        .to.emit(contract, "AccessRequested");

      let req = await contract.getRequest(1);
      expect(req.status).to.equal(1n); // Pending

      await expect(contract.connect(patient).approveRequest(1))
        .to.emit(contract, "AccessGranted");

      req = await contract.getRequest(1);
      expect(req.status).to.equal(2n); // Approved
      expect(await contract.hasAccess(patient.address, doctor.address, 1)).to.equal(true);
    });

    it("lets the patient reject a request and emits AccessDenied", async function () {
      await contract.connect(doctor).requestAccess(patient.address, 0, "Second opinion");
      await expect(contract.connect(patient).rejectRequest(1))
        .to.emit(contract, "AccessRejected")
        .and.to.emit(contract, "AccessDenied");

      expect((await contract.getRequest(1)).status).to.equal(3n); // Rejected
      expect(await contract.hasAccess(patient.address, doctor.address, 1)).to.equal(false);
    });

    it("stops anyone but the owning patient from approving", async function () {
      await contract.connect(doctor).requestAccess(patient.address, 0, "reason");
      await expect(contract.connect(patient2).approveRequest(1)).to.be.revertedWith(
        "MR: only the patient can approve"
      );
      await expect(contract.connect(doctor).approveRequest(1)).to.be.revertedWith(
        "MR: only the patient can approve"
      );
    });

    it("cannot resolve the same request twice", async function () {
      await contract.connect(doctor).requestAccess(patient.address, 0, "reason");
      await contract.connect(patient).approveRequest(1);
      await expect(contract.connect(patient).approveRequest(1)).to.be.revertedWith(
        "MR: request already resolved"
      );
    });

    it("blocks requests from unregistered doctors", async function () {
      await expect(
        contract.connect(outsider).requestAccess(patient.address, 0, "hi")
      ).to.be.revertedWith("MR: caller is not a registered doctor");
    });
  });

  // -------------------------------------------------------------------
  describe("TC-04 Grant and revoke", function () {
    beforeEach(async function () {
      await contract.connect(patient).uploadRecord(HASH, CID, "f.pdf", "application/pdf", 100, "Lab Report");
    });

    it("grants chart-wide access directly", async function () {
      await expect(contract.connect(patient).grantAccess(doctor.address, 0))
        .to.emit(contract, "AccessGranted")
        .withArgs(patient.address, doctor.address, 0n, 0n, anyUint());

      const recs = await contract.connect(doctor).getPatientRecordsAsDoctor(patient.address);
      expect(recs.length).to.equal(1);
      expect(recs[0].cid).to.equal(CID);
    });

    it("grants access to a single record only", async function () {
      await contract.connect(patient).uploadRecord(HASH, "cid2", "x.pdf", "application/pdf", 5, "Prescription");
      await contract.connect(patient).grantAccess(doctor.address, 1);

      expect(await contract.canAccessRecord(1, doctor.address)).to.equal(true);
      expect(await contract.canAccessRecord(2, doctor.address)).to.equal(false);
    });

    it("denies access after revocation", async function () {
      await contract.connect(patient).grantAccess(doctor.address, 0);
      expect(await contract.canAccessRecord(1, doctor.address)).to.equal(true);

      await expect(contract.connect(patient).revokeAccess(doctor.address, 0))
        .to.emit(contract, "AccessRevoked")
        .withArgs(patient.address, doctor.address, 0n, anyUint());

      expect(await contract.canAccessRecord(1, doctor.address)).to.equal(false);
      await expect(
        contract.connect(doctor).getPatientRecordsAsDoctor(patient.address)
      ).to.be.revertedWith("MR: access denied");
    });

    it("flips an approved request to Revoked when access is pulled", async function () {
      await contract.connect(doctor).requestAccess(patient.address, 0, "reason");
      await contract.connect(patient).approveRequest(1);
      await contract.connect(patient).revokeAccess(doctor.address, 0);
      expect((await contract.getRequest(1)).status).to.equal(4n); // Revoked
    });

    it("prevents a patient granting access to someone else's record", async function () {
      await contract
        .connect(patient2)
        .uploadRecord(HASH, "cid-p2", "p2.pdf", "application/pdf", 10, "Lab Report");
      // record 2 belongs to patient2
      await expect(contract.connect(patient).grantAccess(doctor.address, 2)).to.be.revertedWith(
        "MR: caller is not the record owner"
      );
    });

    it("rejects the zero address", async function () {
      await expect(
        contract.connect(patient).grantAccess(ethers.ZeroAddress, 0)
      ).to.be.revertedWith("MR: zero address");
    });

    it("lists granted doctors with their live status", async function () {
      await contract.connect(patient).grantAccess(doctor.address, 0);
      await contract.connect(patient).grantAccess(doctor2.address, 0);
      await contract.connect(patient).revokeAccess(doctor2.address, 0);

      const [wallets, active] = await contract.getGrantedDoctors(patient.address);
      expect(wallets).to.deep.equal([doctor.address, doctor2.address]);
      expect(active[0]).to.equal(true);
      expect(active[1]).to.equal(false);
    });
  });

  // -------------------------------------------------------------------
  describe("TC-05 Unauthorised access", function () {
    beforeEach(async function () {
      await contract.connect(patient).uploadRecord(HASH, CID, "f.pdf", "application/pdf", 100, "Lab Report");
    });

    it("refuses to hand a CID to an unauthorised doctor", async function () {
      await expect(
        contract.connect(doctor).getPatientRecordsAsDoctor(patient.address)
      ).to.be.revertedWith("MR: access denied");
    });

    it("emits AccessDenied when an unauthorised doctor tries to open a record", async function () {
      await expect(contract.connect(doctor).logRecordAccess(1))
        .to.emit(contract, "AccessDenied")
        .withArgs(doctor.address, patient.address, 1n, "no permission", anyUint());
    });

    it("emits RecordViewed for an authorised doctor", async function () {
      await contract.connect(patient).grantAccess(doctor.address, 0);
      await expect(contract.connect(doctor).logRecordAccess(1))
        .to.emit(contract, "RecordViewed")
        .withArgs(doctor.address, patient.address, 1n, anyUint());
    });

    it("keeps one patient out of another patient's records", async function () {
      expect(await contract.canAccessRecord(1, patient2.address)).to.equal(false);
    });

    it("lets a patient always read their own record", async function () {
      expect(await contract.hasAccess(patient.address, patient.address, 1)).to.equal(true);
      const mine = await contract.connect(patient).getMyRecords();
      expect(mine.length).to.equal(1);
    });
  });

  // -------------------------------------------------------------------
  describe("TC-06 Record lifecycle and admin views", function () {
    it("deactivates a record without deleting it", async function () {
      await contract.connect(patient).uploadRecord(HASH, CID, "f.pdf", "application/pdf", 100, "Lab Report");
      await expect(contract.connect(patient).deactivateRecord(1)).to.emit(
        contract,
        "RecordDeactivated"
      );
      const rec = await contract.getRecord(1);
      expect(rec.active).to.equal(false);
      expect(rec.dataHash).to.equal(HASH); // still on chain, still verifiable
    });

    it("stops a non-owner deactivating a record", async function () {
      await contract.connect(patient).uploadRecord(HASH, CID, "f.pdf", "application/pdf", 100, "Lab Report");
      await expect(contract.connect(patient2).deactivateRecord(1)).to.be.revertedWith(
        "MR: caller is not the record owner"
      );
    });

    it("reports accurate system-wide statistics", async function () {
      await contract.connect(patient).uploadRecord(HASH, CID, "a.pdf", "application/pdf", 1, "Lab Report");
      await contract.connect(patient2).uploadRecord(HASH, "cid2", "b.pdf", "application/pdf", 1, "Scan");
      await contract.connect(doctor).requestAccess(patient.address, 0, "r");

      const [p, d, r, q] = await contract.stats();
      expect(p).to.equal(2n);
      expect(d).to.equal(2n);
      expect(r).to.equal(2n);
      expect(q).to.equal(1n);

      expect((await contract.getAllPatients()).length).to.equal(2);
      expect((await contract.getAllDoctors()).length).to.equal(2);
    });
  });
});

// Small helper so timestamp args don't have to be predicted.
function anyUint() {
  const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
  return anyValue;
}
