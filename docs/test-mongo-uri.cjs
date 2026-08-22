/**
 * Diagnoses a MongoDB Atlas connection string locally.
 *
 *   npm run test:uri "mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/medchain"
 *
 * Runs the same checks the backend does, then maps the failure to a fix.
 * The password is never printed - only masked forms are shown - so the output
 * is safe to share.
 */
const path = require("path");

const BACKEND = path.join(__dirname, "..", "backend");
const mongoose = require(require.resolve("mongoose", { paths: [BACKEND] }));

const uri = process.argv[2];

function mask(u) {
  return String(u).replace(/\/\/([^:]+):([^@]+)@/, (_, user) => `//${user}:********@`);
}

async function main() {
  if (!uri) {
    console.log("\nUsage:");
    console.log('  npm run test:uri "mongodb+srv://medchain:PASSWORD@cluster0.xxxxx.mongodb.net/medchain"\n');
    console.log("Wrap it in double quotes - the & characters break the command otherwise.\n");
    process.exitCode = 1;
    return;
  }

  console.log("\nMongoDB connection string check");
  console.log("-------------------------------");
  console.log(`String: ${mask(uri)}\n`);

  // ---- static checks, before spending time on the network -----------------
  let blocking = 0;

  if (/[<>]/.test(uri)) {
    console.log("  [FAIL] The string still contains < or >");
    console.log("         You left the <db_password> placeholder in. Replace the whole");
    console.log("         thing - brackets included - with the real password.");
    blocking++;
  } else {
    console.log("  [ok]   No leftover < > placeholders");
  }

  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    console.log("  [FAIL] Does not start with mongodb+srv:// or mongodb://");
    blocking++;
  } else {
    console.log("  [ok]   Scheme looks right");
  }

  const creds = uri.match(/\/\/([^:]+):([^@]+)@/);
  if (!creds) {
    console.log("  [FAIL] No username:password found before the @");
    blocking++;
  } else {
    console.log(`  [ok]   Username: ${creds[1]}`);
    const pw = decodeURIComponent(creds[2]);
    if (/[@:/?#[\]%]/.test(creds[2].replace(/%[0-9a-fA-F]{2}/g, ""))) {
      console.log("  [warn] Password contains characters that need URL encoding");
      console.log("         Easiest fix: Atlas > Database Access > Edit > Autogenerate");
      console.log("         until you get one without @ : / ? # % [ ]");
    }
    if (pw.length < 4) {
      console.log("  [warn] Password looks suspiciously short");
    }
  }

  const dbName = uri.match(/mongodb\.net\/([^?]+)/);
  if (!dbName || !dbName[1]) {
    console.log("  [warn] No database name after the host");
    console.log("         Add /medchain before the ? so data lands in the right database.");
  } else {
    console.log(`  [ok]   Database name: ${dbName[1]}`);
  }

  if (blocking > 0) {
    console.log(`\n${blocking} blocking problem(s). Fix them, then run this again.\n`);
    process.exitCode = 1;
    return;
  }

  // ---- live connection ----------------------------------------------------
  console.log("\n  Connecting (up to 20s)...");
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    console.log("  [ok]   CONNECTED");

    const admin = mongoose.connection.db.admin();
    const info = await admin.serverStatus().catch(() => null);
    console.log(`  [ok]   Database in use: ${mongoose.connection.name}`);
    if (info) console.log(`  [ok]   MongoDB version: ${info.version}`);

    // Prove we can actually write, not just connect.
    const probe = mongoose.connection.collection("__medchain_probe");
    await probe.insertOne({ at: new Date() });
    const n = await probe.countDocuments();
    await probe.drop().catch(() => {});
    console.log(`  [ok]   Read/write works (probe wrote and read ${n} doc)`);

    console.log("\nThis string works. Paste exactly this value into Render as MONGODB_URI,");
    console.log("save, then Manual Deploy > Deploy latest commit.\n");
    await mongoose.disconnect();
  } catch (err) {
    const m = err.message || String(err);
    console.log(`  [FAIL] ${m.split("\n")[0]}\n`);
    console.log("  Diagnosis");
    console.log("  ---------");

    if (/querySrv|ECONNREFUSED _mongodb|EAI_AGAIN|getaddrinfo/i.test(m)) {
      console.log("  Your LOCAL DNS cannot resolve the cluster's SRV record.");
      console.log("  This is your network (college wifi / hotspot / router), NOT Atlas");
      console.log("  and NOT your connection string. Render's DNS is unaffected.");
      console.log("");
      console.log("  Just put the string into Render and check /api/health there.");
      console.log("  To test locally anyway, switch your DNS to 8.8.8.8, or run:");
      console.log("    nslookup -type=SRV _mongodb._tcp.<your-cluster>.mongodb.net 8.8.8.8");
    } else if (/bad auth|Authentication failed|AuthenticationFailed/i.test(m)) {
      console.log("  Wrong username or password.");
      console.log("  Atlas > Database Access > medchain > EDIT > Edit Password >");
      console.log("  Autogenerate > COPY IT > Update User, then rebuild the string.");
    } else if (/IP|whitelist|not allowed|timed out|ETIMEDOUT|ServerSelection/i.test(m)) {
      console.log("  Your network cannot reach the cluster - almost always the IP list.");
      console.log("  Atlas > Network Access > IP Access List > Add IP Address >");
      console.log("  ALLOW ACCESS FROM ANYWHERE (0.0.0.0/0) > Confirm.");
      console.log("  Render's free tier has no fixed IP, so it needs 0.0.0.0/0 too.");
    } else if (/ENOTFOUND/i.test(m)) {
      console.log("  The cluster hostname could not be resolved - check it is typed");
      console.log("  correctly and that Atlas > Clusters shows Cluster0 as active.");
    } else {
      console.log("  Unrecognised error - paste the line above and I can read it.");
    }
    console.log("");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
