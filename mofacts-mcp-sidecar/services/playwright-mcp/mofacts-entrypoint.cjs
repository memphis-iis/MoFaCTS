const { spawn } = require('node:child_process');
const net = require('node:net');

const LOCALHOST_PORTS = String(process.env.MOFACTS_LOCALHOST_PROXY_PORTS || process.env.MOFACTS_LOCALHOST_PROXY_PORT || '3200,8082')
  .split(',')
  .map((port) => Number(port.trim()))
  .filter((port) => Number.isInteger(port) && port > 0);
const TARGET_HOST = process.env.MOFACTS_LOCALHOST_PROXY_TARGET_HOST || 'host.docker.internal';

function startLocalhostProxy(localPort) {
  const targetPort = Number(process.env.MOFACTS_LOCALHOST_PROXY_TARGET_PORT || localPort);
  const server = net.createServer((clientSocket) => {
    const targetSocket = net.connect({ host: TARGET_HOST, port: targetPort });

    clientSocket.on('error', () => {
      targetSocket.destroy();
    });
    targetSocket.on('error', () => {
      clientSocket.destroy();
    });

    clientSocket.pipe(targetSocket);
    targetSocket.pipe(clientSocket);
  });

  server.on('error', (error) => {
    console.error(`[mofacts-playwright-mcp] localhost proxy failed: ${error.message}`);
    process.exitCode = 1;
  });

  server.listen(localPort, '127.0.0.1', () => {
    console.log(
      `[mofacts-playwright-mcp] localhost:${localPort} -> ${TARGET_HOST}:${targetPort}`,
    );
  });
}

for (const localPort of LOCALHOST_PORTS) {
  startLocalhostProxy(localPort);
}

const child = spawn(
  'node',
  ['/app/cli.js', '--headless', '--browser', 'chromium', '--no-sandbox', ...process.argv.slice(2)],
  { stdio: 'inherit' },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
