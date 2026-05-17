import { liveQuery } from 'dexie';
import { from, Observable } from 'rxjs';

export function dbQuery<T>(querier: () => Promise<T> | T): Observable<T> {
  return new Observable<T>((subscriber) => {
    const observable = liveQuery(querier);
    const subscription = observable.subscribe({
      next: (val) => subscriber.next(val as T),
      error: (err) => subscriber.error(err),
      complete: () => subscriber.complete()
    });
    return () => subscription.unsubscribe();
  });
}

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export const yieldControl = (): Promise<void> => {
  if (typeof MessageChannel !== 'undefined') {
    return new Promise(resolve => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => resolve();
      port2.postMessage(null);
    });
  }
  return new Promise(resolve => setTimeout(resolve, 0));
};

export const yieldIdle = (): Promise<void> => {
  if (typeof requestIdleCallback !== 'undefined') {
    const fn = requestIdleCallback as any;
    return new Promise(resolve => fn(resolve, { timeout: 50 }));
  }
  return yieldControl();
};

