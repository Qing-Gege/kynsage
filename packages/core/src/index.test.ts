import { describe, it, expect } from 'vitest';

describe('@kynsage/core sanity', () => {
  it('module loads', async () => {
    const mod = await import('./index.js');
    expect(mod).toBeDefined();
  });
});
