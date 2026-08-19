// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MedicalRecord
 * @notice Blockchain-Based Secure Medical Record System.
 *
 * Design rule enforced by this contract: the medical file itself NEVER touches
 * the chain. Only the keccak256 hash of the *encrypted* file, the IPFS CID that
 * points at that encrypted blob, and a small amount of metadata are stored here.
 * That keeps gas bounded and lets anyone verify integrity by re-hashing the blob
 * they downloaded and comparing it against the on-chain value.
 *
 * Access is patient-centric: only the owner of a record may grant or revoke a
 * doctor, and every decision is emitted as an event so the chain doubles as an
 * immutable audit trail.
 */
contract MedicalRecord {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum Role {
        None,
        Patient,
        Doctor,
        Admin
    }

    enum RequestStatus {
        None,
        Pending,
        Approved,
        Rejected,
        Revoked
    }

    struct Patient {
        address wallet;
        string name;
        string profileCid;
        uint256 registeredAt;
        bool exists;
    }

    struct Doctor {
        address wallet;
        string name;
        string specialization;
        string licenseId;
        uint256 registeredAt;
        bool verified;
        bool exists;
    }

    struct Record {
        uint256 id;
        address owner;
        bytes32 dataHash;
        string cid;
        string fileName;
        string fileType;
        uint256 fileSize;
        string recordType;
        uint256 timestamp;
        bool active;
    }

    struct AccessRequest {
        uint256 id;
        uint256 recordId;
        address patient;
        address doctor;
        string reason;
        RequestStatus status;
        uint256 requestedAt;
        uint256 resolvedAt;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    address public admin;

    mapping(address => Role) public roleOf;
    mapping(address => Patient) private patients;
    mapping(address => Doctor) private doctors;

    address[] private patientList;
    address[] private doctorList;

    uint256 public recordCount;
    mapping(uint256 => Record) private records;
    mapping(address => uint256[]) private recordsOfPatient;

    uint256 public requestCount;
    mapping(uint256 => AccessRequest) private requests;
    mapping(address => uint256[]) private requestsOfPatient;
    mapping(address => uint256[]) private requestsOfDoctor;

    // patient => doctor => recordId (0 means the whole chart) => allowed
    mapping(address => mapping(address => mapping(uint256 => bool))) private permissions;

    // patient => doctors ever granted anything, for UI enumeration
    mapping(address => address[]) private grantedDoctors;
    mapping(address => mapping(address => bool)) private grantedDoctorSeen;

    // ---------------------------------------------------------------------
    // Events (the audit trail)
    // ---------------------------------------------------------------------

    event PatientRegistered(address indexed patient, string name, uint256 timestamp);
    event DoctorRegistered(address indexed doctor, string name, string specialization, uint256 timestamp);
    event DoctorVerified(address indexed doctor, bool verified, uint256 timestamp);

    event RecordUploaded(
        uint256 indexed recordId,
        address indexed patient,
        bytes32 dataHash,
        string cid,
        string recordType,
        uint256 timestamp
    );
    event RecordDeactivated(uint256 indexed recordId, address indexed patient, uint256 timestamp);

    event AccessRequested(
        uint256 indexed requestId,
        address indexed doctor,
        address indexed patient,
        uint256 recordId,
        string reason,
        uint256 timestamp
    );
    event AccessGranted(
        address indexed patient,
        address indexed doctor,
        uint256 indexed recordId,
        uint256 requestId,
        uint256 timestamp
    );
    event AccessRejected(
        uint256 indexed requestId,
        address indexed patient,
        address indexed doctor,
        uint256 timestamp
    );
    event AccessRevoked(
        address indexed patient,
        address indexed doctor,
        uint256 indexed recordId,
        uint256 timestamp
    );
    event AccessDenied(
        address indexed doctor,
        address indexed patient,
        uint256 indexed recordId,
        string reason,
        uint256 timestamp
    );
    event RecordViewed(
        address indexed viewer,
        address indexed patient,
        uint256 indexed recordId,
        uint256 timestamp
    );

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyAdmin() {
        require(msg.sender == admin, "MR: caller is not admin");
        _;
    }

    modifier onlyPatient() {
        require(patients[msg.sender].exists, "MR: caller is not a registered patient");
        _;
    }

    modifier onlyDoctor() {
        require(doctors[msg.sender].exists, "MR: caller is not a registered doctor");
        _;
    }

    modifier onlyRecordOwner(uint256 recordId) {
        require(recordId > 0 && recordId <= recordCount, "MR: record does not exist");
        require(records[recordId].owner == msg.sender, "MR: caller is not the record owner");
        _;
    }

    modifier validAddress(address account) {
        require(account != address(0), "MR: zero address");
        _;
    }

    constructor() {
        admin = msg.sender;
        roleOf[msg.sender] = Role.Admin;
    }

    // ---------------------------------------------------------------------
    // Registration
    // ---------------------------------------------------------------------

    function registerPatient(string calldata name, string calldata profileCid) external {
        require(!patients[msg.sender].exists, "MR: patient already registered");
        require(!doctors[msg.sender].exists, "MR: address already registered as doctor");
        require(bytes(name).length > 0, "MR: name required");

        patients[msg.sender] = Patient({
            wallet: msg.sender,
            name: name,
            profileCid: profileCid,
            registeredAt: block.timestamp,
            exists: true
        });
        patientList.push(msg.sender);
        roleOf[msg.sender] = Role.Patient;

        emit PatientRegistered(msg.sender, name, block.timestamp);
    }

    function registerDoctor(
        string calldata name,
        string calldata specialization,
        string calldata licenseId
    ) external {
        require(!doctors[msg.sender].exists, "MR: doctor already registered");
        require(!patients[msg.sender].exists, "MR: address already registered as patient");
        require(bytes(name).length > 0, "MR: name required");
        require(bytes(licenseId).length > 0, "MR: license id required");

        doctors[msg.sender] = Doctor({
            wallet: msg.sender,
            name: name,
            specialization: specialization,
            licenseId: licenseId,
            registeredAt: block.timestamp,
            verified: false,
            exists: true
        });
        doctorList.push(msg.sender);
        roleOf[msg.sender] = Role.Doctor;

        emit DoctorRegistered(msg.sender, name, specialization, block.timestamp);
    }

    /// @notice Admin marks a doctor licence-verified. Informational for the UI;
    /// access control still rests entirely with the patient.
    function setDoctorVerified(address doctor, bool verified)
        external
        onlyAdmin
        validAddress(doctor)
    {
        require(doctors[doctor].exists, "MR: unknown doctor");
        doctors[doctor].verified = verified;
        emit DoctorVerified(doctor, verified, block.timestamp);
    }

    function transferAdmin(address newAdmin) external onlyAdmin validAddress(newAdmin) {
        roleOf[admin] = Role.None;
        admin = newAdmin;
        roleOf[newAdmin] = Role.Admin;
    }

    // ---------------------------------------------------------------------
    // Records
    // ---------------------------------------------------------------------

    /**
     * @param dataHash keccak256 of the encrypted file bytes.
     * @param cid      IPFS CID of the encrypted blob.
     */
    function uploadRecord(
        bytes32 dataHash,
        string calldata cid,
        string calldata fileName,
        string calldata fileType,
        uint256 fileSize,
        string calldata recordType
    ) external onlyPatient returns (uint256) {
        require(dataHash != bytes32(0), "MR: empty hash");
        require(bytes(cid).length > 0, "MR: empty cid");

        recordCount += 1;
        uint256 id = recordCount;

        records[id] = Record({
            id: id,
            owner: msg.sender,
            dataHash: dataHash,
            cid: cid,
            fileName: fileName,
            fileType: fileType,
            fileSize: fileSize,
            recordType: recordType,
            timestamp: block.timestamp,
            active: true
        });
        recordsOfPatient[msg.sender].push(id);

        emit RecordUploaded(id, msg.sender, dataHash, cid, recordType, block.timestamp);
        return id;
    }

    /// @notice Records are never erased (immutability); they are flagged inactive.
    function deactivateRecord(uint256 recordId) external onlyRecordOwner(recordId) {
        records[recordId].active = false;
        emit RecordDeactivated(recordId, msg.sender, block.timestamp);
    }

    function getRecord(uint256 recordId) external view returns (Record memory) {
        require(recordId > 0 && recordId <= recordCount, "MR: record does not exist");
        return records[recordId];
    }

    function getPatientRecordIds(address patient) external view returns (uint256[] memory) {
        return recordsOfPatient[patient];
    }

    function getMyRecords() external view returns (Record[] memory) {
        return _recordsFor(msg.sender);
    }

    /**
     * @notice Doctor-facing read. Reverts unless the patient has granted access,
     * so an unauthorised doctor can never pull back a CID.
     */
    function getPatientRecordsAsDoctor(address patient)
        external
        view
        onlyDoctor
        returns (Record[] memory)
    {
        require(hasAccess(patient, msg.sender, 0), "MR: access denied");
        return _recordsFor(patient);
    }

    function _recordsFor(address patient) internal view returns (Record[] memory) {
        uint256[] storage ids = recordsOfPatient[patient];
        Record[] memory out = new Record[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            out[i] = records[ids[i]];
        }
        return out;
    }

    /// @notice Verify a downloaded blob against the on-chain hash.
    function verifyRecordIntegrity(uint256 recordId, bytes32 candidateHash)
        external
        view
        returns (bool)
    {
        require(recordId > 0 && recordId <= recordCount, "MR: record does not exist");
        return records[recordId].dataHash == candidateHash;
    }

    // ---------------------------------------------------------------------
    // Access requests
    // ---------------------------------------------------------------------

    /// @param recordId 0 to request the whole chart, or a specific record id.
    function requestAccess(
        address patient,
        uint256 recordId,
        string calldata reason
    ) external onlyDoctor validAddress(patient) returns (uint256) {
        require(patients[patient].exists, "MR: unknown patient");
        require(recordId == 0 || records[recordId].owner == patient, "MR: record/patient mismatch");

        requestCount += 1;
        uint256 id = requestCount;

        requests[id] = AccessRequest({
            id: id,
            recordId: recordId,
            patient: patient,
            doctor: msg.sender,
            reason: reason,
            status: RequestStatus.Pending,
            requestedAt: block.timestamp,
            resolvedAt: 0
        });
        requestsOfPatient[patient].push(id);
        requestsOfDoctor[msg.sender].push(id);

        emit AccessRequested(id, msg.sender, patient, recordId, reason, block.timestamp);
        return id;
    }

    function approveRequest(uint256 requestId) external {
        AccessRequest storage r = requests[requestId];
        require(r.id != 0, "MR: unknown request");
        require(r.patient == msg.sender, "MR: only the patient can approve");
        require(r.status == RequestStatus.Pending, "MR: request already resolved");

        r.status = RequestStatus.Approved;
        r.resolvedAt = block.timestamp;
        _grant(msg.sender, r.doctor, r.recordId);

        emit AccessGranted(msg.sender, r.doctor, r.recordId, requestId, block.timestamp);
    }

    function rejectRequest(uint256 requestId) external {
        AccessRequest storage r = requests[requestId];
        require(r.id != 0, "MR: unknown request");
        require(r.patient == msg.sender, "MR: only the patient can reject");
        require(r.status == RequestStatus.Pending, "MR: request already resolved");

        r.status = RequestStatus.Rejected;
        r.resolvedAt = block.timestamp;

        emit AccessRejected(requestId, msg.sender, r.doctor, block.timestamp);
        emit AccessDenied(r.doctor, msg.sender, r.recordId, "request rejected by patient", block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Direct grant / revoke
    // ---------------------------------------------------------------------

    function grantAccess(address doctor, uint256 recordId)
        external
        onlyPatient
        validAddress(doctor)
    {
        require(doctors[doctor].exists, "MR: unknown doctor");
        require(
            recordId == 0 || records[recordId].owner == msg.sender,
            "MR: caller is not the record owner"
        );
        _grant(msg.sender, doctor, recordId);
        emit AccessGranted(msg.sender, doctor, recordId, 0, block.timestamp);
    }

    function revokeAccess(address doctor, uint256 recordId)
        external
        onlyPatient
        validAddress(doctor)
    {
        require(
            recordId == 0 || records[recordId].owner == msg.sender,
            "MR: caller is not the record owner"
        );
        permissions[msg.sender][doctor][recordId] = false;

        uint256[] storage ids = requestsOfPatient[msg.sender];
        for (uint256 i = 0; i < ids.length; i++) {
            AccessRequest storage r = requests[ids[i]];
            if (r.doctor == doctor && r.recordId == recordId && r.status == RequestStatus.Approved) {
                r.status = RequestStatus.Revoked;
                r.resolvedAt = block.timestamp;
            }
        }

        emit AccessRevoked(msg.sender, doctor, recordId, block.timestamp);
    }

    function _grant(address patient, address doctor, uint256 recordId) internal {
        permissions[patient][doctor][recordId] = true;
        if (!grantedDoctorSeen[patient][doctor]) {
            grantedDoctorSeen[patient][doctor] = true;
            grantedDoctors[patient].push(doctor);
        }
    }

    // ---------------------------------------------------------------------
    // Access verification
    // ---------------------------------------------------------------------

    /**
     * @notice True when `doctor` may read `recordId` of `patient`.
     * A chart-wide grant (recordId 0) implies access to every record.
     */
    function hasAccess(address patient, address doctor, uint256 recordId)
        public
        view
        returns (bool)
    {
        if (patient == doctor) return true;
        if (permissions[patient][doctor][0]) return true;
        if (recordId != 0 && permissions[patient][doctor][recordId]) return true;
        return false;
    }

    function canAccessRecord(uint256 recordId, address viewer) external view returns (bool) {
        if (recordId == 0 || recordId > recordCount) return false;
        Record storage rec = records[recordId];
        if (!rec.active) return false;
        return hasAccess(rec.owner, viewer, recordId);
    }

    /**
     * @notice State-changing access check used by the doctor UI so that both a
     * successful view and a denied attempt land in the on-chain audit trail.
     */
    function logRecordAccess(uint256 recordId) external returns (bool) {
        require(recordId > 0 && recordId <= recordCount, "MR: record does not exist");
        Record storage rec = records[recordId];

        if (!hasAccess(rec.owner, msg.sender, recordId)) {
            emit AccessDenied(msg.sender, rec.owner, recordId, "no permission", block.timestamp);
            return false;
        }
        emit RecordViewed(msg.sender, rec.owner, recordId, block.timestamp);
        return true;
    }

    // ---------------------------------------------------------------------
    // Views / enumeration
    // ---------------------------------------------------------------------

    function getPatient(address wallet) external view returns (Patient memory) {
        return patients[wallet];
    }

    function getDoctor(address wallet) external view returns (Doctor memory) {
        return doctors[wallet];
    }

    function isPatient(address wallet) external view returns (bool) {
        return patients[wallet].exists;
    }

    function isDoctor(address wallet) external view returns (bool) {
        return doctors[wallet].exists;
    }

    function getAllPatients() external view returns (Patient[] memory) {
        Patient[] memory out = new Patient[](patientList.length);
        for (uint256 i = 0; i < patientList.length; i++) {
            out[i] = patients[patientList[i]];
        }
        return out;
    }

    function getAllDoctors() external view returns (Doctor[] memory) {
        Doctor[] memory out = new Doctor[](doctorList.length);
        for (uint256 i = 0; i < doctorList.length; i++) {
            out[i] = doctors[doctorList[i]];
        }
        return out;
    }

    function getRequest(uint256 requestId) external view returns (AccessRequest memory) {
        require(requests[requestId].id != 0, "MR: unknown request");
        return requests[requestId];
    }

    function getPatientRequests(address patient) external view returns (AccessRequest[] memory) {
        return _requests(requestsOfPatient[patient]);
    }

    function getDoctorRequests(address doctor) external view returns (AccessRequest[] memory) {
        return _requests(requestsOfDoctor[doctor]);
    }

    function _requests(uint256[] storage ids) internal view returns (AccessRequest[] memory) {
        AccessRequest[] memory out = new AccessRequest[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            out[i] = requests[ids[i]];
        }
        return out;
    }

    /// @notice Doctors this patient has ever granted, with current chart-wide status.
    function getGrantedDoctors(address patient)
        external
        view
        returns (address[] memory wallets, bool[] memory active)
    {
        address[] storage list = grantedDoctors[patient];
        wallets = new address[](list.length);
        active = new bool[](list.length);
        for (uint256 i = 0; i < list.length; i++) {
            wallets[i] = list[i];
            active[i] = permissions[patient][list[i]][0];
        }
    }

    function stats()
        external
        view
        returns (
            uint256 totalPatients,
            uint256 totalDoctors,
            uint256 totalRecords,
            uint256 totalRequests
        )
    {
        return (patientList.length, doctorList.length, recordCount, requestCount);
    }
}
