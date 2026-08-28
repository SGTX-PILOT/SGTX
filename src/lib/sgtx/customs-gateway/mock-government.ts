// @ts-nocheck
import { logger } from "@/lib/sgtx/logger";
export const MOCK_SYSTEMS = ["MOCK-ACE", "MOCK-NAFEZA", "MOCK-CARGOX", "MOCK-EU-ICS2", "MOCK-EU-NCTS", "MOCK-EU-AES"];
export interface MockScenario { scenarioId: string; system: string; outcome: string; delay: number; externalReference: string; message: string; }
export async function mockSubmit(system: string, declaration: any, scenario?: string): Promise<any> {
  const outcomes: Record<string, any> = {
    SUCCESS: { accepted: true, externalReference: `MOCK-${Date.now()}`, status: "ACKNOWLEDGED", message: "Mock submission accepted" },
    REJECTION: { accepted: false, externalReference: `MOCK-REJ-${Date.now()}`, status: "REJECTED", message: "Mock rejection: validation failed" },
    HOLD: { accepted: true, externalReference: `MOCK-HOLD-${Date.now()}`, status: "HOLD", message: "Mock hold: inspection required" },
    TIMEOUT: { accepted: false, externalReference: "", status: "TIMEOUT", message: "Mock timeout: system unavailable" },
    SYSTEM_UNAVAILABLE: { accepted: false, externalReference: "", status: "SYSTEM_UNAVAILABLE", message: "Mock: government system unavailable" },
    RELEASE: { accepted: true, externalReference: `MOCK-REL-${Date.now()}`, status: "RELEASED", message: "Mock release: customs cleared" },
  };
  const outcome = scenario ? outcomes[scenario] || outcomes.SUCCESS : outcomes.SUCCESS;
  return { ...outcome, system, declarationId: declaration?.id || "unknown", timestamp: new Date().toISOString() };
}
export async function mockPollStatus(system: string, externalReference: string): Promise<any> {
  return { system, externalReference, status: "ACCEPTED", message: "Mock status: accepted", polledAt: new Date().toISOString() };
}
export async function mockReceiveEvent(system: string, eventType: string, externalReference: string): Promise<any> {
  return { system, eventType, externalReference, eventPayload: { status: eventType, timestamp: new Date().toISOString() } };
}
export function getMockScenarioList(): MockScenario[] {
  return MOCK_SYSTEMS.flatMap(system => ["SUCCESS","REJECTION","HOLD","TIMEOUT","SYSTEM_UNAVAILABLE","RELEASE"].map(outcome => ({
    scenarioId: `${system}-${outcome}`, system, outcome, delay: Math.random()*2000, externalReference: `MOCK-${outcome}-${Date.now()}`, message: `Mock ${outcome} for ${system}`
  })));
}
export async function runMockScenario(scenarioId: string): Promise<{ success: boolean; details: string[] }> {
  const [system, outcome] = scenarioId.split("-");
  const result = await mockSubmit(system, {}, outcome);
  return { success: result.accepted, details: [`Submitted to ${system}`, `Outcome: ${outcome}`, `Status: ${result.status}`, `Reference: ${result.externalReference}`] };
}
