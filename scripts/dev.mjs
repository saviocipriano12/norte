/* global process */
import { spawn } from 'node:child_process'

const processes = [
  spawn(process.execPath, ['server/index.js'], { stdio: 'inherit', shell: false }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173'], {
    stdio: 'inherit',
    shell: false,
  }),
]

function shutdown(signal) {
  for (const child of processes) child.kill(signal)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

await new Promise((resolve) => {
  for (const child of processes) {
    child.on('exit', (code) => {
      shutdown('SIGTERM')
      if (code && code !== 0) process.exitCode = code
      resolve()
    })
  }
})
