# Android app (Capacitor)

The Android app is the **same** React application, packaged natively. Capacitor
compiles the built `dist/` folder into an Android project and loads it in a
system WebView. No blockchain, encryption, IPFS, role or translation code was
changed, and the smart contract was not touched.

- App name: **MedChain**
- Application ID: `in.ac.sgbit.medchain`
- Capacitor: 8.5.1
- minSdk 24 (Android 7.0) · target/compile SDK 36 · Gradle 8.14.3

---

## What was added

| Path | Purpose |
|---|---|
| `frontend/capacitor.config.json` | Capacitor configuration |
| `frontend/android/` | Generated native Android (Gradle) project |
| `frontend/.env.production` | Build values for the app bundle — no secrets |

Two npm scripts, from the repository root:

```bash
npm run android:build     # vite build + capacitor sync
```

```bash
npm run android:open      # opens the project in Android Studio
```

---

## Three configuration decisions, and why

### `server.androidScheme: "https"`

The WebView serves the app from `https://localhost`. This is not cosmetic — it
is what makes the origin a **secure context**, and `crypto.subtle` is only
available in a secure context. The entire encryption layer (AES-256-GCM,
PBKDF2 vault derivation, ECIES key sealing) is built on `crypto.subtle`. On an
`http://` scheme the app would load and every upload would fail.

### `android.minWebViewVersion: 87`

Vite compiles the bundle for `chrome87` (its default `modules` target).
Capacitor's own default floor is WebView 60, so a device with a WebView between
60 and 86 would load JavaScript it cannot parse and show a blank white screen
with no message. Raising the floor to 87 makes the mismatch an explicit error in
Logcat instead of a silent failure.

### PDF previews use pdf.js, not an `<iframe>`

Android's WebView has no built-in PDF viewer, so the original
`<iframe src={blobUrl}>` rendered an empty box in the app while working in a
desktop browser. `PdfPreview` in `src/pages/app/Records.jsx` draws each page
onto a canvas with pdf.js instead, so the app and the website show a record
identically.

pdf.js is imported dynamically, so it lands in its own lazy chunk - the main
bundle grew by 2.5 kB, and only a patient who actually opens a PDF downloads
the rest. `public/pdf-fonts/` carries pdf.js's standard font data, because lab
reports routinely reference the base-14 fonts (Helvetica and friends) without
embedding them, and without that data their text renders blank.

This changed only how an already-decrypted blob is displayed. The fetch,
on-chain hash verification, key unsealing and decryption path is untouched.

### `android.allowMixedContent: false`

Every endpoint the app uses is HTTPS — the Render API, the Sepolia RPC and the
IPFS gateway. There is no reason to permit cleartext, so it stays off.

---

## Required backend change

The WebView's origin is `https://localhost`, which the API does not currently
allow. The backend uses a strict CORS allowlist, so **until this is added, every
API call from the app fails** — sign-in, vault, upload, gas sponsorship.

On Render → `medchain-api` → **Environment** → `CORS_ORIGINS`, append
`https://localhost` to the existing comma-separated list.

The Sepolia RPC already responds `access-control-allow-origin: *`, so
blockchain reads and writes work from the app without any change.

---

## Prerequisites

- **Android Studio** with the **Android SDK 36** platform
- **JDK 21** — and this needs care, see below

### The JDK version matters

Capacitor 8 pins Gradle 8.14.3 and Android Gradle Plugin 8.13. Current Android
Studio ships **JDK 25** as its bundled runtime (`jbr`), and Gradle 8.14 cannot
read Java 25 class files. Building with the bundled JDK fails during script
evaluation, before anything is compiled:

```
BUG! exception in phase 'semantic analysis' in source unit '_BuildScript_'
Unsupported class file major version 69
```

Major version 69 is Java 25. The fix is to build with **JDK 21**, not to change
Gradle or AGP — those versions are what Capacitor generates and are matched to
each other.

Android Studio detects this on import and offers a **Use JVM 21** button in the
"Please Select Gradle JVM to Import Project" dialog — take it. It installs
JDK 21 under `C:/Users/<you>/.jdks/` and uses it for every build afterwards.
The same setting lives at **Settings -> Build, Execution, Deployment -> Build
Tools -> Gradle -> Gradle JDK**.

For command-line builds, point Gradle at that same JDK: either export
`JAVA_HOME` to it, or set `org.gradle.java.home` in
`frontend/android/gradle.properties`.

---

## Build workflow

Any change to the React code follows the same three steps. Editing files under
`frontend/android/app/src/main/assets/` directly has no effect — `cap sync`
overwrites them, and they are gitignored for that reason.

```bash
npm run android:build
```

Then in Android Studio: **Build → Make Project**, or run it on a device with
**Run ▶**.

To produce an installable debug APK from the command line once the SDK is
present:

```bash
cd frontend/android && ./gradlew assembleDebug
```

The output lands at
`frontend/android/app/build/outputs/apk/debug/app-debug.apk`.

### Verified build

Built successfully on 2026-09-04 with JDK 21 and SDK 36:

```
BUILD SUCCESSFUL in 8m 26s
93 actionable tasks: 93 executed
```

The resulting 4.2 MB APK reports package `in.ac.sgbit.medchain`, label
`MedChain`, targetSdk 36, `android.permission.INTERNET`, and carries the
production web bundle with the live contract address and Render API URL
compiled in.

---

## Not done

**Publishing.** No release keystore was generated, no signing configuration was
added, and nothing was uploaded anywhere. The project builds debug artifacts
only. A release build for the Play Store additionally needs a keystore, a
`signingConfigs` block, a version bump policy and a privacy policy — none of
which exist yet.

---

## Unchanged

`contracts/contracts/MedicalRecord.sol`, all of `frontend/src/lib/` (crypto,
wallet, records, web3), `frontend/src/i18n/`, every page and component, and the
whole of `backend/`. The Android app runs the identical JavaScript that the
website at https://medchain-dusky-ten.vercel.app serves, against the identical
contract at `0xAE246FCcad4F7aF88C1c6B3d17FaF2105D345824`.
