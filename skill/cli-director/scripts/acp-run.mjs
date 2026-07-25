#!/usr/bin/env node
// acp-run.mjs <task-id> <agent-cmd> [args...] — dispatch the brief via ACP, mirror
// agent text to the pane, log all JSON-RPC to .tasks/<id>.log, write .tasks/<id>.done.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
const [id, ...cmd] = process.argv.slice(2)
const log = m => fs.appendFileSync(`.tasks/${id}.log`, JSON.stringify(m) + '\n')
const fin = s => { fs.appendFileSync(`.tasks/${id}.done`, s + '\n'); try { p.kill() } catch {}; process.exit(0) }
const p = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'inherit'] })
const send = m => { log(m); p.stdin.write(JSON.stringify(m) + '\n') }
let buf = '', last = Date.now()
setInterval(() => { if (Date.now() - last > 15 * 60000) fin('ERROR=idle-timeout') }, 30000)
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: {} } })
p.stdout.on('data', d => {
  buf += d; last = Date.now()
  for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) {
    let m; try { m = JSON.parse(buf.slice(0, i)) } catch { continue }
    log(m)
    if (m.method === 'session/request_permission') {
      const o = m.params.options.find(x => x.kind === 'allow_always') || m.params.options.find(x => x.kind === 'allow_once')
      send({ jsonrpc: '2.0', id: m.id, result: { outcome: o ? { outcome: 'selected', optionId: o.optionId } : { outcome: 'cancelled' } } })
    } else if (m.method === 'session/update') {
      const u = m.params.update
      if (u.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text') process.stdout.write(u.content.text)
    } else if (m.method) {
      if (m.id !== undefined) send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'unsupported' } })
    } else if (m.error) { console.error('\nACP error:', JSON.stringify(m.error)); fin('ERROR=' + (m.error.message || m.error.code)) }
    else if (m.id === 1) send({ jsonrpc: '2.0', id: 2, method: 'session/new', params: { cwd: process.cwd(), mcpServers: [] } })
    else if (m.id === 2) send({ jsonrpc: '2.0', id: 3, method: 'session/prompt', params: { sessionId: m.result.sessionId, prompt: [{ type: 'text', text: `Read .tasks/${id}-brief.md and execute it.` }] } })
    else if (m.id === 3) fin('STOP=' + m.result.stopReason)
  }
})
p.on('exit', c => { fs.appendFileSync(`.tasks/${id}.done`, `EXIT=${c}\n`); process.exit(c ?? 1) })
