# Quantum Relay — Pera TestNet Connector

A client-only Algorand TestNet dApp for **Pera Wallet approval-based transfers**. It connects through `@perawallet/connect`, prepares a random micro-payment, and asks Pera to approve/sign it. The dApp never requests, stores, or handles a recovery phrase.

## How it works

1. Open the app on a device where Pera Wallet is available.
2. Select **Connect Pera Wallet**.
3. In Pera, choose the intended **Quantum Account** and approve the connection.
4. Paste the recipient's Algorand address.
5. Select **Generate review draft**. The app fetches TestNet suggested parameters and chooses a random amount from **0.0001 to 0.003 ALGO**.
6. Review the exact amount, sender, recipient, and TestNet label, then choose **Open Pera to approve**.
7. Only after approval does the app submit the signed transaction to the Algorand TestNet node.

The optional **Queue another review** switch only creates another review draft after a successful approval and interval. It never approves or signs on the user's behalf.

## Safety boundaries

- The Pera Connect instance is pinned to Algorand **TestNet chain ID 416002**.
- The node endpoint is `https://testnet-api.algonode.cloud`.
- The app does not support MainNet.
- Recovery phrases and private keys never enter the browser app.
- Pera remains the signer. The app cannot sign or export the connected account.
- The account type is selected in Pera; the app displays the connected public address but cannot inspect or prove the recovery phrase. Confirm Quantum Account selection in Pera before signing.
- The recipient address is validated with Algorand SDK before a draft is prepared.

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
