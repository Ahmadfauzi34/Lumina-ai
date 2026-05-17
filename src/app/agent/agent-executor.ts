import { AgentState } from './agent-state';
import { StepStatus, ToolStatus, ToolCallRequest, ToolCallResult, ToolRegistry } from './types';
import { toolPipeline } from '../tools/implementations/tool-pipeline';

export class AgentExecutor {
  constructor(private state: AgentState) {}

  cancelToolExecution(callId: string): boolean {
    return toolPipeline.cancel(callId);
  }

  async executeToolsParallel(
    calls: ToolCallRequest[],
    registry: ToolRegistry,
    stepIdx: number
  ): Promise<ToolCallResult[]> {
    const toolIdxs = calls.map((call) => {
      const tIdx = this.state.appendTool(call.name, JSON.stringify(call.arguments), stepIdx);
      this.state.field.tools.statuses[tIdx] = ToolStatus.QUEUED;
      return tIdx;
    });

    this.state.field.steps.statuses[stepIdx] = StepStatus.RUNNING;
    this.state.emitField();

    const toolResults: ToolCallResult[] = new Array(calls.length);

    const executions = calls.map(async (call, i) => {
      const tIdx = toolIdxs[i];
      this.state.field.tools.statuses[tIdx] = ToolStatus.RUNNING;
      this.state.field.tools.startTimes[tIdx] = performance.now();
      this.state.emitField();

      try {
        const result = await registry.execute({
          id: call.id,
          name: call.name,
          arguments: call.arguments
        });

        const elapsed = Math.round(performance.now() - this.state.field.tools.startTimes[tIdx]);
        this.state.field.tools.latencies[tIdx] = elapsed;
        this.state.field.tools.results[tIdx] = JSON.stringify(result);
        this.state.field.tools.statuses[tIdx] = result.status === 'success' ? ToolStatus.SUCCESS : ToolStatus.FAILED;

        this.state.emitField();

        toolResults[i] = result;
        return result;
      } catch (err) {
        const elapsed = Math.round(performance.now() - this.state.field.tools.startTimes[tIdx]);
        this.state.field.tools.latencies[tIdx] = elapsed;
        const errorMsg = (err as Error).message;
        const isTimeout = errorMsg.toLowerCase().includes('timeout') || errorMsg.toLowerCase().includes('abort');
        const isCircuit = errorMsg.includes('CIRCUIT_OPEN');
        
        this.state.field.tools.statuses[tIdx] = isTimeout ? ToolStatus.TIMEOUT : 
                                         isCircuit ? ToolStatus.FAILED : 
                                         ToolStatus.FAILED;
        this.state.field.tools.results[tIdx] = JSON.stringify({ error: errorMsg });

        this.state.emitField();

        const errorResult = { status: 'error' as const, output: errorMsg };
        toolResults[i] = errorResult;
        return errorResult;
      }
    });

    await Promise.all(executions);

    this.state.field.steps.statuses[stepIdx] = this.state.computeStepStatusFromTools(stepIdx);
    this.state.emitField();

    return toolResults;
  }

  async executeToolsSerial(
    calls: ToolCallRequest[],
    registry: ToolRegistry,
    stepIdx: number
  ): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];
    for (const call of calls) {
      const res = await this.executeToolsParallel([call], registry, stepIdx);
      results.push(res[0]);
    }
    return results;
  }
}
