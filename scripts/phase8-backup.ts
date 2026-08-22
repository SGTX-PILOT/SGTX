import { createClient } from '@libsql/client'
import { writeFileSync, mkdirSync } from 'node:fs'
const client = createClient({ url: 'libsql://sgtx-fortleem.aws-us-east-1.turso.io', authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA' })
async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  mkdirSync('backups', { recursive: true })
  const out = `backups/turso-backup-phase8-start-${ts}.json`
  const tablesRes = await client.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name`)
  const tables = tablesRes.rows.map((r: any) => r.name)
  console.log(`[backup] ${tables.length} tables`)
  const dump: Record<string, any[]> = {}
  let total = 0
  for (const t of tables) {
    try { const r = await client.execute(`SELECT * FROM "${t}"`); dump[t] = r.rows.map((row: any) => { const o: Record<string, unknown> = {}; for (const k of Object.keys(row)) o[k] = row[k]; return o }); total += dump[t].length }
    catch (e: any) { console.warn(`[backup] skip ${t}: ${e.message}`); dump[t] = [] }
  }
  writeFileSync(out, JSON.stringify({ timestamp: ts, tables: tables.length, totalRows: total, dump }, null, 0))
  console.log(`[backup] Wrote ${out} — ${tables.length} tables, ${total} rows`)
}
main().catch((e) => { console.error('[backup] FATAL', e); process.exit(1) })
