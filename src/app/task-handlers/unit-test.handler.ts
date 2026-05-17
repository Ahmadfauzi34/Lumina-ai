import type { TaskHandler } from '../task-handler';
import type { TaskTypeDefinition } from '../task-types';
import { agentEventBus } from '../agent/agent-event-bus';
import { generateId } from '../utils';

// ... (unitTestTaskDefinition remains the same)

export const unitTestTaskDefinition: TaskTypeDefinition = {
  id: 'generate_unit_tests',
  name: 'Generate Unit Tests',
  description: 'Generate comprehensive unit tests for code modules with proper mocking, coverage analysis, and test execution.',
  category: 'testing',
  parameters: [
    { name: 'targetPath', type: 'file_path', description: 'Path ke file/module yang akan di-test', required: true },
    { name: 'framework', type: 'string', description: 'Testing framework', required: false, enum: ['jest', 'vitest', 'mocha', 'jasmine'], default: 'jest' },
    { name: 'coverageThreshold', type: 'number', description: 'Minimum coverage %', required: false, default: 80 },
    { name: 'includeIntegration', type: 'boolean', description: 'Sertakan integration test', required: false, default: false },
  ],
  routing: {
    timeoutMs: 300000,      // 5 menit max
    maxRetries: 1,
    cacheable: true,
    cacheTtlMs: 3600000,    // 1 jam
    parallelPhases: false,  // Sequential phases
    checkpointInterval: 30000, // Auto-checkpoint tiap 30s
  },
  phases: ['analyzing', 'planning', 'awaiting_input', 'executing', 'validating', 'presenting', 'completed'],
  ui: {
    icon: '🧪',
    color: '#10b981',
    showProgressBar: true,
    showArtifacts: true,
    allowPause: true,
  },
  status: 'available',
};

