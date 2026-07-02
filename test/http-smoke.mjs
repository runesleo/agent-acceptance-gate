import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/http-server.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = createServer();

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

try {
  const health = await fetch(`${base}/health`).then((res) => res.json());
  assert(health.ok === true, 'health check failed');

  const samples = await fetch(`${base}/api/sample-audits`).then((res) => res.json());
  assert(Array.isArray(samples) && samples.length === 5, 'sample audits endpoint failed');

  const discovery = await fetch(`${base}/.well-known/agent-service.json`).then((res) => res.json());
  assert(discovery.service_id === 'agent-acceptance-gate', 'agent discovery endpoint failed');
  assert(discovery.call_when.includes('before_release_payment'), 'agent discovery missing call_when');

  const manifest = await fetch(`${base}/mcp-tool-manifest.json`).then((res) => res.json());
  assert(manifest.tools?.[0]?.name === 'audit_agent_delivery', 'mcp manifest endpoint failed');

  const openapi = await fetch(`${base}/openapi.yaml`).then((res) => res.text());
  assert(openapi.includes('/audit-agent-deliverable'), 'openapi endpoint missing audit path');

  const input = JSON.parse(fs.readFileSync(path.join(rootDir, 'sample-inputs/01-pmquant-rename.json'), 'utf8'));
  const audit = await fetch(`${base}/audit-agent-deliverable`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  }).then((res) => res.json());
  assert(audit.verdict === 'needs_review', 'audit endpoint verdict mismatch');
  assert(audit.machine_flags.includes('public_release_gate'), 'audit endpoint missing public_release_gate flag');

  const html = await fetch(`${base}/`).then((res) => res.text());
  assert(html.includes('Agent 验收门禁'), 'demo html missing title');

  console.log(`PASS http smoke on ${base}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
