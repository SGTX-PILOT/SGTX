// Standalone seed script for RoRo vessel schedules
/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
const now = new Date();
const addDays = (d) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

const corridorPorts = {
  "EGY-ITA-RORO-001": { op: "EGDMT", dp: "ITTRS", td: 6 },
  "EGY-KSA-RORO-001": { op: "EGSGF", dp: "SAJED", td: 3 },
  "EGY-UAE-RORO-001": { op: "EGALX", dp: "AEJEA", td: 5 },
};

const schedules = [
  { scheduleId: "VS-EGY-ITA-20260701-001", corridorCode: "EGY-ITA-RORO-001", vesselName: "MV Alexandria Star", vesselImo: "IMO 9472831", vesselOperator: "EGY RoRo Lines", etdOffset: 7, trailerCapacity: 180, vehicleCapacity: 120, reeferCapacity: 40, maxLoaM: 200, maxBeamM: 32, rampCapacityT: 250 },
  { scheduleId: "VS-EGY-ITA-20260715-001", corridorCode: "EGY-ITA-RORO-001", vesselName: "MV Damietta Express", vesselImo: "IMO 9512944", vesselOperator: "Grimaldi RoRo", etdOffset: 21, trailerCapacity: 220, vehicleCapacity: 150, reeferCapacity: 50, maxLoaM: 210, maxBeamM: 32, rampCapacityT: 280 },
  { scheduleId: "VS-EGY-ITA-20260801-001", corridorCode: "EGY-ITA-RORO-001", vesselName: "MV Levante", vesselImo: "IMO 9338812", vesselOperator: "Grimaldi RoRo", etdOffset: 38, trailerCapacity: 200, vehicleCapacity: 140, reeferCapacity: 45, maxLoaM: 200, maxBeamM: 32, rampCapacityT: 250 },
  { scheduleId: "VS-EGY-KSA-20260705-001", corridorCode: "EGY-KSA-RORO-001", vesselName: "MV Safaga Trader", vesselImo: "IMO 9556712", vesselOperator: "Red Sea RoRo", etdOffset: 11, trailerCapacity: 150, vehicleCapacity: 100, reeferCapacity: 30, maxLoaM: 180, maxBeamM: 28, rampCapacityT: 220 },
  { scheduleId: "VS-EGY-KSA-20260720-001", corridorCode: "EGY-KSA-RORO-001", vesselName: "MV Jeddah Bridge", vesselImo: "IMO 9612345", vesselOperator: "NSCSA RoRo", etdOffset: 26, trailerCapacity: 170, vehicleCapacity: 110, reeferCapacity: 35, maxLoaM: 190, maxBeamM: 30, rampCapacityT: 240 },
  { scheduleId: "VS-EGY-UAE-20260710-001", corridorCode: "EGY-UAE-RORO-001", vesselName: "MV Gulf Clipper", vesselImo: "IMO 9728819", vesselOperator: "MSC RoRo", etdOffset: 16, trailerCapacity: 200, vehicleCapacity: 130, reeferCapacity: 40, maxLoaM: 200, maxBeamM: 32, rampCapacityT: 260 },
  { scheduleId: "VS-EGY-UAE-20260725-001", corridorCode: "EGY-UAE-RORO-001", vesselName: "MV Khalifa Cruiser", vesselImo: "IMO 9745521", vesselOperator: "ESL RoRo", etdOffset: 31, trailerCapacity: 190, vehicleCapacity: 125, reeferCapacity: 38, maxLoaM: 195, maxBeamM: 32, rampCapacityT: 250 },
];

(async () => {
  let created = 0;
  for (const s of schedules) {
    const ports = corridorPorts[s.corridorCode];
    if (!ports) continue;
    const etd = addDays(s.etdOffset);
    const eta = addDays(s.etdOffset + ports.td);
    const totalSlots = s.trailerCapacity + s.vehicleCapacity + s.reeferCapacity;
    await db.roRoVesselSchedule.upsert({
      where: { scheduleId: s.scheduleId },
      create: {
        scheduleId: s.scheduleId, corridorCode: s.corridorCode, vesselName: s.vesselName, vesselImo: s.vesselImo, vesselOperator: s.vesselOperator,
        departurePort: ports.op, arrivalPort: ports.dp, etd, eta, transitDays: ports.td,
        trailerCapacity: s.trailerCapacity, vehicleCapacity: s.vehicleCapacity, reeferCapacity: s.reeferCapacity,
        maxLoaM: s.maxLoaM, maxBeamM: s.maxBeamM, rampCapacityT: s.rampCapacityT,
        bookingStatus: "OPEN", availableSlots: totalSlots, status: "SCHEDULED",
      },
      update: { vesselName: s.vesselName, vesselImo: s.vesselImo, vesselOperator: s.vesselOperator, departurePort: ports.op, arrivalPort: ports.dp, etd, eta, transitDays: ports.td, trailerCapacity: s.trailerCapacity, vehicleCapacity: s.vehicleCapacity, reeferCapacity: s.reeferCapacity, maxLoaM: s.maxLoaM, maxBeamM: s.maxBeamM, rampCapacityT: s.rampCapacityT },
    });
    created++;
  }
  console.log("Seeded:", created);
  await db.$disconnect();
})();
