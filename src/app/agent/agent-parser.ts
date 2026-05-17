import { StepKind, StepStatus } from './types';
import { AgentState } from './agent-state';

export class AgentParser {
  private state: AgentState;
  private currentReasoningStepIdx = -1;

  constructor(state: AgentState) {
    this.state = state;
  }

  getCurrentReasoningStepIdx(): number {
    return this.currentReasoningStepIdx;
  }

  clearReasoningStepIdx() {
    this.currentReasoningStepIdx = -1;
  }

  syncReasoningStep(text: string, parentIdx: number): void {
    // 1. Process explicit <think> or <thought> tags
    const matches = Array.from(text.matchAll(/<(?:think|thought)>([\s\S]*?)(?=<\/(?:think|thought)|<(?:think|thought)>|$)/ig));
    let hasChanged = false;
    
    for (let i = 0; i < matches.length; i++) {
        const startIdx = matches[i].index;
        const content = matches[i][1].trim();
        const isClosed = text.toLowerCase().includes('</think', startIdx) || text.toLowerCase().includes('</thought', startIdx) || i < matches.length - 1;
        hasChanged = this.updateOrCreateReasoningStep(content, parentIdx, startIdx, 'Berpikir...', isClosed) || hasChanged;
    }

    // 2. Process implicit patterns like **Thinking:** or Plan:
    const patterns = [
      { regex: /\*\*Thinking:\*\*([\s\S]*?)(?=\*\*|\n\n|$)/ig, label: 'Thinking' },
      { regex: /\b(?:Plan|Rencana):\s*([\s\S]*?)(?=\n\n|Action:|$)/ig, label: 'Rencana' },
    ];

    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
         const startIdx = match.index;
         const content = (match[1] || match[2] || '').trim();
         // If we matched something, consider it open unless it explicitly hits a blank line or bounding token
         const isClosed = match[0].endsWith('\n\n') || match[0].endsWith('Action:') || match[0].endsWith('**');
         hasChanged = this.updateOrCreateReasoningStep(content, parentIdx, startIdx, pattern.label, isClosed) || hasChanged;
      }
    }

    if (hasChanged) {
        this.state.emitField();
    }
  }

  private updateOrCreateReasoningStep(content: string, parentIdx: number, startIdx: number | undefined, defaultLabel: string, isClosed: boolean): boolean {
      if (!content) return false;
      let hasChanged = false;

      if (!(this.state.field as any)._thinkStarts) {
        (this.state.field as any)._thinkStarts = {};
      }

      const existingIdx = this.state.field.steps.kinds.findIndex((k, idx) => 
        (k === StepKind.REASON || k === StepKind.PLAN) && 
        this.state.field.steps.parentIdx[idx] === parentIdx && 
        (this.state.field as any)._thinkStarts[idx] === startIdx
      );

      let stepIdx = existingIdx;
      if (stepIdx === -1) {
        stepIdx = this.state.appendStep(defaultLabel === 'Rencana' ? StepKind.PLAN : StepKind.REASON, defaultLabel, content, parentIdx);
        (this.state.field as any)._thinkStarts[stepIdx] = startIdx;
        hasChanged = true;
      }

      if (this.state.field.steps.descriptions[stepIdx] !== content) {
        this.state.field.steps.descriptions[stepIdx] = content;
        hasChanged = true;
      }
      
      const newStatus = isClosed ? StepStatus.DONE : StepStatus.RUNNING;
      if (this.state.field.steps.statuses[stepIdx] !== newStatus) {
          this.state.field.steps.statuses[stepIdx] = newStatus;
          hasChanged = true;
          if (isClosed && this.currentReasoningStepIdx === stepIdx) {
              this.currentReasoningStepIdx = -1;
          } else if (!isClosed) {
              this.currentReasoningStepIdx = stepIdx;
          }
      }
      return hasChanged;
  }

  parseReasoningSteps(text: string, parentIdx: number): void {
    const patterns = [
      { regex: /\*\*Thinking:\*\*([\s\S]*?)(?=\*\*|\n\n|$)/ig, kind: StepKind.REASON, label: 'Thinking' },
      { regex: /\b(Plan|Rencana):\s*([\s\S]*?)(?=\n\n|Action:|$)/ig, kind: StepKind.PLAN, label: 'Rencana' },
    ];

    const existingContents = new Set<string>();
    for (let i = 0; i < this.state.stepCount; i++) {
        const desc = this.state.field.steps.descriptions[i];
        if (desc) existingContents.add(desc.trim());
    }

    for (const pattern of patterns) {
      let match;
      pattern.regex.lastIndex = 0;
      while ((match = pattern.regex.exec(text)) !== null) {
        const content = (match[1] || match[2] || '').trim();
        if (content && !existingContents.has(content)) {
          const stepIdx = this.state.appendStep(pattern.kind, pattern.label, content, parentIdx);
          this.state.field.steps.statuses[stepIdx] = StepStatus.DONE;
          existingContents.add(content);
        }
      }
    }
    this.state.emitField();
  }

  cleanUiText(text: string): string {
    return text.replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/ig, '')
               .replace(/\*\*Thinking:\*\*([\s\S]*?)(?=\*\*|\n\n|$)/ig, '')
               .replace(/\b(?:Plan|Rencana):\s*([\s\S]*?)(?=\n\n|Action:|$)/ig, '');
  }
}
