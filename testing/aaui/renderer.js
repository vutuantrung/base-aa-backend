const panel = document.getElementById('logs');
function show(record) {
  panel.textContent += `[${record.timestamp}] ${record.event}: ${JSON.stringify(record.value)}\n`;
  panel.scrollTop = panel.scrollHeight;
}
window.aaui.getLogs().then(records => records.forEach(show));
window.aaui.onLog(show);
document.getElementById('health').addEventListener('click', () => { void window.aaui.checkHttp(); });
