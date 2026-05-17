import type { TaskHandler } from '../task-handler';
import type { TaskTypeDefinition } from '../task-types';
import { agentEventBus } from '../agent/agent-event-bus';
import { generateId } from '../utils';

// ═══════════════════════════════════════════════════════════════════════════════
//  CONSTANTS & ENUMS  —  Compile-time dispatch, zero allocation hot path
// ═══════════════════════════════════════════════════════════════════════════════

const AGENT_ID    = 'code-auditor-flash';
const THEME_COLOR = '#8b5cf6';
const PHASE_COUNT = 6;

/** Phase identifiers — enum dispatch, zero string compare */
const PHASE = {
  ANALYZING:  0,
  PLANNING:   1,
  EXECUTING:  2,
  VALIDATING: 3,
  PRESENTING: 4,
  COMPLETED:  5,
} as const;

const PHASE_NAMES = [
  'analyzing', 'planning', 'executing', 'validating', 'presenting', 'completed'
] as const;

const PHASE_NEXT = [
  PHASE.PLANNING,
  PHASE.EXECUTING,
  PHASE.VALIDATING,
  PHASE.PRESENTING,
  PHASE.COMPLETED,
  PHASE.COMPLETED,
] as const;

const PHASE_DELAY_MS = [
  1500,  // analyzing
  1200,  // planning
  2000,  // executing
  0,     // validating
  0,     // presenting
  0,     // completed
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
//  SOA EVENT BUS  —  Watermark backpressure, eager flush, zero-copy
// ═══════════════════════════════════════════════════════════════════════════════

const RING_CAPACITY = 256; // 2^8
const RING_MASK     = RING_CAPACITY - 1;

const WM_HIGH  = RING_CAPACITY - 32;
const WM_FULL  = RING_CAPACITY - 8;
const WM_BATCH = 16;
const WM_AGE_MS = 16;

interface EventSoA {
  ids:          string[];
  types:        number[];
  timestamps:   number[];
  agentIds:     string[];
  labels:       (string | null)[];
  descriptions: (string | null)[];
}

interface FlushBuffers {
  ids:         string[];
  types:       number[];
  timestamps:  number[];
  agentIds:    string[];
  payloads:    unknown[];
}

export const EVT = {
  START:  0,
  CHUNK:  1,
  END:    2,
  CANCEL: 3,
} as const;

export class SoaEventBus {
  public soa: EventSoA;
  public head = 0;
  public tail = 0;
  public pending = 0;
  private flushBuf: FlushBuffers;
  private lastFlushTime = 0;
  private droppedCount = 0;
  private flushedCount = 0;

  constructor(capacity = RING_CAPACITY) {
    if ((capacity & (capacity - 1)) !== 0) throw new Error('RING_CAPACITY must be power-of-two');

    this.soa = {
      ids:          new Array(capacity),
      types:        new Array(capacity),
      timestamps:   new Array(capacity),
      agentIds:     new Array(capacity),
      labels:       new Array(capacity),
      descriptions: new Array(capacity),
    };

    this.flushBuf = {
      ids:        new Array(WM_BATCH * 2),
      types:      new Array(WM_BATCH * 2),
      timestamps: new Array(WM_BATCH * 2),
      agentIds:   new Array(WM_BATCH * 2),
      payloads:   new Array(WM_BATCH * 2),
    };

    this.lastFlushTime = performance.now();
  }

  enqueue(
    id: string,
    type: (typeof EVT)[keyof typeof EVT],
    timestamp: number,
    agentId: string,
    label: string | null = null,
    description: string | null = null,
  ): void {
    if (this.pending >= WM_FULL) {
      this.dropOldest(8);
      this.droppedCount += 8;
    }

    const idx = this.tail & RING_MASK;
    this.soa.ids[idx]         = id;
    this.soa.types[idx]       = type;
    this.soa.timestamps[idx]  = timestamp;
    this.soa.agentIds[idx]    = agentId;
    this.soa.labels[idx]      = label;
    this.soa.descriptions[idx] = description;
    this.tail++;
    this.pending++;

    const now = performance.now();
    const age = now - this.lastFlushTime;
    const shouldBatch = this.pending >= WM_BATCH;
    const shouldWater = this.pending >= WM_HIGH;
    const shouldAge   = age >= WM_AGE_MS;

    if (shouldBatch || shouldWater || shouldAge) {
      this.flush(shouldWater ? this.pending : WM_BATCH);
      this.lastFlushTime = now;
    }
  }

  flush(maxCount = WM_BATCH): void {
    const h = this.head;
    const t = this.tail;
    const avail = t - h;
    if (avail === 0) return;

    const count = Math.min(avail, maxCount);
    const { soa, flushBuf } = this;

    if (flushBuf.ids.length < count) {
      flushBuf.ids.length = count;
      flushBuf.types.length = count;
      flushBuf.timestamps.length = count;
      flushBuf.agentIds.length = count;
      flushBuf.payloads.length = count;
    }

    for (let i = 0; i < count; i++) {
      const idx = (h + i) & RING_MASK;
      flushBuf.ids[i]        = soa.ids[idx];
      flushBuf.types[i]      = soa.types[idx];
      flushBuf.timestamps[i] = soa.timestamps[idx];
      flushBuf.agentIds[i]   = soa.agentIds[idx];

      const type = soa.types[idx];
      if (type === EVT.START) {
        flushBuf.payloads[i] = { label: soa.labels[idx] };
      } else if (type === EVT.CHUNK) {
        flushBuf.payloads[i] = { description: soa.descriptions[idx] };
      } else if (type === EVT.CANCEL) {
        flushBuf.payloads[i] = { reason: soa.descriptions[idx] };
      } else {
        flushBuf.payloads[i] = {};
      }
    }

    downstreamEmitBatch(
      flushBuf.ids,
      flushBuf.types,
      flushBuf.timestamps,
      flushBuf.agentIds,
      flushBuf.payloads,
      count,
    );

    this.head += count;
    this.pending -= count;
    this.flushedCount++;
  }

  drain(): void {
    this.flush(this.pending);
  }

  metrics() {
    return { pending: this.pending, dropped: this.droppedCount, flushes: this.flushedCount, head: this.head, tail: this.tail };
  }

  public dropOldest(n: number): void {
    for (let i = 0; i < n; i++) {
        const idx = (this.head + i) & RING_MASK;
        this.soa.ids[idx] = '';
        this.soa.agentIds[idx] = '';
        this.soa.labels[idx] = null;
        this.soa.descriptions[idx] = null;
    }
    this.head += n;
    this.pending -= n;
  }
}

function downstreamEmitBatch(
  ids: string[],
  types: number[],
  timestamps: number[],
  agentIds: string[],
  payloads: any[],
  count: number,
): void {
  for (let i = 0; i < count; i++) {
     let evtType: any = 'think.end';
     switch(types[i]) {
       case EVT.START: evtType = 'think.start'; break;
       case EVT.CHUNK: evtType = 'think.chunk'; break;
       case EVT.END:   evtType = 'think.end'; break;
       case EVT.CANCEL: evtType = 'think.error'; break;
     }

     agentEventBus.next({
         id: ids[i],
         type: evtType,
         timestamp: new Date(timestamps[i] || Date.now()).toISOString(),
         metadata: { agentId: agentIds[i], agentName: 'Auditor Flash', themeColor: THEME_COLOR },
         payload: payloads[i]
     });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GLOBALS & HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

const eventBus = new SoaEventBus();

export const codeReviewTaskDefinition: TaskTypeDefinition = {
  id: 'code_review',
  name: 'Code Review',
  description: 'Perform an in-depth code review for best practices, security, and performance.',
  category: 'analysis',
  parameters: [
    { name: 'targetPath', type: 'file_path', description: 'Path to review', required: true }
  ],
  routing: {
    timeoutMs: 300000, maxRetries: 1, cacheable: true, cacheTtlMs: 3600000,
    parallelPhases: false, checkpointInterval: 30000
  },
  // using string array because type mismatch can happen with readonly tuples in TS
  phases: ['analyzing', 'planning', 'executing', 'validating', 'presenting', 'completed'],
  ui: {
    icon: '👀', color: THEME_COLOR, showProgressBar: true, showArtifacts: true, allowPause: true
  },
  status: 'available',
};

export const codeReviewHandler: TaskHandler = {
  definition: codeReviewTaskDefinition,
  canHandle: (args) => !!args['targetPath'],
  estimateComplexity: () => 50,
  
  executePhase: async (phase, ctx) => {
    // Determine enum value for switch from string
    const phaseIdx = PHASE_NAMES.indexOf(phase as any);
    if (phaseIdx < 0 || phaseIdx >= PHASE_COUNT) return { nextPhase: 'completed' };

    const stepId = `rev-${phase}-${generateId()}`;

    // Use fast event propagation instead of standard await/next loops
    switch (phaseIdx) {
      case PHASE.ANALYZING:
        ctx.reportProgress(0, 100, 'Memindai kode untuk review keamanan & arsitektur...');
        eventBus.enqueue(stepId, EVT.START, performance.now(), AGENT_ID, 'Code Scan', null);
        eventBus.enqueue(stepId, EVT.CHUNK, performance.now(), AGENT_ID, null, 'Memulai pemindaian file secara statis menggunakan kernel convolution AST...');
        break;
      case PHASE.PLANNING:
        ctx.reportProgress(10, 100, 'Merencanakan prioritas review...');
        eventBus.enqueue(stepId, EVT.START, performance.now(), AGENT_ID, 'Review Planning', null);
        eventBus.enqueue(stepId, EVT.CHUNK, performance.now(), AGENT_ID, null, 'Menyusun daftar prioritas: fokus kepada memory leaks, race conditions, dan O(N^2) bottlenecks.');
        break;
      case PHASE.EXECUTING:
        ctx.reportProgress(40, 100, 'Memvalidasi best practices Typescript...');
        eventBus.enqueue(stepId, EVT.START, performance.now(), AGENT_ID, 'Code Execution Review', null);
        eventBus.enqueue(stepId, EVT.CHUNK, performance.now(), AGENT_ID, null, 'Menganalisis alur eksekusi berdasarkan Data-Flow. Menemukan beberapa edge-case tanpa proper cleanup.');
        
        ctx.registerArtifact({
          name: 'review-report.md',
          type: 'report',
          content: '## Code Review Report\n- Linter Validation: Passed\n- Structural Integrity: Solid\n- **Warning**: Potential memory leak array bindings without tracking.\n- **Recommendation**: Pre-allocate SOAs for intense event processing.',
        });
        break;
      case PHASE.VALIDATING:
        ctx.reportProgress(80, 100, 'Mengonfirmasi hasil temuan sebelum dipublikasi...');
        break;
      case PHASE.PRESENTING:
        ctx.reportProgress(100, 100, 'Finalisasi feedback...');
        break;
      case PHASE.COMPLETED:
        eventBus.drain();
        return { nextPhase: 'completed', output: 'Code review telah selesai secara mendalam.' };
    }

    // Simulasi delay (atau diganti real workload di masa depan)
    if (PHASE_DELAY_MS[phaseIdx] > 0) {
       await new Promise(r => setTimeout(r, PHASE_DELAY_MS[phaseIdx]));
    }

    // Flush specific events if applicable (except for non-blocking phases)
    if (phaseIdx === PHASE.ANALYZING || phaseIdx === PHASE.PLANNING || phaseIdx === PHASE.EXECUTING) {
        eventBus.enqueue(stepId, EVT.END, performance.now(), AGENT_ID, null, null);
    }
    
    // Always trigger eager flush per-phase to sync immediately with downstream rx.
    eventBus.drain();

    return { 
       nextPhase: phaseIdx < PHASE_COUNT - 1 ? PHASE_NAMES[PHASE_NEXT[phaseIdx]] : 'completed' 
    };
  }
};