export const unitTestHandler: TaskHandler = {
  definition: unitTestTaskDefinition,
  
  canHandle: (args) => !!args['targetPath'],
  
  estimateComplexity: () => 50,
  
  executePhase: async (phase, ctx) => {
    const stepId = `test-${phase}-${generateId()}`;
    const agentId = 'test-engineer-flash';

    switch (phase) {
      case 'analyzing': {
        ctx.reportProgress(0, 100, 'Memindai struktur kode...');
        
        agentEventBus.next({
          id: stepId, type: 'think.start', timestamp: new Date().toISOString(),
          metadata: { agentId, agentName: 'Test Engineer', themeColor: '#10b981' },
          payload: { label: 'Analyzing Codebase' }
        });
        agentEventBus.next({
          id: stepId, type: 'think.chunk', timestamp: new Date().toISOString(),
          metadata: { agentId },
          payload: { description: 'Memindai modul untuk identifikasi cakupan test. @Lumina saya lihat ada beberapa fungsi rekursif yang butuh edge-case testing.' }
        });

        await simulateDelay(800);
        
        ctx.reportProgress(50, 100, 'Menganalisis dependensi...');
        await simulateDelay(600);
        
        agentEventBus.next({ id: stepId, type: 'think.end', timestamp: new Date().toISOString(), metadata: { agentId }, payload: {} });

        ctx.registerArtifact({
          name: 'analysis-report.json',
          type: 'report',
          content: JSON.stringify({ functions: 5, asyncFns: 2, dependencies: ['rxjs', '@angular/core'] }),
        });
        
        return { nextPhase: 'planning', checkpoint: true };
      }
      
      case 'planning': {
        ctx.reportProgress(0, 100, 'Merancang strategi testing...');
        
        agentEventBus.next({
          id: stepId, type: 'think.start', timestamp: new Date().toISOString(),
          metadata: { agentId },
          payload: { label: 'Test Strategy' }
        });
        agentEventBus.next({
          id: stepId, type: 'think.chunk', timestamp: new Date().toISOString(),
          metadata: { agentId },
          payload: { description: 'Menentukan strategi mocking. Saya akan menggunakan manual mocks untuk dependensi berat.' }
        });

        const framework = String(ctx.args['framework'] || 'jest');
        const coverage = Number(ctx.args['coverageThreshold'] || 80);
        
        await simulateDelay(1000);
        
        ctx.registerArtifact({
          name: 'test-plan.md',
          type: 'report',
          content: `## Test Plan\n- Framework: ${framework}\n- Coverage target: ${coverage}%\n- Mock strategy: Auto-mock services`,
        });
        
        ctx.reportProgress(100, 100, 'Rancangan siap');
        agentEventBus.next({ id: stepId, type: 'think.end', timestamp: new Date().toISOString(), metadata: { agentId }, payload: {} });
        
        return { 
          nextPhase: 'awaiting_input', 
          output: `Rancangan test siap dengan framework ${framework}. Target coverage: ${coverage}%`,
          checkpoint: true 
        };
      }
      
      case 'awaiting_input': {
        const action = await ctx.requestUserAction([
          { id: 'continue', label: '✓ Lanjutkan Generate', style: 'primary' },
          { id: 'revise', label: '✎ Revisi Rancangan', style: 'secondary' },
          { id: 'cancel', label: '✗ Batal', style: 'danger' },
        ]);
        
        if (action === 'cancel') return { nextPhase: 'cancelled' };
        if (action === 'revise') return { nextPhase: 'planning' };
        return { nextPhase: 'executing' };
      }
      
      case 'executing': {
        const filesToGenerate = 3;
        const frameworks = String(ctx.args['framework'] || 'jest');
        
        for (let i = 0; i < filesToGenerate; i++) {
          const genStepId = `gen-${i}-${generateId()}`;
          ctx.reportProgress(i, filesToGenerate, `Menulis test file ${i + 1}/${filesToGenerate}...`, `generating spec ${i + 1}...`);
          
          agentEventBus.next({
            id: genStepId, type: 'think.start', timestamp: new Date().toISOString(),
            metadata: { agentId },
            payload: { label: `Generating File ${i+1}` }
          });
          agentEventBus.next({
            id: genStepId, type: 'think.chunk', timestamp: new Date().toISOString(),
            metadata: { agentId },
            payload: { description: `Menyusun unit test untuk module-${i}. Mengintegrasikan @framework mocking logic.` }
          });

          await simulateDelay(2000);
          
          ctx.registerArtifact({
            name: `module-${i}.spec.ts`,
            type: 'test',
            content: `// Auto-generated ${frameworks} test\n describe('Module ${i}', () => { ... });`,
            size: 2048,
          });

          agentEventBus.next({ id: genStepId, type: 'think.end', timestamp: new Date().toISOString(), metadata: { agentId }, payload: {} });
        }
        
        return { nextPhase: 'validating', checkpoint: true };
      }
      
      case 'validating': {
        ctx.reportProgress(0, 100, 'Menjalankan test suite...');
        
        agentEventBus.next({
          id: stepId, type: 'think.start', timestamp: new Date().toISOString(),
          metadata: { agentId },
          payload: { label: 'Test Validation' }
        });
        agentEventBus.next({
          id: stepId, type: 'think.chunk', timestamp: new Date().toISOString(),
          metadata: { agentId },
          payload: { description: 'Eksekusi test suite sedang berjalan. @Lumina harap pantau resourceUsage ya.' }
        });

        await simulateDelay(3000);
        
        ctx.reportProgress(50, 100, 'Mengukur coverage...');
        await simulateDelay(1500);
        
        ctx.reportProgress(100, 100, 'Validasi selesai');
        agentEventBus.next({ id: stepId, type: 'think.end', timestamp: new Date().toISOString(), metadata: { agentId }, payload: {} });
        
        ctx.registerArtifact({
          name: 'coverage-report.json',
          type: 'report',
          content: JSON.stringify({ lines: 94.2, branches: 87.5, functions: 100 }),
        });
        
        return { nextPhase: 'presenting' };
      }
      
      case 'presenting': {
        return { 
          nextPhase: 'completed',
          output: 'Test generation selesai. Semua file telah divalidasi.',
        };
      }
      
      default:
        return { nextPhase: 'completed' };
    }
  },
};

function simulateDelay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
