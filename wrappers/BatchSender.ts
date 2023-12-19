import {
  Address,
  ContractProvider,
  internal,
  MessageRelaxed,
  Sender,
  SenderArguments,
  SendMode,
} from '@ton/core';
import type { HighloadWalletV2 } from './HighloadWalletV2';

export class BatchSender implements Sender {
  constructor(
    private readonly provider: ContractProvider,
    private readonly wallet: HighloadWalletV2,
    private readonly secretKey: Buffer,
  ) {}

  get address(): Address {
    return this.wallet.address;
  }

  private readonly messages: [MessageRelaxed, SendMode][] = [];

  clear() {
    this.messages.splice(0, this.messages.length);
  }

  async send(args: SenderArguments): Promise<void> {
    this.messages.push([
      internal({
        to: args.to,
        value: args.value,
        init: args.init,
        body: args.body,
        bounce: args.bounce,
      }),
      args.sendMode ?? SendMode.PAY_GAS_SEPARATELY,
    ]);
  }

  async submit() {
    const chunkSize = 254;

    for (let i = 0; i < this.messages.length; i += chunkSize) {
      await this.wallet.sendTransfer(this.provider, {
        queryId: this.wallet.generateQueryId(),
        messages: this.messages.slice(i, i + chunkSize),
        secretKey: this.secretKey,
      });
    }

    this.clear();
  }
}
