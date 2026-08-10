import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const mode = process.argv[2] ?? 'native';
const basePort = Number(process.env.EXPO_PORT ?? 3000);
const maxPort = basePort + 10;

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, '127.0.0.1');
  });
}

async function findFirstFreePort(start, end) {
  for (let port = start; port <= end; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(port)) {
      return port;
    }
  }

  throw new Error(`Nenhuma porta livre encontrada entre ${start} e ${end}.`);
}

function openBrowser(url) {
  if (process.env.CI) {
    return;
  }

  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    return;
  }

  if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

function createExpoArgs(port) {
  const expoArgs = ['expo', 'start'];

  if (mode === 'web') {
    expoArgs.push('--web');
  } else if (mode === 'android') {
    expoArgs.push('--android');
  } else if (mode === 'ios') {
    expoArgs.push('--ios');
  }

  expoArgs.push('--port', String(port));

  return expoArgs;
}

function spawnExpo(expoArgs) {
  return process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', 'npx', ...expoArgs], {
        cwd: projectRoot,
        env: {
          ...process.env,
          EXPO_NO_INTERACTIVE: '1',
        },
        stdio: ['inherit', 'pipe', 'pipe'],
      })
    : spawn('npx', expoArgs, {
        cwd: projectRoot,
        env: {
          ...process.env,
          EXPO_NO_INTERACTIVE: '1',
        },
        stdio: ['inherit', 'pipe', 'pipe'],
      });
}

function tryStartExpo(port) {
  const appUrl = `http://localhost:${port}`;
  const expoArgs = createExpoArgs(port);

  console.log(`[norte] Expo iniciando em ${appUrl}`);

  return new Promise((resolve, reject) => {
    const child = spawnExpo(expoArgs);
    let ready = false;
    let browserOpened = false;
    let output = '';

    const handleOutput = (chunk, writer) => {
      const text = chunk.toString();
      output += text;
      writer(text);

      if (mode === 'web' && !browserOpened && text.includes(`Waiting on ${appUrl}`)) {
        browserOpened = true;
        ready = true;
        openBrowser(appUrl);
        resolve(true);
      }
    };

    child.stdout.on('data', (chunk) => handleOutput(chunk, (text) => process.stdout.write(text)));
    child.stderr.on('data', (chunk) => handleOutput(chunk, (text) => process.stderr.write(text)));

    child.on('exit', (code) => {
      if (ready) {
        process.exit(code ?? 0);
        return;
      }

      const portBusy =
        output.includes(`Port ${port} is being used by another process`) ||
        output.includes('Skipping dev server') ||
        output.includes('Use port');

      if (portBusy) {
        resolve(false);
        return;
      }

      reject(new Error(`Expo encerrou antes de subir na porta ${port}.`));
    });
  });
}

async function main() {
  const firstPort = await findFirstFreePort(basePort, maxPort);

  for (let port = firstPort; port <= maxPort; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    const started = await tryStartExpo(port);

    if (started) {
      return;
    }
  }

  throw new Error(`Nao consegui iniciar o Expo entre as portas ${firstPort} e ${maxPort}.`);
}

main().catch((error) => {
  console.error(`[norte] ${error instanceof Error ? error.message : 'Falha ao iniciar o Expo.'}`);
  process.exit(1);
});
