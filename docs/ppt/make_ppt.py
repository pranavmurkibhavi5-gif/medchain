"""
Builds the project presentation by cloning the reference deck.

Cloning rather than generating from scratch is deliberate: the reference embeds
custom fonts (TT Phobos Bold, Aptos) that are not installed on this machine and
carries the institution logos as images inside grouped shapes. Rebuilding would
lose both. Instead we duplicate its slides and swap the text, so the header
band, colour scheme, font hierarchy and layout geometry are preserved exactly.
"""
import copy
import os
import re

from pptx import Presentation
from pptx.util import Emu, Pt
from pptx.opc.constants import RELATIONSHIP_TYPE as RT

HERE = os.path.dirname(os.path.abspath(__file__))
REF = "C:/Users/Hp/Desktop/final ppt.pptx"
OUT = os.path.join(HERE, "Blockchain-Based-Secure-Medical-Record.pptx")
DIAGRAM = os.path.join(HERE, "architecture.png")

prs = Presentation(REF)


# ---------------------------------------------------------------------------
# Slide plumbing
# ---------------------------------------------------------------------------
def clone_slide(src_index):
    """Duplicate a slide, remapping image relationships so logos survive."""
    src = prs.slides[src_index]
    dest = prs.slides.add_slide(src.slide_layout)

    # add_slide copies layout placeholders; drop them, we copy shapes verbatim
    for shp in list(dest.shapes):
        shp._element.getparent().remove(shp._element)

    # map source image rIds -> new rIds on the destination part
    rid_map = {}
    for rid, rel in src.part.rels.items():
        if rel.reltype == RT.IMAGE:
            rid_map[rid] = dest.part.relate_to(rel._target, RT.IMAGE)

    for shp in src.shapes:
        el = copy.deepcopy(shp._element)
        xml = el.xml
        if rid_map:
            for old, new in rid_map.items():
                xml = xml.replace('r:embed="%s"' % old, 'r:embed="%s"' % new)
                xml = xml.replace('r:link="%s"' % old, 'r:link="%s"' % new)
            from pptx.oxml import parse_xml

            el = parse_xml(xml)
        dest.shapes._spTree.append(el)
    return dest


def reorder(order):
    """order: list of 0-based current indices, in the sequence wanted."""
    sldIdLst = prs.slides._sldIdLst
    ids = list(sldIdLst)
    for el in ids:
        sldIdLst.remove(el)
    for i in order:
        sldIdLst.append(ids[i])


def drop_slides(indices):
    sldIdLst = prs.slides._sldIdLst
    ids = list(sldIdLst)
    for i in sorted(indices, reverse=True):
        rId = ids[i].get(
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        )
        prs.part.drop_rel(rId)
        sldIdLst.remove(ids[i])


# ---------------------------------------------------------------------------
# Text plumbing - preserve the reference's run formatting
# ---------------------------------------------------------------------------
def _first_run(p):
    runs = p.findall(
        "{http://schemas.openxmlformats.org/drawingml/2006/main}r"
    )
    return runs[0] if runs else None


def set_lines(tf, lines, size=None):
    """Replace a text frame's paragraphs, keeping the first run's formatting."""
    a = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    paras = tf._txBody.findall(a + "p")
    template = None
    for p in paras:
        if _first_run(p) is not None:
            template = copy.deepcopy(p)
            break
    if template is None:
        template = copy.deepcopy(paras[0])

    # keep only the first run inside the template
    runs = template.findall(a + "r")
    for extra in runs[1:]:
        template.remove(extra)
    for br in template.findall(a + "br"):
        template.remove(br)

    for p in paras:
        tf._txBody.remove(p)

    for line in lines:
        p = copy.deepcopy(template)
        r = _first_run(p)
        if r is None:
            tf._txBody.append(p)
            continue
        t = r.find(a + "t")
        if t is None:
            t = r.makeelement(a + "t", {})
            r.append(t)
        t.text = line
        if size is not None:
            rPr = r.find(a + "rPr")
            if rPr is None:
                rPr = r.makeelement(a + "rPr", {})
                r.insert(0, rPr)
            rPr.set("sz", str(int(size * 100)))
        tf._txBody.append(p)


def by_text(slide, needle):
    for sh in slide.shapes:
        if sh.has_text_frame and needle.lower() in sh.text_frame.text.lower():
            return sh
    return None


def title_shape(slide):
    """The red heading textbox - smallish box, not the purple header band."""
    best = None
    for sh in slide.shapes:
        if not sh.has_text_frame:
            continue
        xml = sh._element.xml
        if 'val="FF0000"' in xml and sh.top is not None and sh.top > Emu(900000):
            if best is None or sh.top < best.top:
                best = sh
    return best


