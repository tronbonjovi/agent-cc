import type { PipelineManager } from "./manager";

let pipelineManager: PipelineManager | null = null;

export function setPipelineManager(pm: PipelineManager) {
  pipelineManager = pm;
}

export function getPipelineManager(): PipelineManager | null {
  return pipelineManager;
}
