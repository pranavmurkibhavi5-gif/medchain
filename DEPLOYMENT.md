# Deployment guide

Goal: a public website reachable from any laptop with only a browser and
MetaMask. No VS Code, no Node.js, no Ganache, no localhost.

Total cost: **nothing**. Every service below has a free tier.

Work through the five steps in order — each one produces a value the next
step needs.

---

## Step 1 — Deploy the smart contract to Sepolia

### 1.1 Get a funded deployer account

1. In MetaMask, create a **new account** just for deploying. Never use an
   account holding real funds.
2. Switch MetaMask to **Sepolia** (Settings → Advanced → Show test networks).
3. Get free test ETH from a faucet — about 0.05 ETH is plenty:
   - https://sepoliafaucet.com
   - https://www.alchemy.com/faucets/ethereum-sepolia
   - https://faucet.quicknode.com/ethereum/sepolia
4. Export that account's private key: MetaMask → account menu → Account details
   → Show private key.

> The private key goes only in `contracts/.env`, which is gitignored. It is
> never needed by the backend or the frontend.

### 1.2 Configure and deploy

```bash
cd contracts
cp .env.example .env
```

Edit `contracts/.env`:

```
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
DEPLOYER_PRIVATE_KEY=your_private_key_here
```

Check you are ready before spending any gas:

```bash
npm run preflight:sepolia
```

It verifies the private key is set, the RPC is reachable, you are on Sepolia,
and the account is actually funded. Fix anything it reports, then deploy:

```bash
npm run deploy:sepolia
```

The preflight runs again automatically and aborts the deploy if something is
wrong. On success the script prints the contract address and writes the ABI into
both `frontend/src/abi/` and `backend/src/abi/` automatically.

**Save the printed address.** Steps 4 and 5 need it.

Optionally verify the source on Etherscan (add `ETHERSCAN_API_KEY` to `.env`):

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

---

## Step 2 — IPFS storage (Pinata)

1. Sign up at https://app.pinata.cloud (free tier: 1 GB).
2. **API Keys → New Key → Admin → Create**.
3. Copy the **JWT** (the long one, not the API key or secret).

Save it for Step 4 as `PINATA_JWT`.

> Skip this and the backend falls back to local content-addressed storage. The
> app still works, but blobs live only on your Render instance.

---

## Step 3 — Database (MongoDB Atlas)

1. Sign up at https://www.mongodb.com/cloud/atlas and create a **free M0**
   cluster.
2. **Database Access** → add a user with a password (avoid `@` and `/` in it,
   or URL-encode them).
3. **Network Access** → Add IP Address → **Allow access from anywhere**
   (`0.0.0.0/0`). Render's outbound IPs are not fixed on the free tier.
4. **Connect → Drivers** → copy the connection string and insert your password:

```
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/medchain?retryWrites=true&w=majority
```

Save it for Step 4 as `MONGODB_URI`.

> Skip this and the backend uses an in-memory store. Everything works, but data
> resets whenever Render restarts the service.

---

## Step 4 — Backend on Render

1. Push this project to GitHub (see *Pushing to GitHub* below).
2. Go to https://render.com → **New → Web Service** → connect the repository.
3. Configure:

   | Field | Value |
   |-------|-------|
   | Name | `medchain-api` |
   | Root Directory | `backend` |
   | Runtime | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | Free |

4. Add these environment variables:

```
NODE_ENV=production
JWT_SECRET=<a long random string — generate one, do not reuse the example>
CORS_ORIGINS=https://your-app.vercel.app
MONGODB_URI=<from Step 3, or leave empty>
PINATA_JWT=<from Step 2, or leave empty>
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
CHAIN_ID=11155111
CONTRACT_ADDRESS=<from Step 1>
EXPLORER_BASE=https://sepolia.etherscan.io
ADMIN_EMAIL=<your admin email>
ADMIN_PASSWORD=<a strong password — change it from the default>
SPONSOR_PRIVATE_KEY=<see below>
SPONSOR_TOPUP_ETH=0.004
SPONSOR_MIN_BALANCE_ETH=0.002
SPONSOR_MAX_TOTAL_ETH=0.05
```

### Where `SPONSOR_PRIVATE_KEY` goes

Patients sign their own transactions, so each account needs a little Sepolia
ETH. The backend tops up every new account once, so no patient ever meets a
faucet. That requires one funded key.

It belongs **only** in Render → your service → **Environment** → *Add
Environment Variable*, where Render stores it encrypted. Specifically:

- **Not** in `render.yaml`. The blueprint declares it `sync: false`, so Render
  prompts for it in the dashboard and never reads it from the repository.
- **Not** in `frontend/.env` or any `VITE_*` variable — those are compiled into
  the JavaScript that ships to the browser and are readable by anyone.
- **Not** in git, a screenshot, a chat message, or the project report.

Use a throwaway account created solely for this, funded from a Sepolia faucet
with a few tenths of a test ETH. It must never hold real funds. Without it the
app still runs, but users have to fund their own accounts.

Check it took effect at `/api/health` — `sponsor.enabled` should be `true`. The
endpoint reports the sponsor's address and balance, never the key.

To generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

5. Deploy, then confirm it is healthy:

```
https://medchain-api.onrender.com/api/health
```

You should see `"status":"ok"` and `"chain":{"connected":true,...}`.

**Save the Render URL.** Step 5 needs it.