def body_shape(slide, exclude):
    skip = {id(x) for x in exclude if x is not None}
    cands = []
    for sh in slide.shapes:
        if not sh.has_text_frame or id(sh) in skip:
            continue
        if sh.top is not None and sh.top > Emu(2200000):
            cands.append(sh)
    return max(cands, key=lambda s: (s.width or 0) * (s.height or 0)) if cands else None


# ---------------------------------------------------------------------------
# Table plumbing
# ---------------------------------------------------------------------------
def fit_table(shape, tbl, top_in, bottom_in=10.9, header_frac=0.11, font_pt=None):
    """Size rows so the whole table fits above `bottom_in`."""
    avail = bottom_in - top_in
    n = len(tbl.rows)
    hdr = avail * header_frac
    body = (avail - hdr) / max(1, n - 1)
    for i, r in enumerate(tbl.rows):
        r.height = Emu(int((hdr if i == 0 else body) * 914400))
    if font_pt:
        a = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
        for rPr in tbl._tbl.iter(a + "rPr"):
            rPr.set("sz", str(int(font_pt * 100)))
        for dPr in tbl._tbl.iter(a + "defRPr"):
            dPr.set("sz", str(int(font_pt * 100)))


def set_table(tbl, rows):
    """rows: list of row-lists. Grows/shrinks by cloning the last body row."""
    a = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    tbl_el = tbl._tbl
    trs = tbl_el.findall(a + "tr")
    need = len(rows)

    while len(trs) < need:
        tbl_el.append(copy.deepcopy(trs[-1]))
        trs = tbl_el.findall(a + "tr")
    while len(trs) > need:
        tbl_el.remove(trs[-1])
        trs = tbl_el.findall(a + "tr")

    for r_i, row in enumerate(rows):
        for c_i, val in enumerate(row):
            if c_i >= len(tbl.columns):
                break
            cell = tbl.cell(r_i, c_i)
            set_lines(cell.text_frame, str(val).split("\n"))


# ---------------------------------------------------------------------------
# Content
# ---------------------------------------------------------------------------
TITLE = "Blockchain-Based Secure Medical Record System"

TEAM = [
    "Rakesh Patil                        : 2BU23CB059",
    "Pranav Murkibhavi             : 2BU23CB057",
    "Manu Nandihalli                  : 2BU23CB047",
    "Abhishek Mallgoudnavar   : 2BU23CB001",
]

INTRO = [
    "The Blockchain-Based Secure Medical Record System is designed to give patients "
    "verifiable ownership of their health data. Medical files are encrypted inside the "
    "patient's own browser using AES-256-GCM, stored off-chain on IPFS, and anchored to "
    "the Ethereum blockchain by a cryptographic hash. The complete medical file is never "
    "written to the blockchain.",
    "",
    "Access is governed by a smart contract rather than by a server administrator. A doctor "
    "must request permission, and only the patient can approve, reject or revoke it. Every "
    "such decision is recorded permanently as a blockchain event, producing an audit trail "
    "that no hospital, developer or administrator can alter or delete.",
]

PROBLEM = [
    "Existing medical record systems store sensitive patient data in centralized databases, "
    "which creates three structural weaknesses.",
    "",
    "Confidentiality: a single intrusion exposes every record at once, making healthcare one "
    "of the most frequently breached sectors.",
    "",
    "Integrity: when one organization holds both the records and the access log, that log is "
    "only as trustworthy as the organization. Alterations leave no evidence a patient can verify.",
    "",
    "Control: patients cannot technically grant or withdraw access. Consent is a policy promise "
    "rather than an enforced constraint, and patients cannot see who has read their data.",
]

OBJECTIVES = [
    "To encrypt every medical record in the browser before it leaves the patient's device.",
    "To store encrypted records off-chain on IPFS and anchor only the hash on the blockchain.",
    "To guarantee data integrity so that any tampering is immediately detectable.",
    "To enforce patient-controlled access through smart contracts rather than server policy.",
    "To allow patients to grant, reject and revoke doctor access at any time.",
    "To maintain an immutable audit trail of every access request, approval and denial.",
    "To ensure that neither the server nor an administrator can decrypt any medical record.",
    "To deploy the system as a public website usable from any browser with MetaMask.",
]

