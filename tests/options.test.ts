import { describe, expect, it } from 'vitest';
import { parseOptions } from '../src/options.js';

describe('options', () => {
  it('defaults to inherited models without inventing a provider', () => {
    expect(parseOptions(undefined)).toEqual({ agents: {} });
    expect(parseOptions({})).toEqual({ agents: {} });
  });

  it('accepts disabled roles and explicit model variants', () => {
    expect(
      parseOptions({
        agents: { oracle: false, designer: { model: 'provider/model#high' } },
      }),
    ).toEqual({
      agents: { oracle: false, designer: { model: 'provider/model#high' } },
    });
  });

  it.each([
    'model',
    '/model',
    'provider/',
    'provider/model#',
    'provider/model#high#extra',
    'provider/model name',
    'provider#x/model',
  ])('rejects malformed model %s', (model) => {
    expect(() => parseOptions({ agents: { designer: { model } } })).toThrow(
      'agents.designer.model',
    );
  });

  it.each([
    { orchestrator: {} },
    { agents: { fixer: {} } },
    { agents: { explorer: {} } },
    { agents: { build: { system: 'override' } } },
    { agents: { oracle: { prompt: 'override' } } },
    { agents: { designer: true } },
    [],
  ])('rejects unsupported configuration rather than silently ignoring it: %j', (options) => {
    expect(() => parseOptions(options)).toThrow(
      'Invalid opencode-yee-profile options',
    );
  });
});
