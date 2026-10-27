import { Buffer } from 'buffer';

// The company engine was written for Node; give it the globals it expects.
const g = globalThis as unknown as Record<string, unknown>;
g.Buffer ??= Buffer;
g.process ??= { env: {}, platform: 'browser' };
