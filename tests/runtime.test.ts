import { Agent, Model, type Plugin } from '@opencode/plugin';
import type { SessionHooks } from '@opencode/plugin/promise/session';
import { describe, expect, it, vi } from 'vitest';
import { parseOptions } from '../src/options.js';
import {
  constrainPermissions,
  type Permission,
  permissionFor,
} from '../src/permissions.js';
import { buildRouting, createRuntime } from '../src/runtime.js';
import { createAgent } from './fixture.js';

const allow: Permission = { action: '*', resource: '*', effect: 'allow' };
const deny = (action: string, resource = '*'): Permission => ({
  action,
  resource,
  effect: 'deny',
});
const id = 'ses_fixture' as SessionHooks['prompt']['sessionID'];

function fixture(agent = 'explore', options: unknown = {}) {
  const session = {
    id,
    parentID: 'ses_parent',
    agent,
    permissions: [allow] as Permission[],
  };
  const agents = ['build', 'explore', 'oracle', 'general', 'designer'].map(
    (name) => {
      const result = createAgent(name);
      result.permissions = [allow];
      result.mode = name === 'build' ? 'primary' : 'subagent';
      return result;
    },
  );
  const update = vi.fn(async (input: { permissions: Permission[] }) => {
    session.permissions = input.permissions;
  });
  const context = {
    session: { get: vi.fn(async () => session), update },
    agent: {
      get: vi.fn(async ({ agentID }: { agentID: string }) => ({
        data: agents.find((a) => String(a.id) === agentID),
      })),
      list: vi.fn(async () => ({ data: agents })),
    },
  };
  const runtime = createRuntime(
    context as unknown as Plugin.Context,
    parseOptions(options),
  );
  const event = {
    sessionID: id,
    agent: Agent.ID.make(agent),
    model: Model.Ref.parse('fixture/test'),
    system: [{ type: 'text', text: 'Native provider prompt' }],
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'User request' }] },
    ],
    tools: { subagent: { description: 'Native tool', input: {} } },
    options: {},
  } as SessionHooks['context'];
  return { runtime, session, agents, context, event, update };
}

describe('specialist child boundary', () => {
  it.each([
    'explore',
    'oracle',
  ])('denies writes for %s despite global and inherited allow', async (agent) => {
    const f = fixture(agent);
    await f.runtime.prompt({ sessionID: id } as SessionHooks['prompt']);
    for (const action of [
      'edit',
      'shell',
      'execute',
      'subagent',
      'future_mcp_write',
    ])
      expect(permissionFor(f.session.permissions, action, '*')).toBe('deny');
    for (const action of ['read', 'glob', 'grep'])
      expect(permissionFor(f.session.permissions, action, 'src/**')).toBe(
        'allow',
      );
  });

  it('preserves host and inherited read restrictions without broadening access', async () => {
    const f = fixture();
    f.agents
      .find((a) => String(a.id) === 'explore')
      ?.permissions.push(deny('read', 'private/**'));
    f.session.permissions = [
      deny('read', 'credentials/**'),
      { action: 'read', resource: '*.env', effect: 'ask' },
    ];
    await f.runtime.prompt({ sessionID: id } as SessionHooks['prompt']);
    expect(permissionFor(f.session.permissions, 'read', 'private/key')).toBe(
      'deny',
    );
    expect(
      permissionFor(f.session.permissions, 'read', 'credentials/key'),
    ).toBe('deny');
    expect(permissionFor(f.session.permissions, 'read', '.env')).toBe('ask');
  });

  it('reapplies the boundary on continuation and stays idempotent on tool-driven turns', async () => {
    const f = fixture();
    await f.runtime.prompt({ sessionID: id } as SessionHooks['prompt']);
    const first = structuredClone(f.session.permissions);
    for (let turn = 0; turn < 5; turn++) await f.runtime.context(f.event);
    expect(f.session.permissions).toEqual(first);
    expect(f.update).toHaveBeenCalledTimes(1);
    f.session.permissions.push(allow);
    await f.runtime.prompt({ sessionID: id } as SessionHooks['prompt']);
    expect(permissionFor(f.session.permissions, 'edit', 'src/app.ts')).toBe(
      'deny',
    );
  });

  it('awaits policy installation and rejects admission if the update fails', async () => {
    const f = fixture();
    let resolve!: () => void;
    const gate = new Promise<void>((done) => {
      resolve = done;
    });
    f.update.mockImplementationOnce(async () => gate);
    let admitted = false;
    const admission = f.runtime
      .prompt({ sessionID: id } as SessionHooks['prompt'])
      .then(() => {
        admitted = true;
      });
    await vi.waitFor(() => expect(f.update).toHaveBeenCalledTimes(1));
    expect(admitted).toBe(false);
    resolve();
    await admission;
    f.update.mockRejectedValueOnce(new Error('policy unavailable'));
    await expect(
      f.runtime.prompt({ sessionID: id } as SessionHooks['prompt']),
    ).rejects.toThrow('policy unavailable');
  });

  it.each([
    'general',
    'designer',
  ])('only caps delegation for %s', async (agent) => {
    const f = fixture(agent);
    f.session.permissions.push(deny('shell', 'git push *'));
    await f.runtime.prompt({ sessionID: id } as SessionHooks['prompt']);
    expect(permissionFor(f.session.permissions, 'subagent', 'explore')).toBe(
      'deny',
    );
    expect(permissionFor(f.session.permissions, 'edit', 'file')).toBe('allow');
    expect(
      permissionFor(f.session.permissions, 'shell', 'git push origin'),
    ).toBe('deny');
  });

  it.each([
    'build',
    'plan',
    'custom',
  ])('leaves %s sessions untouched', async (agent) => {
    const f = fixture(agent);
    await f.runtime.prompt({ sessionID: id } as SessionHooks['prompt']);
    expect(f.update).not.toHaveBeenCalled();
  });

  it('leaves roots and disabled specialists untouched', async () => {
    const root = fixture();
    Reflect.deleteProperty(root.session, 'parentID');
    await root.runtime.context(root.event);
    expect(root.update).not.toHaveBeenCalled();
    const disabled = fixture('explore', { agents: { explore: false } });
    await disabled.runtime.prompt({ sessionID: id } as SessionHooks['prompt']);
    expect(disabled.update).not.toHaveBeenCalled();
  });
});

