import { NextResponse } from "next/server";
import { brainOrchestrator } from "@/lib/sgtx/brain-os/core/orchestrator";
import { moduleRegistry } from "@/lib/sgtx/brain-os/core/module-registry";
import { eventBus } from "@/lib/sgtx/brain-os/core/event-bus";
import { learningLoop } from "@/lib/sgtx/brain-os/learning/learning-loop";

export const dynamic = "force-dynamic";

export async function GET() {
  await brainOrchestrator.initialize().catch(() => {});
  const status = brainOrchestrator.getStatus();
  const modules = moduleRegistry.listModules();
  const capabilities = moduleRegistry.listCapabilities();
  const accuracy = learningLoop.getAccuracyMetrics();
  const knowledge = learningLoop.getKnowledgeBase();

  return NextResponse.json({
    ok: true,
    orchestrator: status,
    modules: { total: modules.length, active: modules.filter(m => m.status === "active").length, list: modules },
    capabilities: { total: capabilities.length, list: capabilities },
    learning: { ...accuracy, knowledgeEntries: knowledge.length, knowledgeBase: knowledge.slice(-5) },
    eventBus: eventBus.getMetrics(),
    subscribers: eventBus.getSubscribers(),
  });
}
