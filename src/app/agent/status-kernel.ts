import { StepStatus, StatusKernel } from './types';

export const STATUS_KERNEL: StatusKernel = {
  computeAggregate: (statuses) => {
    const counts = new Uint32Array(6);
    const len = statuses.length;
    for (let i = 0; i < len; i++) {
      counts[statuses[i]]++;
    }
    let maxIdx = 0;
    let maxCount = counts[0];
    for (let i = 1; i < 6; i++) {
      const gt = +(counts[i] > maxCount);
      maxIdx = gt * i + (1 - gt) * maxIdx;
      maxCount = gt * counts[i] + (1 - gt) * maxCount;
    }
    return maxIdx as StepStatus;
  },
  computeActiveMask: (statuses) => {
    let mask = 0;
    const len = statuses.length;
    for (let i = 0; i < len; i++) {
      mask |= 1 << statuses[i];
    }
    return mask;
  }
};
