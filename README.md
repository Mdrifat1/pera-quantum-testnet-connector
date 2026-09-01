# Quantum Relay — Pera TestNet Connector

A client-only Algorand TestNet dApp for **Pera Wallet approval-based transfers**. It connects through `@perawallet/connect`, prepares a random micro-payment, and asks Pera to approve/sign it. The dApp never requests, stores, or handles a recovery phrase.

## How it works

1. Open the app on a device where Pera Wallet is available.
2. Select **Connect up to 5 wallets** and select at most five accounts in the Pera connection flow.
3. In Pera, confirm the intended **Quantum Account** selection for each connected account.
4. Paste the recipient's Algorand address.
5. Select **Generate review draft**. The app fetches TestNet suggested parameters and chooses a random amount from **0.0001 to 0.003 ALGO**.
6. Review the exact amount, sender, recipient, and TestNet label, then choose **Open Pera to approve**.
7. Only after approval does the app submit the signed transaction to the Algorand TestNet node.

The **Start** control in *Automatic Pera requests* begins a capped session of up to 60 requests. With multiple connected wallets, the queue rotates sequentially through at most five accounts; it never sends parallel requests. After each approval or rejection, the next wallet is selected after the configured interval. You still review and approve every request in Pera; the app never approves or signs on your behalf. **Stop** blocks future requests, although a request already open in Pera must be handled there.

## Safety boundaries

- TestNet is the default (`416002`), while MainNet is available only after selecting it and checking an explicit real-ALGO acknowledgement.
- MainNet uses `https://mainnet-api.algonode.cloud` directly over HTTPS; a proxy is not needed and would add an unnecessary trusted intermediary.
- MainNet review interval is clamped to at least 0.8 seconds; wallet/relay latency may make observed requests arrive several seconds apart. Every transaction still requires a fresh Pera approval. Automatic request sessions are capped at 60 requests and there is no unattended signing.
- Recovery phrases and private keys never enter the browser app.
- Pera remains the signer. The app cannot sign or export the connected account.
- The account type is selected in Pera; the app displays the connected public address but cannot inspect or prove the recovery phrase. Confirm Quantum Account selection in Pera before signing.
- The recipient address is validated with Algorand SDK before a draft is prepared.
- A single Pera connection can expose up to five selected public accounts; the app keeps only the first five and uses one active wallet at a time.

The app intentionally cannot verify the account's Quantum status from the public address alone. After connecting, confirm that Pera has selected the intended Quantum Account before approving.

## Local development

```bash
pnpm install
pnpm dev
```

For validation:

```bash
pnpm check
pnpm build
```

## Pera Quantum Account setup

Create the account in the official Pera mobile app: open the accounts list, choose **+**, select **Add Quantum Account**, and follow Pera's backup verification flow. Keep the 25-word recovery passphrase offline. Do not paste it into this app, the terminal, GitHub, or any chat.

Official references:

- [Pera Connect documentation](https://docs.perawallet.app/references/pera-connect/)
- [Pera Quantum Account guide](https://support.perawallet.app/en/article/create-or-upgrade-to-a-quantum-account-on-pera-wallet-19d53rn/)
- [Algorand TestNet Dispenser](https://dispenser.testnet.aws.algodev.network/)
- [Algorand TestNet Explorer](https://lora.algokit.io/testnet)
