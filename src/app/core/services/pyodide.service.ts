import { Injectable, signal } from '@angular/core';
import { wrap, Remote } from 'comlink';

interface PyodideWorker {
  init(): Promise<void>;
  run(code: string): Promise<{ stdout: string; stderr: string; result: any; piiOutput?: string; hasError?: boolean }>;
}

@Injectable({ providedIn: 'root' })
export class PyodideService {
  private worker: Remote<PyodideWorker> | null = null;
  private loadingPromise: Promise<void> | null = null;
  
  isReady = signal(false);
  isLoading = signal(false);
  loadingStatus = signal<string>('');

  /**
   * Initializes the Web Worker and Pyodide environment.
   */
  async load() {
    if (this.isReady()) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.isLoading.set(true);
    this.loadingStatus.set('Initializing Python engine (Worker)...');
    
    this.loadingPromise = (async () => {
      try {
        const rawWorker = new Worker(new URL('./pyodide.worker.ts', import.meta.url), { type: 'module' });
        this.worker = wrap<PyodideWorker>(rawWorker);
        
        await this.worker.init();
        this.isReady.set(true);
      } catch (error) {
        console.error('Failed to load Pyodide Worker:', error);
        this.loadingStatus.set('Error loading Python Worker');
        throw error;
      } finally {
        this.isLoading.set(false);
        this.loadingStatus.set('');
      }
    })();

    return this.loadingPromise;
  }

  async run(code: string): Promise<{ stdout: string; stderr: string; result: any; piiOutput?: string; hasError?: boolean }> {
    await this.load();
    
    if (!this.worker) {
      throw new Error('Pyodide worker not initialized');
    }

    this.isLoading.set(true);
    this.loadingStatus.set('Running Python script...');
    
    try {
      return await this.worker.run(code);
    } catch (error: any) {
      return {
        stdout: '',
        stderr: error.message,
        result: null,
        hasError: true
      };
    } finally {
      this.isLoading.set(false);
      this.loadingStatus.set('');
    }
  }

  /**
   * Installs necessary python packages (via the worker).
   */
  async installPackages(packages: string[]) {
    // Note: Usually handled by auto-load from imports in the worker,
    // but can be added if manual installation is needed.
    await this.load();
    // Implementation can be added to worker if needed
  }
}
