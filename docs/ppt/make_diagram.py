"""
Draws the MedChain system architecture diagram for the presentation.

Palette matches the reference deck: purple #78206E for headers, red #FF0000
for emphasis, navy #002060 for structure.
"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1700, 2120
BG = (255, 255, 255)
PURPLE = (0x78, 0x20, 0x6E)
RED = (0xFF, 0x00, 0x00)
NAVY = (0x00, 0x20, 0x60)
GREY = (0x44, 0x44, 0x44)
LIGHT = (0xF2, 0xF2, 0xF7)
GREEN = (0x1B, 0x7F, 0x4B)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)


def font(size, bold=False):
    names = (
        ["timesbd.ttf", "arialbd.ttf", "calibrib.ttf"]
        if bold
        else ["times.ttf", "arial.ttf", "calibri.ttf"]
    )
    for n in names:
        p = os.path.join("C:/Windows/Fonts", n)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


F_TITLE = font(46, True)
F_BOX = font(36, True)
F_SUB = font(28)
F_SMALL = font(25)
F_TAG = font(24, True)


def center(text, x, y, f, fill):
    bb = d.textbbox((0, 0), text, font=f)
    d.text((x - (bb[2] - bb[0]) / 2, y - (bb[3] - bb[1]) / 2), text, font=f, fill=fill)


def box(x1, y1, x2, y2, title, lines, accent, fill=LIGHT, r=18):
    d.rounded_rectangle([x1, y1, x2, y2], radius=r, fill=fill, outline=accent, width=5)
    cx = (x1 + x2) / 2
    center(title, cx, y1 + 44, F_BOX, accent)
    yy = y1 + 96
    for ln in lines:
        center(ln, cx, yy, F_SUB, GREY)
        yy += 38


def arrow(x1, y1, x2, y2, color=NAVY, width=5, label=None, label_side="right"):
    d.line([x1, y1, x2, y2], fill=color, width=width)
    # arrowhead
    import math

    ang = math.atan2(y2 - y1, x2 - x1)
    L = 22
    for s in (0.4, -0.4):
        d.line(
            [x2, y2, x2 - L * math.cos(ang - s), y2 - L * math.sin(ang - s)],
            fill=color,
            width=width,
        )
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        bb = d.textbbox((0, 0), label, font=F_SMALL)
        w = bb[2] - bb[0]
        ox = 18 if label_side == "right" else -(w + 18)
        d.rectangle([mx + ox - 6, my - 18, mx + ox + w + 6, my + 18], fill=BG)
        d.text((mx + ox, my - 14), label, font=F_SMALL, fill=color)


# ---------------------------------------------------------------- title
center("System Architecture", W / 2, 46, F_TITLE, PURPLE)
d.line([300, 84, W - 300, 84], fill=PURPLE, width=4)

# ------------------------------------------------------- layer 1: client
box(
    120, 150, W - 120, 430,
    "PRESENTATION LAYER  —  React (Vercel)",
    [
        "Patient  |  Doctor  |  Admin dashboards",
        "AES-256-GCM encryption  •  ECIES key sealing",
        "keccak256 hashing  •  ethers.js  •  MetaMask",
    ],
    PURPLE,
    fill=(0xFA, 0xF4, 0xF9),
)
center("PLAINTEXT EXISTS ONLY HERE", W / 2, 400, F_TAG, RED)

# trust boundary
d.line([90, 470, W - 90, 470], fill=RED, width=4)
for x in range(90, W - 90, 26):
    d.line([x, 470, x + 13, 470], fill=BG, width=6)
d.text((100, 480), "trust boundary  —  only ciphertext and sealed keys cross", font=F_SMALL, fill=RED)

arrow(W / 2, 430, W / 2, 560, RED, label="encrypted payload")

# ------------------------------------------------------ layer 2: backend
box(
    120, 570, W - 120, 830,
    "APPLICATION LAYER  —  Node.js + Express (Render)",
    [
        "JWT authentication  •  role guards",
        "IPFS upload proxy  •  sealed-key custody",
        "verifies permission ON-CHAIN before key release",
    ],
    NAVY,
)
center("HOLDS NO DECRYPTION KEY", W / 2, 800, F_TAG, RED)

# --------------------------------------------- layer 3: chain and storage
arrow(560, 830, 420, 960, NAVY, label="hash + CID", label_side="left")
arrow(1140, 830, 1280, 960, NAVY, label="ciphertext")

box(
    120, 970, 820, 1300,
    "BLOCKCHAIN LAYER",
    [
        "Ethereum Sepolia",
        "MedicalRecord.sol",
        "",
        "hash • CID • permissions",
        "immutable audit events",
    ],
    GREEN,
    fill=(0xF1, 0xF9, 0xF4),
)
center("249 bytes / record", 470, 1262, F_TAG, GREEN)

box(
    880, 970, W - 120, 1300,
    "OFF-CHAIN STORAGE",
    [
        "IPFS via Pinata",
        "",
        "encrypted blobs only",
        "content-addressed (CID)",
        "MongoDB Atlas: metadata",
    ],
    PURPLE,
    fill=(0xFA, 0xF4, 0xF9),
)
center("no readable content", 1290, 1262, F_TAG, PURPLE)

# ------------------------------------------------------------ data flow
d.rounded_rectangle([120, 1360, W - 120, 1660], radius=18, fill=(0xF7, 0xF7, 0xFB), outline=NAVY, width=4)
center("RECORD UPLOAD FLOW", W / 2, 1400, F_BOX, NAVY)

steps = ["Select", "Validate", "Encrypt", "IPFS", "Hash", "Commit", "Confirm"]
n = len(steps)
x0, x1 = 190, W - 190
gap = (x1 - x0) / n
for i, s in enumerate(steps):
    cx = x0 + gap * i + gap / 2
    col = RED if s in ("Encrypt", "Hash", "Commit") else NAVY
    d.rounded_rectangle([cx - 78, 1460, cx + 78, 1545], radius=12, fill=BG, outline=col, width=4)
    center(str(i + 1), cx, 1483, F_SMALL, col)
    center(s, cx, 1520, F_TAG, col)
    if i < n - 1:
        d.line([cx + 82, 1502, cx + gap - 82, 1502], fill=NAVY, width=4)
        d.polygon(
            [(cx + gap - 82, 1502), (cx + gap - 96, 1494), (cx + gap - 96, 1510)],
            fill=NAVY,
        )
center(
    "The complete medical file is NEVER written to the blockchain",
    W / 2, 1600, F_TAG, RED,
)

# --------------------------------------------------------- access gates
d.rounded_rectangle([120, 1710, W - 120, 2060], radius=18, fill=(0xFF, 0xFA, 0xF0), outline=RED, width=4)
center("TWO-GATE ACCESS CONTROL", W / 2, 1752, F_BOX, RED)
box(170, 1800, 820, 1975, "GATE 1", ["on-chain permission", "granted by patient"], NAVY, fill=BG, r=12)
box(880, 1800, W - 170, 1975, "GATE 2", ["key envelope sealed", "to reader's public key"], NAVY, fill=BG, r=12)
center("BOTH required to read  —  revoking EITHER denies access", W / 2, 2020, F_TAG, RED)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "architecture.png")
img.save(out, "PNG")
print("wrote", out, img.size)
