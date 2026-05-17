import { AgentWaveField, StepKind, StepStatus, ToolStatus, OrchestratorSnapshot } from './types';
import { STATUS_KERNEL } from './status-kernel';
import { BehaviorSubject, Subject } from 'rxjs';
import { distinctUntilChanged, shareReplay } from 'rxjs/operators';
import { NgZone } from '@angular/core';

export class AgentState {
  private readonly CAPACITY = 64;
  public field: AgentWaveField;
  
  private fieldSubject = new BehaviorSubject<AgentWaveField | null>(null);
  readonly field$ = this.fieldSubject.asObservable().pipe(
    distinctUntilChanged((a, b) => a?.epoch === b?.epoch),
    shareReplay(1)
  );

  private completeSubject = new Subject<OrchestratorSnapshot>();
  readonly complete$ = this.completeSubject.asObservable();

  private _stepCount = 0;
  get stepCount(): number { return this._stepCount; }

  private _toolCount = 0;
  get toolCount(): number { return this._toolCount; }

  constructor() {
    this.field = this.createEmptyField();
  }

  reset() {
    this.field = this.createEmptyField();
    this._stepCount = 0;
    this._toolCount = 0;
    this.emitField();
  }

  setFatalError() {
    this.field.isFatal = true;
    this.field.isComplete = true;
    this.emitField();
  }

  complete(textBuffer: string) {
    this.field.isComplete = true;
    this.emitField();
    this.completeSubject.next({
      field: { ...this.field },
      textBuffer
    });
  }

  private createEmptyField(): AgentWaveField {
    return {
      epoch: 0,
      totalTokens: 0,
      tokenLimit: 128000,
      toolLoopCount: 0,
      maxToolLoops: 15,
      isComplete: false,
      isFatal: false,
      steps: {
        ids:          new Array(this.CAPACITY),
        orders:       new Array(this.CAPACITY),
        kinds:        new Array(this.CAPACITY),
        statuses:     new Array(this.CAPACITY),
        labels:       new Array(this.CAPACITY),
        descriptions: new Array(this.CAPACITY),
        tokenIns:     new Array(this.CAPACITY),
        tokenOuts:    new Array(this.CAPACITY),
        elapsedMs:    new Array(this.CAPACITY),
        parentIdx:    new Array(this.CAPACITY),
        depth:        new Array(this.CAPACITY),
      },
      tools: {
        ids:        new Array(this.CAPACITY),
        names:      new Array(this.CAPACITY),
        params:     new Array(this.CAPACITY),
        results:    new Array(this.CAPACITY),
        statuses:   new Array(this.CAPACITY),
        latencies:  new Array(this.CAPACITY),
        stepIdx:    new Array(this.CAPACITY),
        startTimes: new Array(this.CAPACITY),
      }
    };
  }

  computeStepStatusFromTools(stepIdx: number): StepStatus {
    let hasRunning = false;
    let hasQueued = false;
    let hasFailed = false;
    let allSuccess = true;
    let hasTool = false;

    for (let t = 0; t < this._toolCount; t++) {
      if (this.field.tools.stepIdx[t] === stepIdx) {
        hasTool = true;
        const status = this.field.tools.statuses[t];
        hasRunning = hasRunning || (status === ToolStatus.RUNNING);
        hasQueued = hasQueued || (status === ToolStatus.QUEUED);
        hasFailed = hasFailed || (status === ToolStatus.FAILED || status === ToolStatus.TIMEOUT);
        allSuccess = allSuccess && (status === ToolStatus.SUCCESS);
      }
    }

    if (!hasTool) return StepStatus.PENDING;
    if (hasRunning) return StepStatus.RUNNING;
    if (hasQueued) return StepStatus.PENDING;
    if (hasFailed) return StepStatus.ERROR;
    if (allSuccess) return StepStatus.DONE;
    return StepStatus.PENDING;
  }

  computeSessionStatus(): { isComplete: boolean; isFatal: boolean } {
    const denseStatuses = this.field.steps.statuses.slice(0, this._stepCount);
    const mask = STATUS_KERNEL.computeActiveMask(denseStatuses);
    const hasRunning = (mask & (1 << StepStatus.RUNNING)) !== 0;
    const hasPending = (mask & (1 << StepStatus.PENDING)) !== 0;
    const allDoneOrError = (mask & ~((1 << StepStatus.DONE) | (1 << StepStatus.ERROR) | (1 << StepStatus.SKIPPED))) === 0;

    return {
      isComplete: !hasRunning && !hasPending && allDoneOrError,
      isFatal: this.field.toolLoopCount >= this.field.maxToolLoops
    };
  }

