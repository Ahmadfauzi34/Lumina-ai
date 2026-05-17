import type { TaskHandler } from '../task-handler';
import type { TaskTypeDefinition } from '../task-types';
import { agentEventBus } from '../agent/agent-event-bus';
import { generateId } from '../utils';

export const migrationTaskDefinition: TaskTypeDefinition = {
  id: 'migration',
  name: 'Codebase Migration',
  description: 'Migrate codebase to newer version or different framework.',
  category: 'migration',
  parameters: [
    { name: 'targetPath', type: 'file_path', description: 'Path to migrate', required: true }
  ],
  routing: {
    timeoutMs: 600000, maxRetries: 1, cacheable: false, cacheTtlMs: 0,
    parallelPhases: false, checkpointInterval: 30000
  },
  phases: ['analyzing', 'planning', 'awaiting_input', 'executing', 'validating', 'presenting', 'completed'],
  ui: {
    icon: '🚀', color: '#f59e0b', showProgressBar: true, showArtifacts: true, allowPause: true
  },
  status: 'available',
};

export const migrationHandler: TaskHandler = {
  definition: migrationTaskDefinition,
  canHandle: (args) => !!args['targetPath'],
  estimateComplexity: () => 90,
  executePhase: async (phase, ctx) => {
    const stepId = `mig-${phase}-${generateId()}`;

    switch (phase) {
      case 'analyzing':
        ctx.reportProgress(0, 100, 'Memindai codebase...');
        
        // AGEN POSTING KE TIMELINE
        agentEventBus.next({
          id: stepId, type: 'think.start', timestamp: new Date().toISOString(),
          metadata: { agentId: 'main-agent' }, payload: { label: 'Memulai Analisis' }
        });
        agentEventBus.next({
          id: stepId, type: 'think.chunk', timestamp: new Date().toISOString(),
          metadata: { agentId: 'main-agent' }, payload: { description: 'Memulai proses migrasi. @Gemma tolong bersiap untuk scan dependensi ya.' }
        });

        await new Promise(r => setTimeout(r, 1500));
        
        // AGEN SELESAI MENGETIK
        agentEventBus.next({ id: stepId, type: 'think.end', timestamp: new Date().toISOString(), metadata: { agentId: 'main-agent' }, payload: {} });
        
        return { nextPhase: 'planning' };
      case 'planning': {
        ctx.reportProgress(0, 100, 'Membuat rencana migrasi...');
        
        // SUB-AGEN MERESPONS DI TIMELINE
        const gemmaStepId = `mig-gemma-${generateId()}`;
        agentEventBus.next({
          id: gemmaStepId, type: 'think.start', timestamp: new Date().toISOString(),
          metadata: { agentId: 'gemma-4-31b-it', agentName: 'Gemma 4', themeColor: '#ec4899' }, payload: { label: 'Perencanaan Migrasi' }
        });
        agentEventBus.next({
          id: gemmaStepId, type: 'think.chunk', timestamp: new Date().toISOString(),
          metadata: { agentId: 'gemma-4-31b-it' }, payload: { description: 'Siap @Lumina(Main)! Saya menemukan 15 file usang di `/src/legacy`. Menunggu persetujuan eksekusi.' }
        });
        
        await new Promise(r => setTimeout(r, 1500));
        agentEventBus.next({ id: gemmaStepId, type: 'think.end', timestamp: new Date().toISOString(), metadata: { agentId: 'gemma-4-31b-it' }, payload: {} });

        return { nextPhase: 'awaiting_input' };
      }
      case 'awaiting_input': {
        const action = await ctx.requestUserAction([
          { id: 'continue', label: '✓ Jalankan Migrasi', style: 'primary' },
          { id: 'cancel', label: '✗ Batal', style: 'danger' }
        ]);
        if (action === 'cancel') return { nextPhase: 'cancelled' };
        return { nextPhase: 'executing' };
      }
      case 'executing':
        ctx.reportProgress(0, 100, 'Menerapkan perubahan...');
        await new Promise(r => setTimeout(r, 2000));
        return { nextPhase: 'validating' };
      case 'validating':
        return { nextPhase: 'presenting' };
      case 'presenting':
        return { nextPhase: 'completed', output: 'Migrasi berhasil.' };
      default:
        return { nextPhase: 'completed' };
    }
  }
};