METHODOLOGY = [
    "Step 1  Patient selects a medical file in the browser.",
    "Step 2  File type and size are validated before processing.",
    "Step 3  A fresh 256-bit key encrypts the file using AES-256-GCM.",
    "Step 4  The ciphertext is uploaded to IPFS, which returns a Content Identifier (CID).",
    "Step 5  keccak256 of the ciphertext is computed as the integrity proof.",
    "Step 6  Hash, CID and metadata are committed on-chain in one signed transaction.",
    "Step 7  On confirmation, the data key is sealed to the patient's own public key.",
    "",
    "The hash is taken over the ciphertext, so integrity can be verified by anyone holding the "
    "file, even without a decryption key.",
]

STACK = [
    "Frontend:  React 18, Vite, Tailwind CSS, ethers.js v6",
    "Backend:  Node.js, Express, JWT authentication",
    "Blockchain:  Solidity 0.8.24, Hardhat, Ethereum Sepolia testnet",
    "Wallet:  MetaMask for identity and transaction signing",
    "Off-chain storage:  IPFS through the Pinata pinning service",
    "Database:  MongoDB Atlas for metadata and sealed key envelopes",
    "Cryptography:  Web Crypto API (AES-GCM), @noble/secp256k1 (ECIES)",
    "Deployment:  Vercel (frontend), Render (backend), Sepolia (contract)",
]

CONTRACT = [
    "MedicalRecord.sol stores identities, record metadata, permissions and audit events.",
    "",
    "Core functions:  registerPatient, registerDoctor, uploadRecord, requestAccess, "
    "approveRequest, rejectRequest, grantAccess, revokeAccess, hasAccess.",
    "",
    "Security modifiers:  onlyPatient, onlyDoctor, onlyRecordOwner, onlyAdmin, validAddress.",
    "",
    "Audit events:  RecordUploaded, AccessRequested, AccessGranted, AccessRejected, "
    "AccessRevoked, AccessDenied, RecordViewed.",
    "",
    "Records are never deleted. deactivateRecord flags them inactive so history stays verifiable.",
]

SECURITY = [
    "Wallet-derived encryption key:  MetaMask refuses to export a private key, so the system "
    "derives one. The user signs a fixed message; because wallet ECDSA is deterministic (RFC 6979), "
    "that signature is stable, and hashing it yields a reproducible secp256k1 keypair. The private "
    "key exists only in memory; the server learns only the public half.",
    "",
    "Per-record keys:  each record is encrypted under its own random AES-256 key, which is sealed "
    "to a recipient using ECIES (ephemeral ECDH, HKDF-SHA256, AES-GCM).",
    "",
    "Two-gate access:  reading a record requires both an on-chain permission and a key envelope "
    "sealed to the reader. Revoking either gate alone is sufficient to deny access.",
]

DEPLOYMENT = [
    "The system is deployed publicly and is reachable from any laptop with a browser and MetaMask.",
    "",
    "Website:  medchain-records.vercel.app",
    "Backend API:  medchain-api-j6hv.onrender.com",
    "Smart contract:  0xAE246FCcad4F7aF88C1c6B3d17FaF2105D345824  (Ethereum Sepolia)",
    "",
    "Verification:  29 smart contract unit tests and 56 full-stack integration assertions all pass. "
    "Deployed bytecode is 17,046 bytes, within the 24,576-byte EIP-170 limit.",
]

RESULTS = [
    "The system was implemented, deployed and tested end to end on a public Ethereum testnet.",
    "",
    "Patients successfully uploaded records that were encrypted in the browser, pinned to IPFS and "
    "anchored on-chain. Integrity verification confirmed that every retrieved file hashed to exactly "
    "the value recorded on the blockchain.",
    "",
    "Access control behaved as designed under adversarial testing. An unauthorised doctor was refused "
    "by the smart contract and by the API independently, and the attempt was logged on-chain as an "
    "AccessDenied event. After the patient approved the request the same doctor could decrypt the "
    "record, and after revocation access was denied immediately.",
    "",
    "Administrators could view record metadata and system activity but could not decrypt any medical "
    "content, confirming that confidentiality does not depend on administrator trust.",
]

CONCLUSION = [
    "The system demonstrates that blockchain and client-side encryption together can deliver medical "
    "records that are confidential, tamper-evident and genuinely patient-controlled.",
    "",
    "Storing only a hash on-chain keeps the cost constant at 249 bytes per record regardless of file "
    "size, making the design scalable for real clinical data.",
    "",
    "Future Scope:",
    "Key recovery through social recovery or threshold secret sharing.",
    "Reducing on-chain metadata leakage using zero-knowledge proofs.",
    "Controlled emergency access for unconscious patients.",
    "Integration with hospital information systems and a progressive web app for mobile.",
]

