#!/usr/bin/env node
/**
 * Runs both server processes in one container.
 *
 * Two processes rather than two images, so the on-prem promise stays "one
 * image plus Postgres". Next cannot serve a WebSocket upgrade from a route
 * handler, so the collaboration server needs its own listener -- but it does
 * not need its own deployment.
 *
 * No supervisor, deliberately: if either process dies the container dies, and
 * Docker's restart policy brings both back together. A container that keeps
 * running with half its function missing is the harder failure to notice.
 */
import { spawn } from 'node:child_process'

const children = []

function start(name, args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env })
  child.on('exit', (code, signal) => {
    console.error(`${name} beendet (code=${code} signal=${signal}) — Container wird beendet.`)
    for (const other of children) if (other !== child) other.kill('SIGTERM')
    process.exit(code ?? 1)
  })
  children.push(child)
  return child
}

start('web', ['server.js'])
start('collab', ['dist/collab-server.mjs'])

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal)
  })
}
