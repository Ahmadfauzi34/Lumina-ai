import { Subject } from 'rxjs';
import { StreamEvent } from '../agent-stream-orchestrator';

export const agentEventBus = new Subject<StreamEvent>();