> The free tier sleeps after ~15 minutes idle; the first request afterwards
> takes 30–50 seconds. Open the API URL a minute before a live demo.

---

## Step 5 — Frontend on Vercel

1. Go to https://vercel.com → **Add New → Project** → import the repository.
2. Configure:

   | Field | Value |
   |-------|-------|
   | Framework Preset | Vite |
   | Root Directory | `frontend` |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

3. Add environment variables:

```
VITE_API_URL=https://medchain-api.onrender.com
VITE_CONTRACT_ADDRESS=<from Step 1>
VITE_CHAIN_ID=11155111
VITE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
VITE_EXPLORER_BASE=https://sepolia.etherscan.io
```

> **Set the Type to `Config`, not `Secret`.** Vercel hides a Secret's value
> behind bullet characters and refuses to reveal it again. Saved as Secret, the
> contract address was compiled into the bundle as 42 literal `•` characters —
> the site loaded fine and every blockchain call failed. None of these five are
> secret: Vite inlines them into browser JavaScript by design, so they are
> public whatever type you choose. Real secrets live on Render, not here.
>
> Vercel will not convert a saved Secret to Config. Delete the variable and add
> it again.

4. Deploy. Vercel assigns a production domain — check **Settings → Domains** for
   the exact one.

5. **Settings → Deployment Protection → Vercel Authentication → Disabled.**
   New projects enable this by default, which returns a `302` to a Vercel login
   for every visitor. Your examiners have no Vercel account.

6. **Go back to Render** and set `CORS_ORIGINS` to your exact Vercel domains,
   comma separated, no spaces and no trailing slashes. Without this the browser
   blocks every API call.

> After changing any `VITE_*` variable you must rebuild — Vite bakes them in at
> build time. **Deployments → ⋯ → Redeploy**, and untick *Use existing Build
> Cache*, or the old values can be reused.

`frontend/vercel.json` already handles SPA routing, so deep links like
`/patient/records` resolve correctly.

---

## Verify the live deployment

First run the automated checker — it confirms the API is awake, the contract is
really on Sepolia and responding, protected routes are locked, and CORS allows
your frontend:

```bash
npm run check:deployment https://medchain-api-j6hv.onrender.com https://medchain-dusky-ten.vercel.app
```

Every failure it reports maps to an entry in Troubleshooting below.

Then open the Vercel URL on any laptop and check:

- [ ] Landing page loads and shows the contract address
- [ ] Register a patient, then connect MetaMask (approve **two** signatures:
      one unlocks the encryption key, one links the wallet)
- [ ] Upload a file from `sample-records/` — MetaMask asks for one transaction
- [ ] The record appears, and its transaction opens on Sepolia Etherscan
- [ ] Open the record: it decrypts and shows "Integrity verified"
- [ ] Register a doctor in a **different browser profile** with a different
      MetaMask account
- [ ] Doctor searches the patient and requests access
- [ ] Patient approves; doctor can now open the record
- [ ] Patient revokes; doctor is blocked immediately
- [ ] Admin dashboard lists users, records and on-chain events

Each user needs a small amount of Sepolia ETH for gas.

---

## Pushing to GitHub

```bash
cd blockchain-medical-records
git init
git add .
git commit -m "Blockchain-Based Secure Medical Record"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.gitignore` already excludes `node_modules`, `dist`, `.env` and Hardhat
artifacts. Before pushing, confirm nothing sensitive is staged:

```bash
git status --porcelain | grep -i "\.env$"
```

That should print nothing.

---

## Switching the local setup between networks

`backend/.env` and `frontend/.env` control which chain the app talks to.

**Sepolia (public):**

```
# backend/.env
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
CHAIN_ID=11155111
CONTRACT_ADDRESS=<sepolia address>

# frontend/.env
VITE_CHAIN_ID=11155111
VITE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
VITE_CONTRACT_ADDRESS=<sepolia address>
```

**Local Hardhat:**

```
# backend/.env
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
CONTRACT_ADDRESS=<local address>

# frontend/.env
VITE_CHAIN_ID=31337
VITE_RPC_URL=http://127.0.0.1:8545
VITE_CONTRACT_ADDRESS=<local address>
```

**Ganache:** use chain ID `1337` and RPC `http://127.0.0.1:7545`, and deploy
with `npm --prefix contracts run deploy:ganache`.

Restart both servers after editing `.env`.

---

## Troubleshooting

**"Cannot reach the API"** — the Render service is asleep or `VITE_API_URL` is
wrong. Open the API URL directly and wait for it to wake.

**CORS errors in the console** — `CORS_ORIGINS` on Render must match the Vercel
URL exactly, with no trailing slash.

**"No contract address configured"** — `VITE_CONTRACT_ADDRESS` is missing.
Vite inlines env vars at build time, so **redeploy** after adding it; a restart
is not enough.

**MetaMask on the wrong network** — the app offers to switch automatically.
Confirm the prompt, or switch manually to Sepolia.

**"insufficient funds for gas"** — top the account up from a faucet.

**Doctor sees "granted access but no decryption key"** — the patient approved
on-chain before the doctor had connected a wallet, so there was no public key to
seal to. The patient should revoke and re-grant from the Permissions page.

**Transaction stuck as pending** — in MetaMask: Settings → Advanced → Clear
activity tab data, then retry.

**Data disappeared after a Render restart** — expected without `MONGODB_URI`.
Add it (Step 3) for persistence.
