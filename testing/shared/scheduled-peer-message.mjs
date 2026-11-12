/**
 * Local playground scheduler. The timer never queues failed or disconnected sends.
 * Only one Socket.IO ACK may be pending; slow deliveries are skipped rather than overlapped.
 */
export function startScheduledPeerMessages({ socket, intervalMs, timeoutMs = 8000, createMessage, log = console.log }) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
    throw new Error('intervalMs must be a positive integer');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs must be a positive integer');
  }
  let inFlight = false;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    if (!socket.connected) {
      log('[eserver] SCHEDULE SKIPPED: AAB disconnected');
      return;
    }
    if (inFlight) {
      log('[eserver] SCHEDULE SKIPPED: previous message still pending');
      return;
    }
    inFlight = true;
    try {
      const message = createMessage();
      log('[eserver] SCHEDULE SEND peer:message', JSON.stringify(message));
      const response = await socket.timeout(timeoutMs).emitWithAck('peer:message', message);
      if (response?.ok) log('[eserver] SCHEDULE DELIVERED', message.payload.data.sequence, response.data?.id);
      else log('[eserver] SCHEDULE REJECTED', JSON.stringify(response));
    } catch (error) {
      log('[eserver] SCHEDULE ERROR', error instanceof Error ? error.message : String(error));
    } finally {
      inFlight = false;
    }
  };
  const timer = setInterval(() => { void tick(); }, intervalMs);
  return { stop() { stopped = true; clearInterval(timer); }, tick };
}