LIT_1 = [
    ["SI No.", "Author & Year", "Title", "Methodology", "Dataset", "Result"],
    [
        "1",
        "A. Azaria, A. Ekblaw, T. Vieira, A. Lippman (2016)",
        "MedRec: Using Blockchain for Medical Data Access and Permission Management",
        "Ethereum smart contracts managing authorization and pointers to provider databases",
        "Provider EMR databases (pointers only)",
        "Decentralized permission management; established on-chain permissions with off-chain data",
    ],
    [
        "2",
        "Q. Xia, E. B. Sifah, K. O. Asamoah, et al. (2017)",
        "MeDShare: Trust-less Medical Data Sharing Among Cloud Service Providers",
        "Smart contracts with provenance tracking and automatic revocation on misuse",
        "Cloud-hosted medical datasets",
        "Auditable data sharing between untrusted providers with automated revocation",
    ],
    [
        "3",
        "G. Zyskind, O. Nathan, A. Pentland (2015)",
        "Decentralizing Privacy: Using Blockchain to Protect Personal Data",
        "Blockchain as an automated access-control manager storing pointers and permissions",
        "Personal data stored off-chain",
        "Removed need to trust a third party for access control enforcement",
    ],
]

LIT_2 = [
    ["SI No.", "Author & Year", "Title", "Methodology", "Dataset", "Result"],
    [
        "4",
        "A. Dubovitskaya, Z. Xu, S. Ryu, M. Schumacher, F. Wang (2017)",
        "Secure and Trustable Electronic Medical Records Sharing Using Blockchain",
        "Permissioned blockchain among known hospitals with cloud storage",
        "Oncology patient records",
        "Improved sharing within a regulated consortium of accountable institutions",
    ],
    [
        "5",
        "T. T. Kuo, H. E. Kim, L. Ohno-Machado (2017)",
        "Blockchain Distributed Ledger Technologies for Biomedical and Health Care Applications",
        "Comparative survey of distributed ledger designs for biomedical use",
        "Review of existing biomedical systems",
        "Identified immutability and auditability as key benefits; flagged scalability limits",
    ],
    [
        "6",
        "J. Benet (2014)",
        "IPFS: Content Addressed, Versioned, Peer-to-Peer File System",
        "Content-addressed distributed storage where the identifier derives from file contents",
        "Distributed file storage network",
        "Enables off-chain storage whose integrity is verifiable from the identifier alone",
    ],
]

GAS_TABLE = [
    ["SI No.", "Contract Operation", "Gas Used", "Cost (ETH)", "Cost (USD)", "Frequency"],
    ["1", "Contract deployment", "3,780,959", "0.075619", "226.86", "One time"],
    ["2", "registerPatient", "186,023", "0.003720", "11.16", "Per patient"],
    ["3", "registerDoctor", "230,839", "0.004617", "13.85", "Per doctor"],
    ["4", "uploadRecord", "367,574", "0.007351", "22.05", "Per record"],
    ["5", "requestAccess", "279,970", "0.005599", "16.80", "Per request"],
    ["6", "approveRequest", "149,465", "0.002989", "8.97", "Per approval"],
    ["7", "revokeAccess", "46,148", "0.000923", "2.77", "Per revocation"],
    ["8", "logRecordAccess", "30,732", "0.000615", "1.84", "Per record read"],
]

PERF_TABLE = [
    ["File Size", "AES Encrypt (ms)", "AES Speed (MB/s)", "keccak256 (ms)", "Hash Speed (MB/s)", "Total (ms)"],
    ["100 KB", "0.3", "293", "8.5", "11", "10.2"],
    ["500 KB", "0.6", "777", "39.3", "12", "41.6"],
    ["1 MB", "1.6", "643", "95.3", "10", "100.2"],
    ["5 MB", "9.1", "550", "554.9", "9", "525.0"],
    ["10 MB", "13.9", "721", "1049.8", "10", "1195.1"],
]

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
# Reference indices: 0 title, 1 body, 2 table, 3 table, 4 bullets, 5 picture,
# 6 body(low title), 7 thank you
BODY_T, TABLE_T, BULLET_T, PIC_T = 1, 2, 4, 5

new = {}
new["problem"] = clone_slide(BODY_T)
new["methodology"] = clone_slide(BULLET_T)
new["stack"] = clone_slide(BULLET_T)
new["contract"] = clone_slide(BULLET_T)
new["security"] = clone_slide(BULLET_T)
new["deployment"] = clone_slide(BULLET_T)
new["gas"] = clone_slide(TABLE_T)
new["perf"] = clone_slide(TABLE_T)
new["conclusion"] = clone_slide(BULLET_T)

