import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  internal,
  loadMessageRelaxed,
  MessageRelaxed,
  Sender,
  SenderArguments,
  SendMode,
  Slice,
  storeMessageRelaxed,
} from '@ton/core';
import { sign } from '@ton/crypto';
import { BatchSender } from './BatchSender';

export class HighloadWalletV2 implements Contract {
  static readonly CODE =
    'te6ccgEBCQEA5QABFP8A9KQT9LzyyAsBAgEgAgMCAUgEBQHq8oMI1xgg0x/TP/gjqh9TILnyY+1E0NMf0z/T//QE0VNggED0Dm+hMfJgUXO68qIH+QFUEIf5EPKjAvQE0fgAf44WIYAQ9HhvpSCYAtMH1DAB+wCRMuIBs+ZbgyWhyEA0gED0Q4rmMQHIyx8Tyz/L//QAye1UCAAE0DACASAGBwAXvZznaiaGmvmOuF/8AEG+X5dqJoaY+Y6Z/p/5j6AmipEEAgegc30JjJLb/JXdHxQANCCAQPSWb6VsEiCUMFMDud4gkzM2AZJsIeKz';

  readonly address: Address;
  readonly init: { code: Cell; data: Cell };

  constructor(
    readonly publicKey: Buffer,
    readonly workchain: number = 0,
    readonly walletId: number = workchain + 0x29a9a317,
  ) {
    this.init = {
      code: Cell.fromBase64(HighloadWalletV2.CODE),
      data: beginCell()
        .storeUint(this.walletId, 32)
        .storeUint(0, 64) // last_cleaned
        .storeBuffer(this.publicKey, 32)
        .storeDict(null) // old_queries
        .endCell(),
    };

    this.address = contractAddress(workchain, this.init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async getBalance(provider: ContractProvider) {
    let state = await provider.getState();
    return state.balance;
  }

  async getProcessed(
    provider: ContractProvider,
    queryId: bigint,
  ): Promise<boolean> {
    const { stack } = await provider.get('processed?', [
      { type: 'int', value: queryId },
    ]);

    return stack.readBoolean();
  }

  generateQueryId(timeout?: number, randomId?: number): bigint {
    const now = Math.floor(Date.now() / 1000);
    const random = randomId || Math.floor(Math.random() * 2 ** 30);

    return (BigInt(now + (timeout ?? 60)) << 32n) | BigInt(random);
  }

  /**
   * Send signed transfer
   */
  async send(provider: ContractProvider, message: Cell) {
    await provider.external(message);
  }

  /**
   * Sign and send transfer
   */
  async sendTransfer(
    provider: ContractProvider,
    args: {
      queryId: bigint;
      messages: [MessageRelaxed, SendMode][];
      secretKey: Buffer;
    },
  ) {
    const transfer = this.createTransfer(args);
    await this.send(provider, transfer);
  }

  /**
   * Create signed transfer
   */
  createTransfer(args: {
    queryId: bigint;
    messages: [MessageRelaxed, SendMode][];
    secretKey: Buffer;
  }): Cell {
    if (!args.messages.length || args.messages.length > 254) {
      throw new Error(
        'HighloadWalletV2: can make only 1 to 254 transfers per operation.',
      );
    }

    const messages = Dictionary.empty<
      number,
      { message: MessageRelaxed; mode: number }
    >(Dictionary.Keys.Int(16), {
      serialize(src, builder: Builder): void {
        builder
          .storeUint(src.mode, 8)
          .storeRef(beginCell().store(storeMessageRelaxed(src.message)));
      },
      parse(src: Slice) {
        return {
          mode: src.loadUint(8),
          message: loadMessageRelaxed(src.loadRef().beginParse()),
        };
      },
    });

    for (let i = 0; i < args.messages.length; i++) {
      const [message, mode] = args.messages[i];
      messages.set(i, {
        message,
        mode,
      });
    }

    const signingMessage = beginCell()
      .storeUint(this.walletId, 32)
      .storeUint(args.queryId, 64)
      .storeDict(messages);

    const signature: Buffer = sign(
      signingMessage.endCell().hash(),
      args.secretKey,
    );

    return beginCell()
      .storeBuffer(signature)
      .storeBuilder(signingMessage)
      .endCell();
  }

  /**
   * Create a default sender (sends 1 message per time)
   */
  sender(provider: ContractProvider, secretKey: Buffer): Sender {
    return {
      send: (args: SenderArguments) =>
        this.sendTransfer(provider, {
          queryId: this.generateQueryId(),
          messages: [
            [
              internal({
                to: args.to,
                value: args.value,
                init: args.init,
                body: args.body,
                bounce: args.bounce,
              }),
              args.sendMode ?? SendMode.PAY_GAS_SEPARATELY,
            ],
          ],
          secretKey,
        }),
    };
  }

  /**
   * Create a batch sender (sends as many messages as needed).
   * Non-compatible with `Blockchain` from `@ton/sandbox`.
   */
  batchSender(
    provider: ContractProvider,
    secretKey: Buffer,
    batchSize: number,
  ): BatchSender {
    return new BatchSender(provider, this, secretKey, batchSize);
  }
}
