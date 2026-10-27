import { afterEach, describe, expect, it } from 'vitest';
import { makeCompany } from './helpers.js';
import { ToolBelt } from '../src/server/tools/registry.js';
import { AGENTS } from '../src/server/agents/definitions.js';
import { riskOf } from '../src/server/permissions/permissions.js';
import { PermissionDeniedError } from '../src/server/core/errors.js';

describe('Permissions', () => {
  let env: ReturnType<typeof makeCompany>;
  afterEach(() => env?.cleanup());

  it('no agent has unlimited or dangerous permissions', () => {
    for (const a of AGENTS) {
      expect(a.grants.some((g) => g.startsWith('DELETE:'))).toBe(false);
      expect(a.grants.some((g) => g.startsWith('PUBLISH:'))).toBe(false);
      expect(a.grants.length).toBeLessThan(40);
    }
    expect(riskOf('PUBLISH', 'video').critical).toBe(true);
    expect(riskOf('PUBLISH', 'store_change').critical).toBe(true);
  });

  it('denies tools outside an agent toolbox and records it', () => {
    env = makeCompany();
    const nova = new ToolBelt(env.c, 'NOVA', null, null);
    expect(() => nova.requestApproval({ kind: 'store_change', title: 'x', description: 'y', risk: 'HIGH', payload: {} })).toThrow(PermissionDeniedError);
    expect(env.c.events.recent(10, 'PERMISSION_DENIED').length).toBe(1);
  });

  it('denies actions without the grant even through the checker', () => {
    env = makeCompany();
    expect(env.c.permissions.can('EVA', 'CREATE', 'store_change')).toBe(true);
    expect(env.c.permissions.can('EVA', 'APPROVE', 'store_change')).toBe(false);
    expect(env.c.permissions.can('NOAH', 'APPROVE', 'store_change')).toBe(true);
    expect(() => env.c.permissions.authorize('IRIS', 'EDIT', 'video')).toThrow(PermissionDeniedError);
    expect(env.c.activity.list({ kind: 'error' }).some((e) => e.action.includes('PERMISSION DENIED'))).toBe(true);
  });
});
