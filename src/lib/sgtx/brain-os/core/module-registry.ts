// SGTX Brain OS — Module Registry + Capability Dispatch
// Every feature registers here. The Brain dispatches capabilities through this registry.

import type { BrainModule } from "./types";

interface RegisteredModule {
  module: BrainModule;
  status: "registered" | "active" | "failed";
  registeredAt: string;
}

class ModuleRegistryImpl {
  private modules = new Map<string, RegisteredModule>();
  private capabilityIndex = new Map<string, string>();

  async register(module: BrainModule): Promise<void> {
    if (this.modules.has(module.id)) return;
    this.modules.set(module.id, { module, status: "registered", registeredAt: new Date().toISOString() });
    for (const cap of module.capabilities) this.capabilityIndex.set(cap, module.id);
    try {
      await module.initialize?.();
      this.modules.get(module.id)!.status = "active";
    } catch { this.modules.get(module.id)!.status = "failed"; }
  }

  getModule(id: string): BrainModule | undefined { return this.modules.get(id)?.module; }
  getModuleByCapability(capability: string): BrainModule | undefined {
    const id = this.capabilityIndex.get(capability);
    return id ? this.modules.get(id)?.module : undefined;
  }

  /** Invoke a capability — the Brain's primary control mechanism. */
  async invoke(capability: string, input: any): Promise<any> {
    const mod = this.getModuleByCapability(capability);
    if (!mod) throw new Error(`No module registered for capability: ${capability}`);
    if (!mod.invoke) throw new Error(`Module ${mod.id} does not support invoke()`);
    return mod.invoke(capability, input);
  }

  listModules(): { id: string; name: string; version: string; type: string; status: string; capabilities: string[] }[] {
    return Array.from(this.modules.values()).map(e => ({
      id: e.module.id, name: e.module.name, version: e.module.version, type: e.module.type, status: e.status, capabilities: e.module.capabilities,
    }));
  }

  listCapabilities(): string[] { return Array.from(this.capabilityIndex.keys()); }
  count(): number { return this.modules.size; }
}

export const moduleRegistry = new ModuleRegistryImpl();
