import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

export async function startModelFixture() {
  const requests = [];
  const failures = [];
  function answer(body) {
    const messages = body.messages;
    const text = JSON.stringify(messages);
    if (text.includes('You are a title generator'))
      return { content: 'Fixture session' };
    const index = messages.findLastIndex((message) => message.role === 'user');
    const prompt = JSON.stringify(messages[index]?.content);
    const turns = messages.slice(index + 1);
    const results = turns.filter((message) => message.role === 'tool');
    const call = (name, input) => ({
      tool_calls: [
        {
          id: `call_${randomUUID()}`,
          type: 'function',
          function: { name, arguments: JSON.stringify(input) },
        },
      ],
    });
    if (prompt.includes('fixture:broad')) {
      if (results.length === 0)
        return call('subagent', {
          agent: 'explore',
          description: 'Explore fixture module',
          prompt:
            'fixture:explore Read fixture.txt and report file:line evidence.',
        });
      if (results.length === 1) {
        const sessionID = JSON.stringify(results[0]).match(
          /ses_[a-zA-Z0-9]+/,
        )?.[0];
        assert.ok(
          sessionID,
          'Native subagent did not return a child session ID',
        );
        return call('subagent', {
          agent: 'explore',
          sessionID,
          description: 'Attempt resumed repair',
          prompt: 'fixture:fix Now repair fixture.txt yourself.',
        });
      }
      return {
        content: 'Fixture exploration and resumed-write probe completed.',
      };
    }
    if (prompt.includes('fixture:explore') && results.length === 0)
      return call('read', { path: 'fixture.txt' });
    if (prompt.includes('fixture:fix') && results.length === 0)
      return call('patch', {
        patchText:
          '*** Begin Patch\n*** Update File: fixture.txt\n@@\n-original\n+modified\n*** End Patch',
      });
    if (prompt.includes('fixture:shell') && results.length === 0)
      return call('shell', { command: 'printf modified > fixture.txt' });
    if (prompt.includes('fixture:known') && results.length === 0)
      return call('read', { path: 'fixture.txt' });
    return {
      content: 'fixture.txt:1 — original; requested investigation complete.',
    };
  }
  const server = createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push(body);
      const message = answer(body);
      const completion = {
        id: `chatcmpl_${randomUUID()}`,
        model: body.model,
        created: 1,
      };
      const finish = message.tool_calls ? 'tool_calls' : 'stop';
      if (!body.stream) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            ...completion,
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', ...message },
                finish_reason: finish,
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 10,
              total_tokens: 20,
            },
          }),
        );
        return;
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const delta = message.tool_calls
        ? {
            role: 'assistant',
            tool_calls: message.tool_calls.map((tool, index) => ({
              index,
              ...tool,
            })),
          }
        : { role: 'assistant', ...message };
      for (const choice of [
        { index: 0, delta, finish_reason: null },
        { index: 0, delta: {}, finish_reason: finish },
      ])
        response.write(
          `data: ${JSON.stringify({ ...completion, object: 'chat.completion.chunk', choices: [choice] })}\n\n`,
        );
      response.end('data: [DONE]\n\n');
    } catch (error) {
      failures.push(error);
      response.writeHead(500).end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    requests,
    failures,
    config: {
      model: 'fixture/gpt-fixture',
      providers: {
        fixture: {
          package: '@opencode/ai/providers/openai-compatible',
          settings: {
            baseURL: `http://127.0.0.1:${server.address().port}/v1`,
            apiKey: 'fixture-only',
          },
          models: {
            'gpt-fixture': {
              capabilities: { tools: true, input: ['text'], output: ['text'] },
              limit: { context: 128000, output: 4096 },
            },
          },
        },
      },
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