  appendStep(kind: StepKind, label: string, description: string, parentIdx = -1): number {
    const idx = this._stepCount;
    if (idx >= this.field.steps.ids.length) {
      this.resizeStepBuffer();
    }

    const steps = this.field.steps;
    steps.ids[idx] = `step-${idx}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    steps.orders[idx] = idx;
    steps.kinds[idx] = kind;
    steps.statuses[idx] = StepStatus.PENDING;
    steps.labels[idx] = label;
    steps.descriptions[idx] = description;
    steps.tokenIns[idx] = 0;
    steps.tokenOuts[idx] = 0;
    steps.elapsedMs[idx] = 0;
    steps.parentIdx[idx] = parentIdx;
    steps.depth[idx] = parentIdx >= 0 ? steps.depth[parentIdx] + 1 : 0;

    this._stepCount++;
    this.emitField();
    return idx;
  }

  appendTool(name: string, params: string, stepIdx: number): number {
    const idx = this._toolCount;
    if (idx >= this.field.tools.ids.length) {
      this.resizeToolBuffer();
    }

    const tools = this.field.tools;
    tools.ids[idx] = `tool-${idx}-${Date.now()}`;
    tools.names[idx] = name;
    tools.params[idx] = params;
    tools.results[idx] = '';
    tools.statuses[idx] = ToolStatus.QUEUED;
    tools.latencies[idx] = 0;
    tools.stepIdx[idx] = stepIdx;
    tools.startTimes[idx] = 0;

    this._toolCount++;
    return idx;
  }

  private resizeStepBuffer(): void {
    const old = this.field.steps;
    const oldCap = old.ids.length;
    const newCap = oldCap * 2;

    old.ids.length = newCap; old.ids.fill('', oldCap, newCap);
    old.orders.length = newCap; old.orders.fill(0, oldCap, newCap);
    old.kinds.length = newCap; old.kinds.fill(StepKind.PLAN, oldCap, newCap);
    old.statuses.length = newCap; old.statuses.fill(StepStatus.PENDING, oldCap, newCap);
    old.labels.length = newCap; old.labels.fill('', oldCap, newCap);
    old.descriptions.length = newCap; old.descriptions.fill('', oldCap, newCap);
    old.tokenIns.length = newCap; old.tokenIns.fill(0, oldCap, newCap);
    old.tokenOuts.length = newCap; old.tokenOuts.fill(0, oldCap, newCap);
    old.elapsedMs.length = newCap; old.elapsedMs.fill(0, oldCap, newCap);
    old.parentIdx.length = newCap; old.parentIdx.fill(-1, oldCap, newCap);
    old.depth.length = newCap; old.depth.fill(0, oldCap, newCap);
  }

  private resizeToolBuffer(): void {
    const old = this.field.tools;
    const oldCap = old.ids.length;
    const newCap = oldCap * 2;

    old.ids.length = newCap; old.ids.fill('', oldCap, newCap);
    old.names.length = newCap; old.names.fill('', oldCap, newCap);
    old.params.length = newCap; old.params.fill('', oldCap, newCap);
    old.results.length = newCap; old.results.fill('', oldCap, newCap);
    old.statuses.length = newCap; old.statuses.fill(ToolStatus.IDLE, oldCap, newCap);
    old.latencies.length = newCap; old.latencies.fill(0, oldCap, newCap);
    old.stepIdx.length = newCap; old.stepIdx.fill(-1, oldCap, newCap);
    old.startTimes.length = newCap; old.startTimes.fill(0, oldCap, newCap);
  }

  emitField(zone?: NgZone): void {
    this.field.epoch++;
    const snapshot: AgentWaveField = {
      ...this.field,
      steps: {
        ...this.field.steps,
        ids: [...this.field.steps.ids],
        orders: [...this.field.steps.orders],
        kinds: [...this.field.steps.kinds],
        statuses: [...this.field.steps.statuses],
        labels: [...this.field.steps.labels],
        descriptions: [...this.field.steps.descriptions],
        tokenIns: [...this.field.steps.tokenIns],
        tokenOuts: [...this.field.steps.tokenOuts],
        elapsedMs: [...this.field.steps.elapsedMs],
        parentIdx: [...this.field.steps.parentIdx],
        depth: [...this.field.steps.depth],
      },
      tools: {
        ...this.field.tools,
        ids: [...this.field.tools.ids],
        names: [...this.field.tools.names],
        params: [...this.field.tools.params],
        results: [...this.field.tools.results],
        statuses: [...this.field.tools.statuses],
        latencies: [...this.field.tools.latencies],
        stepIdx: [...this.field.tools.stepIdx],
        startTimes: [...this.field.tools.startTimes],
      }
    };
    
    if (zone) {
      zone.run(() => this.fieldSubject.next(snapshot));
    } else {
      this.fieldSubject.next(snapshot);
    }
  }
}
