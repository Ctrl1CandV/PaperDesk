// The unified launcher owns this child. IPC also closes the backend when the
// parent unexpectedly disappears, including on Windows where kill is forceful.
let shutdownRequested = false;
function shutdown() {
  if (shutdownRequested) return;
  shutdownRequested = true;
  process.emit('SIGTERM');
  if (process.connected) process.disconnect();
}
process.on('message', message => { if (message === 'paperdesk:shutdown') shutdown(); });
process.once('disconnect', shutdown);

await import('../server/index.mjs');
if (shutdownRequested) process.emit('SIGTERM');
if (process.exitCode && process.connected) process.disconnect();
