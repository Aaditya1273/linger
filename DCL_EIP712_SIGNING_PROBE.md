# Decentraland EIP-712 Signing Probe

**Purpose:** resolve the one HIGH-risk unknown left by
[`DECENTRALAND_META_TX_COMPATIBILITY.md`](./DECENTRALAND_META_TX_COMPATIBILITY.md) — can a
real Decentraland client execute `eth_signTypedData_v4` for the audited `BondConsent`
payload, and does its EIP-712 encoding agree with `LingerBond`?

**Reference:** [EIP-712](https://eips.ethereum.org/EIPS/eip-712) —
`keccak256("\x19\x01" ‖ domainSeparator ‖ hashStruct(message))`.

**Contract untouched. Gameplay untouched. Nothing deployed. No transaction sent.**

---

## Result

| Test | Platform | Status |
|---|---|---|
| 1 — Desktop | Decentraland Desktop Client | **UNVERIFIED — CLIENT NOT AVAILABLE IN THIS ENVIRONMENT** |
| 2 — Mobile | Decentraland Mobile Client | **UNVERIFIED — NO DEVICE REACHABLE** |

The probe is **built, self-tested and ready**. It could not be *executed* against a real
client from this machine. The reasons are environmental and are evidenced below, not
assumed.

---

## An important correction to the expected result

The task specifies:

> The recovered address must equal the expected deterministic signer from the existing
> vector — `0xe05fcC23…0cfF7`.

**That cannot happen, and a probe that reported it would be lying.**

`0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7` is derived from the private key `0xa11ce`, a
test constant that lives in this repository (`test/MetaTxVectors.t.sol`, `PK_A`). Nobody
controls it in a real client, and no real wallet can or should reproduce a signature from
it. Verified:

```
$ node -e "…new ethers.Wallet('0x…0a11ce').address"
PK_A 0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7
```

The assertion that actually proves what we need is:

```
recover(ourLocallyComputedDigest, clientSignature) == connectedAccount
```

The *payload* stays byte-identical to the audited vector — same domain, types,
primaryType, message, chainId, verifyingContract — so the client is asked to hash exactly
what `LingerBond` verifies. If it hashes anything differently (chainId instead of salt, a
reordered field, a different domain type), recovery yields an unrelated address and the
probe fails. Agreement proves the client's encoder matches the contract's.

The probe therefore checks two things:

1. its own construction still reproduces the audited digest `0x0c9e38e1…46f2279d`
   (guards against drift from the frozen vector), and
2. the client's signature recovers to the client's own account.

---

## Evidence for UNVERIFIED

### 1. The Decentraland Desktop Client is not installed

The SDK's own preview flow requires it and failed outright:

```
$ npx sdk-commands start --no-browser --port 8123
Preview server is now running!

error: Decentraland Desktop Client failed with:
  "Command \"open decentraland://\"realm=http%3A%2F%2F127.0.0.1%3A8123&position=0%2C0
   &dclenv=org&local-scene=true\"\" exited with code 127.
   Please try running the command manually"
Please download & install the Decentraland Desktop Client: https://dcl.gg/explorer
```

`exit 127` is "command not found" — there is no `decentraland://` handler on this machine.

```
$ which decentraland explorer      → not found
$ ls ~/.config/*ecentraland*       → no matches
$ flatpak list | grep -i decentra  → (empty)
```

### 2. The web explorer path serves, but cannot be driven from here

```
$ npx sdk-commands start --no-browser --web --port 8124
Listening 0.0.0.0:8124
Preview server is now running!
    https://decentraland.org/bevy-web/?preview=true&realm=http://127.0.0.1:8124&position=0,0
[7:01:12 PM] Found 0 errors. Watching for file changes.
```

The scene compiles and serves cleanly. Driving the browser was not possible:

```
$ list_connected_browsers
[]
```

No Chrome instance is connected to the automation extension.

### 3. A real wallet approval is required, and I did not automate it

Chrome 151 is running here with MetaMask present in three profiles
(`nkbihfbeogaeaoehlefnkodbefgpgknn` in `Default`, `Profile 1`, `Profile 10`). Even with
browser automation available I would not have clicked **Sign** in MetaMask on your behalf.

The probe is harmless — a signature over typed data naming a contract that exists on no
network, with no transaction, no approval and no value. But the MetaMask confirmation is
the security boundary that stops wallets being drained, and an agent should not click
through it. That approval is yours.

### 4. Mobile is not testable from this machine

No mobile device is reachable, and no emulator with the Decentraland mobile client exists
here. `sdk-commands start --mobile` only prints a QR code for a device on the same
network to scan; there is no device.

---

## What *was* verified

The probe itself is proven correct, so a client run is meaningful the moment someone can
perform one:

```
$ cd tools/dcl-eip712-probe && node verify.js
--- probe vector vs audited constants ---
PASS  vector.chainId / verifyingContract / bondRef / worldHash / deadline
PASS  vector.playerA / playerB / domainSeparator / consentDigest
--- audited constants still present in source of truth ---
PASS  consentDigest present in script/crosscheck.js
PASS  bondRef present in test/MetaTxVectors.t.sol
--- payload hashing ---
PASS  domainSeparator      0x99c1456d…6da92d95
PASS  BondConsent digest   0x0c9e38e1…46f2279d
--- probe verification path (throwaway key) ---
PASS  signature is 65 bytes
PASS  v normalises into {27,28}
PASS  recover(auditedDigest, signature) == signer
PASS  a signature over different data does NOT recover to the signer
SELF-TEST PASS — the probe is sound
```

The last line is a negative control: it proves the check can actually fail, so a PASS from
a real client will mean something.

The vector is read from `script/crosscheck.js` and `test/MetaTxVectors.t.sol` and
re-checked against them on every run, so the probe cannot silently drift from the frozen
audited payload.

---

## The exact payload

```json
{
  "types": {
    "EIP712Domain": [
      { "name": "name",              "type": "string"  },
      { "name": "version",           "type": "string"  },
      { "name": "verifyingContract", "type": "address" },
      { "name": "salt",              "type": "bytes32" }
    ],
    "BondConsent": [
      { "name": "bondRef",   "type": "bytes32" },
      { "name": "playerA",   "type": "address" },
      { "name": "playerB",   "type": "address" },
      { "name": "worldHash", "type": "bytes32" },
      { "name": "deadline",  "type": "uint256" }
    ]
  },
  "domain": {
    "name": "LingerBond",
    "version": "1",
    "verifyingContract": "0xFb1b848e938aE6474F890bfb28f6a793a515BAcb",
    "salt": "0x0000000000000000000000000000000000000000000000000000000000013882"
  },
  "primaryType": "BondConsent",
  "message": {
    "bondRef":   "0x1111111111111111111111111111111111111111111111111111111111111111",
    "playerA":   "0x0376AAc07Ad725E01357B1725B5ceC61aE10473c",
    "playerB":   "0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7",
    "worldHash": "0x2222222222222222222222222222222222222222222222222222222222222222",
    "deadline":  2000000000
  }
}
```

`salt` is `0x…013882` = 80002 = Polygon Amoy. Decentraland puts the chain id in `salt`
rather than a `chainId` field — that is the convention `LingerBond` was audited against.

Per EIP-712 this hashes to:

```
domainSeparator  0x99c1456df74bcdad386b8bf1d9f9223611e9e761efcf7fae74e0dd856da92d95
digest           0x0c9e38e1f0ded5f3e19ebf5a2d8a0efb1ff61dfef111205ce68fe54146f2279d
```

## The exact provider call

Through the real Decentraland provider path — `createEthereumProvider()` from
`@dcl/sdk/ethereum-provider`, which forwards to `~system/EthereumController.sendAsync`.
No mock, no shim.

```js
provider.sendAsync(
  {
    jsonrpc: '2.0',
    id: <n>,
    method: 'eth_signTypedData_v4',
    params: [account, JSON.stringify(TYPED_DATA)]   // note: a STRING, not an object
  },
  callback
)
```

The string form matches what `decentraland-transactions` sends; some providers reject an
object here.

**`signMessage` is never called.** It takes a flat string dictionary, is not EIP-712, and
would prove nothing about this contract. The probe fails loudly rather than falling back.

---

## Test matrix

### TEST 1 — Desktop

```
CLIENT:            Decentraland Desktop Client
PLATFORM:          Linux (Arch), x86_64
CLIENT VERSION:    n/a — not installed
RPC METHOD:        eth_signTypedData_v4 (not reached)
SIGNATURE:         —
RECOVERED ADDRESS: —
EXPECTED ADDRESS:  the connected wallet (see correction above)
MATCH:             —
ERROR:             Desktop Client failed: "open decentraland://…" exited with code 127.
                   Browser automation unavailable (list_connected_browsers → []).
STATUS:            UNVERIFIED — CLIENT NOT AVAILABLE IN THIS ENVIRONMENT
```

### TEST 2 — Mobile

```
CLIENT:            Decentraland Mobile Client
PLATFORM:          n/a
CLIENT VERSION:    n/a
RPC METHOD:        eth_signTypedData_v4 (not reached)
SIGNATURE:         —
RECOVERED ADDRESS: —
EXPECTED ADDRESS:  the connected wallet
MATCH:             —
ERROR:             No mobile device or emulator reachable from this machine.
STATUS:            UNVERIFIED — NO DEVICE REACHABLE
```

---

## How to complete the matrix

Roughly five minutes on a machine with the Decentraland client and a wallet. **Use a
throwaway wallet if you would rather not sign with a funded one** — any account works,
because the probe compares against whichever account is connected.

```bash
cd tools/dcl-eip712-probe
npm install
npm start                 # desktop client
# or:  npm start -- --web        (browser explorer)
# or:  npm start -- --mobile     (QR code for a phone on the same network)
```

Walk into the scene. It runs automatically and shows a large **PASS / FAIL / UNVERIFIED**
banner with the log beneath, so it is readable on a phone without a console.

Then paste the result back:

```bash
node verify.js --account 0xYourAddress --signature 0xTheSignature
```

Which prints `PASS` if the signature recovers to that account against the audited digest.

### Reading the outcome

| Probe says | Meaning |
|---|---|
| **PASS** | The client's EIP-712 encoder matches the contract. The HIGH risk is closed. |
| **UNVERIFIED — CLIENT DOES NOT EXPOSE TYPED-DATA SIGNING** | The explorer does not route `eth_signTypedData_v4`. The gasless design needs rethinking — **not the contract**. |
| **FAIL — encoder mismatch** | The client hashed something other than our payload. Report it; do not change the contract until the cause is understood. |

A guest session is still worth running: the probe now continues past a missing account
specifically to see whether the method is routed at all. A JSON-RPC `-32601`
("method not found") answers the question with no wallet involved.

---

## Limitations

1. **Nothing here was tested against a real client.** Every statement about the probe is
   about the probe, not about Decentraland.
2. The audited vector names `verifyingContract` `0xFb1b848e…5BAcb`, a Foundry-local
   address. Nothing is deployed there. That is fine for a signing probe — EIP-712 binds
   the address into the domain but never contacts it — and it must be regenerated for the
   real address once a contract is deployed.
3. A `PASS` proves the encoder agrees for `BondConsent`. The `MetaTransaction` wrapper is
   a separate payload; it is covered offline in the compatibility audit and would want its
   own live probe before relying on the relayer path.
4. Desktop passing would not imply mobile passing. They are different clients, and mobile
   was the specific worry.

---

## EIP712_REAL_CLIENT_STATUS: UNVERIFIED
