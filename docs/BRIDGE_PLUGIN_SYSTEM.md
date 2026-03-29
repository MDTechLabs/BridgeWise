# Bridge Plugin System

This project supports dynamic registration of bridge adapters using the `BridgeModule` API and the `BridgePlugin` decorator.

## Plugin interface

- `BridgeAdapter` (interface): defines `name`, `version`, `capabilities`, `initialize`, `isHealthy`, `shutdown`, `execute`.
- `BridgePlugin` (decorator): annotate classes for auto-discovery and metadata.

## Core classes

- `BridgeRegistry` (singleton): manages adapters by name
- `BridgeLoader` (OnModuleInit): loads adapters from filesystem or config
- `BridgeService`: executes operations via registered bridges and runtime plugin registration

## Usage

1. Create a plugin adapter:

```ts
import { BridgeAdapter, BridgeCapability } from '@bridgewise/api/dynamic-bridge-discovery';
import { BridgePlugin } from '@bridgewise/api/dynamic-bridge-discovery';

@BridgePlugin({ name: 'my-bridge', version: '1.0.0' })
export class MyBridgeAdapter implements BridgeAdapter { ... }
```

2. Register via runtime injection:

```ts
bridgeService.registerBridge(new MyBridgeAdapter());
```

3. Or set up auto-discovery by config:

```ts
BridgeModule.forRoot({
  autoDiscover: true,
  bridgesDirectory: './plugins',
});
```

## Acceptance criteria

- plugin interface implemented
- dynamic bridge registration without core code change
- runtime and config-driven plugin loading
