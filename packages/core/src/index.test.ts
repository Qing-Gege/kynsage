import { describe, it, expect } from 'vitest';

describe('@marshal/core sanity', () => {
  it('module loads', async () => {
    const mod = await import('./index.js');
    expect(mod).toBeDefined();
  });
});
