import { Model } from '@opencode/plugin';
import { describe, expect, it } from 'vitest';
import { specialists } from '../src/agents.js';
import { parseOptions } from '../src/options.js';
import { registerAgents } from '../src/register.js';
import { createAgent, createEditor } from './fixture.js';

describe('agent registration', () => {
  it('leaves Build and every unrelated agent byte-for-byte unchanged', () => {
    const build = createAgent('build');
    build.system = 'Existing host-specific Build instructions';
    build.model = Model.Ref.parse('existing/main#high');
    const { editor, agents, getDefault } = createEditor([build]);
    const before = structuredClone(agents);
    registerAgents(editor, parseOptions({}));
    for (const [id, agent] of before) {
      if (id !== 'explore') expect(agents.get(id)).toEqual(agent);
    }
    expect(getDefault()).toBe('build');
    expect(agents.has('orchestrator')).toBe(false);
    expect([...agents.keys()].filter((id) => !before.has(id))).toEqual([
      'oracle',
      'designer',
    ]);
  });

  it('registers only subagents and stays idempotent', () => {
    const { editor, agents } = createEditor();
    registerAgents(editor, parseOptions({}));
    const first = structuredClone(agents);
    registerAgents(editor, parseOptions({}));
    expect(agents).toEqual(first);
    for (const name of Object.keys(specialists))
      expect(agents.get(name)?.mode).toBe('subagent');
  });

  it('disables each role explicitly, including the native explore entry', () => {
    const { editor, agents } = createEditor();
    registerAgents(
      editor,
      parseOptions({
        agents: { explore: false, oracle: false, designer: false },
      }),
    );
    expect(agents.has('explore')).toBe(false);
    expect(agents.has('oracle')).toBe(false);
    expect(agents.has('designer')).toBe(false);
    expect(agents.has('build')).toBe(true);
  });

  it('preserves an existing model unless a model is explicitly selected', () => {
    const oracle = createAgent('oracle');
    oracle.model = Model.Ref.parse('existing/model#low');
    const { editor, agents } = createEditor([oracle]);
    registerAgents(
      editor,
      parseOptions({
        agents: { designer: { model: 'chosen/model/path#high' } },
      }),
    );
    expect(agents.get('oracle')?.model).toEqual(oracle.model);
    expect(agents.get('explore')?.model).toBeUndefined();
    expect(agents.get('designer')?.model).toEqual(
      Model.Ref.parse('chosen/model/path#high'),
    );
  });

  it('keeps Designer permission restrictions and prevents recursive delegation', () => {
    const designer = createAgent('designer');
    designer.permissions.push({
      action: 'shell',
      resource: 'git push *',
      effect: 'deny',
    });
    const { editor, agents } = createEditor([designer]);
    registerAgents(editor, parseOptions({}));
    expect(agents.get('designer')?.permissions).toContainEqual({
      action: 'shell',
      resource: 'git push *',
      effect: 'deny',
    });
    expect(agents.get('designer')?.permissions.at(-1)).toEqual({
      action: 'subagent',
      resource: '*',
      effect: 'deny',
    });
  });

  it.each([
    'explore',
    'oracle',
  ])('makes %s deny-by-default for unknown and mutating tools', (name) => {
    const { editor, agents } = createEditor();
    registerAgents(editor, parseOptions({}));
    const permissions = agents.get(name)?.permissions ?? [];
    const permissionFor = (action: string) =>
      permissions.findLast(
        (rule) =>
          (rule.action === action || rule.action === '*') &&
          rule.resource === '*',
      )?.effect;
    for (const action of [
      'shell',
      'edit',
      'subagent',
      'new_mcp_write',
      'ast_grep_replace',
    ]) {
      expect(permissionFor(action)).toBe('deny');
    }
    for (const action of ['read', 'glob', 'grep'])
      expect(permissionFor(action)).toBe('allow');
    expect(permissionFor('external_directory')).toBe('ask');
  });

  it.each([
    'missing',
    'hidden',
    'subagent',
  ])('fails before mutation when Build is %s', (state) => {
    const { editor, agents } = createEditor();
    if (state === 'missing') agents.delete('build');
    else
      editor.update('build', (agent) => {
        if (state === 'hidden') agent.hidden = true;
        else agent.mode = 'subagent';
      });
    const before = structuredClone(agents);
    expect(() => registerAgents(editor, parseOptions({}))).toThrow(
      'requires the native',
    );
    expect(agents).toEqual(before);
  });
});

describe('prompt budget', () => {
  it('keeps each body below 50 words and each routing description below 25 words', () => {
    for (const specialist of Object.values(specialists)) {
      expect(specialist.system.split(/\s+/).length).toBeLessThanOrEqual(50);
      expect(specialist.description.split(/\s+/).length).toBeLessThanOrEqual(
        25,
      );
    }
    expect(Object.keys(specialists)).not.toContain('build');
    expect(Object.keys(specialists)).not.toContain('orchestrator');
  });
});