describe('permission projection', () => {
  it('intersects wildcard actions with the read-only tool set and keeps resource order', () => {
    const source: Permission[] = [
      allow,
      deny('r*', 'secret/*'),
      { action: 'r?ad', resource: 'secret/public', effect: 'ask' },
    ];
    const restricted = constrainPermissions(source, true);
    for (const action of ['read', 'glob', 'grep', 'external_directory'])
      for (const resource of ['src/a', 'secret/key', 'secret/public'])
        expect(permissionFor(restricted, action, resource)).toBe(
          permissionFor(source, action, resource),
        );
    expect(permissionFor(restricted, 'remove', 'secret/public')).toBe('deny');
    expect(permissionFor(restricted, 'new_tool', 'src/a')).toBe('deny');
    expect(constrainPermissions(restricted, true)).toEqual(restricted);
  });
});

describe('Build exploration routing', () => {
  it('appends one fixed block while preserving the native prompt, tools and messages', async () => {
    const f = fixture('build');
    const before = structuredClone(f.event);
    await f.runtime.context(f.event);
    await f.runtime.context(f.event);
    expect(f.event.system).toEqual([
      ...before.system,
      { type: 'text', text: buildRouting },
    ]);
    expect(f.event.tools).toEqual(before.tools);
    expect(f.event.messages).toEqual(before.messages);
    expect(f.update).not.toHaveBeenCalled();
    expect(buildRouting.split(/\s+/).length).toBeLessThanOrEqual(120);
  });

  it.each([
    'plan',
    'general',
    'explore',
    'custom',
  ])('does not add Build routing to %s', async (agent) => {
    const f = fixture(agent);
    const before = structuredClone(f.event.system);
    await f.runtime.context(f.event);
    expect(f.event.system).toEqual(before);
  });

  it.each([
    'disabled',
    'absent',
    'hidden',
    'primary',
    'denied',
    'unavailable',
  ])('omits routing when Explore is %s', async (state) => {
    const f = fixture(
      'build',
      state === 'disabled' ? { agents: { explore: false } } : {},
    );
    const explore = f.agents.find((a) => String(a.id) === 'explore');
    if (!explore) throw new Error('Missing Explore fixture');
    if (state === 'absent') f.agents.splice(f.agents.indexOf(explore), 1);
    if (state === 'hidden') explore.hidden = true;
    if (state === 'primary') explore.mode = 'primary';
    if (state === 'denied')
      f.session.permissions.push(deny('subagent', 'explore'));
    if (state === 'unavailable') delete f.event.tools.subagent;
    const before = structuredClone(f.event.system);
    await f.runtime.context(f.event);
    expect(f.event.system).toEqual(before);
  });
});
