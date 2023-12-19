# Highload Wallet V2

Wrapper for [Highload Wallet V2](https://github.com/ton-blockchain/ton/blob/master/crypto/smartcont/highload-wallet-v2-code.fc) contract.

## How to use

```typescript
import { HighloadWalletV2 } from "@scaleton/highload-wallet";

const highloadWallet = new HighloadWalletV2(keyPair.publicKey);
const sender = highloadWallet.batchSender(keyPair.privateKey, 100); // Accumulates messagens and sends chunks (100 messages per each).

await myContract.sendSomething(sender, { /* ... */ });

/* ... */

await sender.submit();
```

## Authors

- Nick Nekilov ([@NickNekilov](https://t.me/NickNekilov))
- TrueCarry ([@TrueCarry](https://t.me/TrueCarry))

## License

<a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License"></a>
