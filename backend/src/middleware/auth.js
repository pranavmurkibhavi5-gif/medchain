const jwt = require("jsonwebtoken");
const config = require("../config");
const store = require("../config/store");

function sign(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/** Populates req.user, or 401s. */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required" });

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await store.users.findById(payload.sub);
    if (!user || !user.active) return res.status(401).json({ error: "Account not found or disabled" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

/** requireRole("doctor") or requireRole("patient", "admin") */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(" or ")}` });
    }
    next();
  };
}

/** Routes that need a linked wallet (anything touching the chain). */
function requireWallet(req, res, next) {
  if (!req.user || !req.user.walletAddress) {
    return res.status(400).json({ error: "Connect and link your MetaMask wallet first" });
  }
  next();
}

module.exports = { sign, requireAuth, requireRole, requireWallet };
