import { createClient } from "@libsql/client";
import { PrismaClient } from "@prisma/client";

const sqlite = new PrismaClient();
const turso = createClient({
  url: "libsql://sgtx-fortleem.aws-us-east-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA",
});

console.log("Migrating WorldwidePortRoute in batches...");
const routes = await sqlite.worldwidePortRoute.findMany();
console.log(`Total routes to migrate: ${routes.length}`);

const COLUMNS = ["id","routeId","originPort","originName","originCountry","originRegion","destinationPort","destinationName","destinationCountry","destinationRegion","shippingLine","shippingLineName","alliance","service","transitDays","frequencyPerWeek","serviceType","transshipmentPort","price20Std","price40Std","price40Hc","price20Reefer","price40Reefer","currency","priceValidityDays","confidence","source","lastUpdated"];
const SQL = `INSERT OR IGNORE INTO "WorldwidePortRoute" (${COLUMNS.map(c=>`"${c}"`).join(",")}) VALUES (${COLUMNS.map(()=>"?").join(",")})`;

let migrated = 0;
const batchSize = 100;

for (let i = 0; i < routes.length; i += batchSize) {
  const batch = routes.slice(i, i + batchSize).map(r => {
    const args = COLUMNS.map(c => {
      const v = r[c];
      if (v instanceof Date) return v.toISOString();
      return v;
    });
    return { sql: SQL, args };
  });
  try {
    await turso.batch(batch, "deferred");
    migrated += batch.length;
    if (migrated % 1000 === 0) console.log(`  Migrated ${migrated}/${routes.length}...`);
  } catch (e: any) {
    console.log(`  Batch at ${i} failed:`, e.message?.slice(0, 60));
  }
}

console.log(`\n=== Routes Migration Complete ===`);
console.log(`Migrated: ${migrated}/${routes.length}`);

// Also migrate FineTuningExample
console.log("\nMigrating FineTuningExample...");
const ftExamples = await sqlite.fineTuningExample.findMany();
console.log(`Total FT examples: ${ftExamples.length}`);
const FT_COLS = ["id","capability","input","output","actualOutcome","qualityScore","source","routeId","tenantGtid","modelProvider","recordedAt","updatedAt"];
const FT_SQL = `INSERT OR IGNORE INTO "FineTuningExample" (${FT_COLS.map(c=>`"${c}"`).join(",")}) VALUES (${FT_COLS.map(()=>"?").join(",")})`;
let ftMigrated = 0;
for (let i = 0; i < ftExamples.length; i += batchSize) {
  const batch = ftExamples.slice(i, i + batchSize).map(r => ({
    sql: FT_SQL,
    args: FT_COLS.map(c => {
      const v = r[c];
      if (v instanceof Date) return v.toISOString();
      return v;
    }),
  }));
  try {
    await turso.batch(batch, "deferred");
    ftMigrated += batch.length;
  } catch (e: any) {
    console.log(`  FT batch at ${i} failed:`, e.message?.slice(0, 60));
  }
}
console.log(`FT examples migrated: ${ftMigrated}/${ftExamples.length}`);

// Final verification
const routeCount = await turso.execute("SELECT count(*) as c FROM WorldwidePortRoute");
console.log(`\nTurso WorldwidePortRoute: ${routeCount.rows[0].c}`);
const ftCount = await turso.execute("SELECT count(*) as c FROM FineTuningExample");
console.log(`Turso FineTuningExample: ${ftCount.rows[0].c}`);

await sqlite.$disconnect();
await turso.close();
