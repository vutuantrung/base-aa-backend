import { startPeerServer } from './shared/create-peer-server.mjs';
await startPeerServer({ peerId: 'pserver', port: 3001 });