S = prs.slides


def fill(slide, heading, lines, size=None):
    ts = title_shape(slide)
    if ts is not None:
        set_lines(ts.text_frame, [heading])
    bs = body_shape(slide, exclude=[ts])
    if bs is not None:
        set_lines(bs.text_frame, lines, size=size)
    return slide


# --- 1 title -------------------------------------------------------------
t = S[0]
sh = by_text(t, "AI-Based Personal Expense")
if sh:
    set_lines(sh.text_frame, [TITLE])
sh = by_text(t, "Darshan")
if sh:
    set_lines(sh.text_frame, TEAM)
sh = by_text(t, "Group no")
if sh:
    set_lines(sh.text_frame, ["Group no: ___"])
for shp in t.shapes:
    if shp.has_text_frame and "Harshada" in shp.text_frame.text:
        txt = shp.text_frame.text.replace("Prof. Harshada G", "Ms. Afziya Garag")
        set_lines(shp.text_frame, [l for l in txt.split("\n")])

# --- 2 introduction ------------------------------------------------------
fill(S[1], "Introduction", INTRO, size=20)

# --- 3,4 literature ------------------------------------------------------
for idx, data in ((2, LIT_1), (3, LIT_2)):
    sl = S[idx]
    ts = title_shape(sl)
    if ts is not None:
        set_lines(ts.text_frame, ["Literature Survey:"])
    for shp in sl.shapes:
        if shp.has_table:
            set_table(shp.table, data)
            shp.top = Emu(int(3.0 * 914400))
            fit_table(shp, shp.table, 3.0, bottom_in=10.9, font_pt=13)

# --- 5 problem -----------------------------------------------------------
fill(new["problem"], "Problem Statement", PROBLEM, size=19)

# --- 6 objectives --------------------------------------------------------
fill(S[4], "Objectives", OBJECTIVES, size=22)

# --- 7 architecture ------------------------------------------------------
arch = S[5]
ts = title_shape(arch)
if ts is not None:
    set_lines(ts.text_frame, ["System Architecture"])
for shp in list(arch.shapes):
    if shp.shape_type == 13:  # PICTURE
        shp._element.getparent().remove(shp._element)
img_h = Emu(int(8.1 * 914400))
img_w = Emu(int(8.1 * 914400 * 1700 / 2120))
arch.shapes.add_picture(
    DIAGRAM,
    Emu(int((prs.slide_width - img_w) / 2)),
    Emu(int(2.95 * 914400)),
    width=img_w,
    height=img_h,
)

# --- 8..12 ---------------------------------------------------------------
fill(new["methodology"], "Methodology", METHODOLOGY, size=20)
fill(new["stack"], "Technology Stack", STACK, size=22)
fill(new["contract"], "Smart Contract Design", CONTRACT, size=20)
fill(new["security"], "Security & Key Management", SECURITY, size=18)
fill(new["deployment"], "Implementation & Deployment", DEPLOYMENT, size=20)

# --- 13 results ----------------------------------------------------------
fill(S[6], "Result", RESULTS, size=19)

# --- 14,15 performance tables -------------------------------------------
for slide, head, data in (
    (new["gas"], "Performance Analysis: Gas Cost", GAS_TABLE),
    (new["perf"], "Performance Analysis: Encryption", PERF_TABLE),
):
    ts = title_shape(slide)
    if ts is not None:
        set_lines(ts.text_frame, [head])
    for shp in slide.shapes:
        if shp.has_table:
            set_table(shp.table, data)
            shp.top = Emu(int(3.0 * 914400))
            fit_table(shp, shp.table, 3.0, bottom_in=10.8,
                      font_pt=15 if len(data) <= 6 else 13)

# --- 16 conclusion -------------------------------------------------------
fill(new["conclusion"], "Conclusion & Future Scope", CONCLUSION, size=20)

# --- order ---------------------------------------------------------------
def pos(slide):
    for i, s in enumerate(prs.slides):
        if s is slide:
            return i
    raise ValueError


order = [
    0,                      # title
    1,                      # introduction
    2, 3,                   # literature survey
    pos(new["problem"]),
    4,                      # objectives
    5,                      # architecture
    pos(new["methodology"]),
    pos(new["stack"]),
    pos(new["contract"]),
    pos(new["security"]),
    pos(new["deployment"]),
    6,                      # result
    pos(new["gas"]),
    pos(new["perf"]),
    pos(new["conclusion"]),
    7,                      # thank you
]
reorder(order)

prs.save(OUT)
print("wrote", OUT)
print("slides:", len(prs.slides.__iter__.__self__._sldIdLst))
