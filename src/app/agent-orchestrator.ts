import { Injectable, NgZone, inject } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { distinctUntilChanged, shareReplay } from 'rxjs/operators';
import { InteractiveTaskController } from './core/services/interactive-task.service';
import {
  StepStatus, ToolStatus, StepKind, AgentWaveField, ToolCallRequest,
  ToolCallResult, ToolRegistry, StreamChunk, ChatSession,
  OrchestratorConfig, OrchestratorSnapshot
} from './agent/types';
import { AgentState } from './agent/agent-state';
import { AgentParser } from './agent/agent-parser';
import { AgentExecutor } from './agent/agent-executor';

// Re-export for backwards compatibility
export { StepStatus, ToolStatus, StepKind };
export type { AgentWaveField, ToolCallRequest, ToolCallResult, ToolRegistry, StreamChunk, ChatSession, OrchestratorConfig, OrchestratorSnapshot };

@Injectable({ providedIn: 'root' })
export class AgentOrchestrator {
  private zone = inject(NgZone);
  private taskController = inject(InteractiveTaskController);

  private state = new AgentState();
  private parser = new AgentParser(this.state);
  private executor = new AgentExecutor(this.state);

  readonly field$ = this.state.field$;
  readonly complete$ = this.state.complete$;

  private textBuffer = '';
  private pendingText = '';
  private rafId: number | null = null;

  private textSubject = new BehaviorSubject<string>('');
  readonly text$ = this.textSubject.asObservable().pipe(
    distinctUntilChanged(),
    shareReplay(1)
  );

  private loadingSubject = new BehaviorSubject<boolean>(false);
  readonly loading$ = this.loadingSubject.asObservable().pipe(distinctUntilChanged());

  private errorSubject = new Subject<Error>();
  readonly error$ = this.errorSubject.asObservable();

  get isLoading(): boolean { return this.loadingSubject.value; }
  get currentField(): AgentWaveField | null { return this.state.field; }
  get currentText(): string { return this.textSubject.value; }
  get stepCount(): number { return this.state.stepCount; }
  get toolCount(): number { return this.state.toolCount; }
  get displayMessages(): { text: string }[] { return [{ text: this.pendingText }]; }

