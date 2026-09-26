import { EventEmitter } from 'events';
import { StellarEventSubscriber, BridgeEventPayload, BridgeTransactionStatus } from './stellar-event-subscriber';
import { EVMLogSubscriber } from './evm-log-subscriber';

export interface ConnectedClient {
  id: string;
  subscribedTxHashes?: Set<string>;
  send: (message: string) => void;
}

export class BridgeStatusGateway extends EventEmitter {
  private stellarSubscriber?: StellarEventSubscriber;
  private evmSubscriber?: EVMLogSubscriber;
  private connectedClients = new Map<string, ConnectedClient>();
  private transactionStates = new Map<string, BridgeTransactionStatus>();

  constructor(stellarSubscriber?: StellarEventSubscriber, evmSubscriber?: EVMLogSubscriber) {
    super();
    if (stellarSubscriber) this.attachStellarSubscriber(stellarSubscriber);
    if (evmSubscriber) this.attachEVMSubscriber(evmSubscriber);
  }

  public attachStellarSubscriber(subscriber: StellarEventSubscriber): void {
    this.stellarSubscriber = subscriber;
    subscriber.on('event', (payload: BridgeEventPayload) => this.handleIncomingEvent(payload));
  }

  public attachEVMSubscriber(subscriber: EVMLogSubscriber): void {
    this.evmSubscriber = subscriber;
    subscriber.on('event', (payload: BridgeEventPayload) => this.handleIncomingEvent(payload));
  }

  public registerClient(client: ConnectedClient): void {
    this.connectedClients.set(client.id, client);
  }

  public unregisterClient(clientId: string): void {
    this.connectedClients.delete(clientId);
  }

  public getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  public getTransactionState(txHash: string): BridgeTransactionStatus | undefined {
    return this.transactionStates.get(txHash);
  }

  private handleIncomingEvent(payload: BridgeEventPayload): void {
    this.transactionStates.set(payload.txHash, payload.status);

    const message = JSON.stringify({
      type: 'BRIDGE_STATUS_UPDATE',
      data: payload,
    });

    this.emit('broadcast', payload);

    for (const client of this.connectedClients.values()) {
      if (!client.subscribedTxHashes || client.subscribedTxHashes.has(payload.txHash)) {
        client.send(message);
      }
    }
  }
}
