import { startPeerServer } from './shared/create-peer-server.mjs';
const { app, socket } = await startPeerServer({ peerId: 'pserver', port: 3001 });

// Explicit demo endpoint. The existing /messages endpoint remains generic.
app.post('/demo/send-to-aaui', async (req, res) => {
  if (!socket.connected) {
    res.status(503).json({ ok: false, error: 'AAB is offline' });
    return;
  }
  const input = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const message = {
    version: '1.0',
    kind: 'event',
    from: 'pserver',
    to: 'aaui',
    channel: 'worker',
    event: 'message',
    payload: {
      type: 'demo.modified-param',
      version: '1.0',
      data: { originalParam: typeof input.originalParam === 'string' ? input.originalParam : 'hello from PServer' }
    }
  };
  try {
    console.log('[pserver] DEMO SEND', JSON.stringify(message));
    const ack = await socket.timeout(8000).emitWithAck('peer:message', message);
    console.log('[pserver] DEMO ACK', JSON.stringify(ack));
    res.status(ack.ok ? 200 : 422).json(ack);
  } catch (error) {
    res.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'Delivery timeout' });
  }
});