  private scheduleTextEmit(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      this.zone.run(() => {
        this.textSubject.next(this.parser.cleanUiText(this.pendingText));
        this.rafId = null;
      });
    });
  }

  cancelToolExecution(callId: string): boolean {
    return this.executor.cancelToolExecution(callId);
  }

  private hookPipelineProgress(taskId: string) {
    if (!this.taskController) return;
    this.field$.subscribe(field => {
      if (!field) return;
      const targetStepCount = field.steps.ids.filter(Boolean).length;
      const completedStepCount = field.steps.statuses.filter((s: StepStatus) => s === StepStatus.DONE || s === StepStatus.ERROR || s === StepStatus.SKIPPED).length;

      let detail = 'Executing steps...';
      if (completedStepCount < targetStepCount) {
        detail = field.steps.labels[completedStepCount] || 'Running task...';
      }

      if (this.taskController) {
          this.taskController.updatePhase(taskId, 'executing', {
            progress: {
              current: completedStepCount,
              total: Math.max(targetStepCount, 1),
              label: `${completedStepCount}/${Math.max(targetStepCount, 1)} step selesai`,
              detail: detail,
            }
          });
          
          if ((completedStepCount >= targetStepCount && targetStepCount > 0) || field.isFatal || field.isComplete) {
            this.taskController.updatePhase(taskId, 'completed');
          }
      }
    });
  }

  private detectLongRunningTask(message: any[]): boolean {
    const indicators = ['unit test', 'testing', 'test suite', 'generate', 'build', 'create', 'scaffold', 'analyze', 'process', 'transform', 'batch', 'multiple', 'all files', 'test', 'audit'];
    const text = message.map((p: any) => p.text || '').join(' ').toLowerCase();
    return indicators.some(i => text.includes(i));
  }
  
  private inferTaskTitle(message: any[]): string {
    let text = message.map((p: any) => p.text || '').join(' ');
    if (!text) text = 'Task';
    return text.substring(0, 50) + (text.length > 50 ? '...' : '');
  }

  async run(
    session: ChatSession,
    registry: ToolRegistry,
    initialMessage: any[],
    history: { role: string; parts: { text: string }[] }[],
    config?: Partial<OrchestratorConfig>
  ): Promise<void> {
    try {
      this.loadingSubject.next(true);
      this.reset();
      this.state.field.maxToolLoops = config?.maxToolLoops ?? 15;
      this.state.field.tokenLimit = config?.tokenLimit ?? 128000;

      const isLongRunning = this.detectLongRunningTask(initialMessage);
      if (isLongRunning) {
        const taskId = `task-${Date.now()}`;
        if (this.taskController) {
          await this.taskController.startTask({ id: taskId, title: this.inferTaskTitle(initialMessage), initialPhase: 'analyzing' });
          this.hookPipelineProgress(taskId);
        }
      }

      const parallel = config?.parallelTools ?? true;
      const planIdx = this.state.appendStep(StepKind.PLAN, 'Memulai Sesi', 'Menganalisis permintaan user');
      this.state.field.steps.statuses[planIdx] = StepStatus.RUNNING;
      this.state.emitField();

      let isDone = false;
      let nextInput: unknown = initialMessage;

      while (!isDone) {
        if (this.state.field.toolLoopCount >= this.state.field.maxToolLoops) {
          this.state.setFatalError();
          this.state.appendStep(StepKind.FINAL, 'Batas Tercapai', 'Maximum tool loops reached');
          break;
        }

        const stream = await session.sendMessageStream({ message: nextInput });
        let reasoningText = '';
        let inThoughtBlock = false;
        const toolCalls: { name: string; args: Record<string, unknown> }[] = [];

        for await (const chunk of stream) {
          let chunkText = '';
          const parts = chunk?.candidates?.[0]?.content?.parts;
          if (parts) {
            for (const p of parts as any) {
              const isThought = p.thought || !!p.executableCode || !!p.codeExecutionResult;
              if (isThought) {
                if (!inThoughtBlock) { chunkText += '<think>\n'; inThoughtBlock = true; }
                if (typeof p.thought === 'string') chunkText += p.thought;
                else if (p.text) chunkText += p.text;
                if (p.executableCode) chunkText += `\n\`\`\`python\n${p.executableCode.code}\n\`\`\`\n`;
                if (p.codeExecutionResult) chunkText += `\nOutput:\n\`\`\`\n${p.codeExecutionResult.output}\n\`\`\`\n`;
              } else if (p.text) {
                if (inThoughtBlock) { chunkText += '\n</think>\n'; inThoughtBlock = false; }
                chunkText += p.text;
              }
            }
          } else if (chunk.text) {
             if (inThoughtBlock) { chunkText += '\n</think>\n'; inThoughtBlock = false; }
             chunkText += chunk.text;
          }

          if (chunkText) {
            reasoningText += chunkText;
            this.pendingText = this.textBuffer + reasoningText;
            this.scheduleTextEmit();
            this.parser.syncReasoningStep(this.pendingText, planIdx);
          }

          if (chunk.functionCalls?.length) {
            toolCalls.push(...chunk.functionCalls.map((fc: any) => ({
              name: fc.name,
              args: typeof fc.args === 'string' ? JSON.parse(fc.args) : fc.args
            })));
          }

          if (chunk.usageMetadata) {
            this.state.field.totalTokens = chunk.usageMetadata.totalTokenCount || this.state.field.totalTokens;
          }
        }

        if (inThoughtBlock) {
          reasoningText += '\n</think>\n';
          this.pendingText = this.textBuffer + reasoningText;
          this.parser.syncReasoningStep(this.pendingText, planIdx);
        }

        this.parser.parseReasoningSteps(reasoningText, planIdx);
        if (this.parser.getCurrentReasoningStepIdx() !== -1) {
          this.state.field.steps.statuses[this.parser.getCurrentReasoningStepIdx()] = StepStatus.DONE;
          this.parser.clearReasoningStepIdx();
        }

        this.textBuffer = this.pendingText;

        if (toolCalls.length > 0) {
          const toolStepIdx = this.state.appendStep(StepKind.TOOL_CALL, `Eksekusi ${toolCalls.length} Tool`, toolCalls.map(t => `${t.name}(${JSON.stringify(t.args)})`).join('\n'), planIdx);
          this.state.field.toolLoopCount++;

          const toolRequests: ToolCallRequest[] = toolCalls.map((tc, i) => ({
            id: `call-${this.state.field.toolLoopCount}-${i}`,
            name: tc.name,
            arguments: tc.args
          }));

          const results = parallel
            ? await this.executor.executeToolsParallel(toolRequests, registry, toolStepIdx)
            : await this.executor.executeToolsSerial(toolRequests, registry, toolStepIdx);

          const functionResponseData = results.map((res, i) => ({
            functionResponse: { name: toolCalls[i].name, response: res }
          }));
          nextInput = functionResponseData;

          const reflectIdx = this.state.appendStep(StepKind.REFLECT, 'Evaluasi Hasil', results.map(r => `${r.status}: ${r.output.substring(0, 200)}`).join('\n'), toolStepIdx);
          this.state.field.steps.statuses[reflectIdx] = StepStatus.DONE;
        } else {
          isDone = true;
          const finalIdx = this.state.appendStep(StepKind.FINAL, 'Selesai', 'Respons final diterima', planIdx);
          this.state.field.steps.statuses[finalIdx] = StepStatus.DONE;
        }

        const status = this.state.computeSessionStatus();
        this.state.field.isComplete = status.isComplete;
        this.state.field.isFatal = status.isFatal;
        this.state.emitField(this.zone);
      }

      this.state.field.steps.statuses[planIdx] = StepStatus.DONE;
      this.textSubject.next(this.parser.cleanUiText(this.pendingText));
      this.state.complete(this.pendingText);
    } catch (err) {
      console.error(err);
      this.state.setFatalError();
      this.pendingText += `\n\n[Error: ${err instanceof Error ? err.message : String(err)}]`;
      this.textBuffer = this.pendingText;
      this.textSubject.next(this.parser.cleanUiText(this.pendingText));
      this.state.emitField(this.zone);
    } finally {
      this.loadingSubject.next(false);
    }
  }

  reset(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.textBuffer = '';
    this.pendingText = '';
    this.state.reset();
    this.parser.clearReasoningStepIdx();
    this.textSubject.next('');
  }
}
