import { WebSocket } from 'ws';
import Anthropic from '@anthropic-ai/sdk';
import { getClientByTwilioPhone, ClientConfig } from '../lib/client-config.js';
import { buildSystemPrompt } from './prompts.js';
import {
  sanitizeUserText,
  extractText,
  sanitizeContentForHistory,
  withRetry,
  FALLBACK_REPLY,
} from '../lib/ai-safety.js';
import { voiceTools, executeTool } from './tools.js';
import { callSummaryNotification } from '../services/notifications.js';
import { db, calls, leads } from '@serviceline/db';
import { AI, VOICE, LIMITS } from '@serviceline/config';

function getAnthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.warn('[DEV] No ANTHROPIC_API_KEY set — voice agent will use mock responses');
    return null;
  }
  return new Anthropic();
}

// Module-level singleton — only created once
let _anthropicClient: Anthropic | null | undefined;
function getOrCreateAnthropicClient(): Anthropic | null {
  if (_anthropicClient === undefined) {
    _anthropicClient = getAnthropicClient();
  }
  return _anthropicClient;
}

interface ConversationRelaySetup {
  type: 'setup';
  callSid: string;
  from: string;
  to: string;
}

interface ConversationRelayPrompt {
  type: 'prompt';
  voicePrompt: string;
}

interface ConversationRelayInterrupt {
  type: 'interrupt';
  utteranceUntilInterrupt: string;
  durationUntilInterruptMs: number;
}

type ConversationRelayMessage =
  | ConversationRelaySetup
  | ConversationRelayInterrupt
  | ConversationRelayPrompt
  | { type: string };

export async function handleWebSocket(ws: WebSocket) {
  let client: ClientConfig | null = null;
  let callSid = '';
  let callerPhone = '';
  let messageHistory: Anthropic.MessageParam[] = [];
  let systemPrompt = '';
  let appointmentBooked = false;
  let emergencyEscalated = false;
  let leadId: string | null = null;

  // Per-session tool invocation counters
  const toolInvocationCounts: Record<string, number> = {};

  // Serialization mutex — ensures messages are processed one at a time
  let processing = Promise.resolve();

  // Timeouts for resource management
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const maxTimer = setTimeout(() => {
    ws.close(1000, 'Max call duration reached');
  }, VOICE.maxCallDurationMs);

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      ws.close(1000, 'Idle timeout');
    }, VOICE.idleTimeoutMs);
  }

  resetIdleTimer();

  ws.on('message', (data) => {
    resetIdleTimer();

    // Guard against oversized messages (DoS protection)
    const rawLen = Buffer.isBuffer(data) ? data.length
      : ArrayBuffer.isView(data) ? data.byteLength
      : Array.isArray(data) ? data.reduce((s, b) => s + b.length, 0)
      : String(data).length;
    if (rawLen > LIMITS.wsMaxMessageBytes) {
      console.warn(`Dropping oversized WebSocket message (${rawLen} bytes)`);
      return;
    }

    // Queue message processing to prevent race conditions
    processing = processing.then(() => handleMessage(data)).catch((err) => {
      console.error('Unhandled error in message handler:', err instanceof Error ? err.message : 'Unknown error');
    });
  });

  async function handleMessage(data: unknown) {
    let msg: ConversationRelayMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      console.error('Invalid JSON from ConversationRelay');
      return;
    }

    if (msg.type === 'setup') {
      const setup = msg as ConversationRelaySetup;
      callSid = setup.callSid;
      callerPhone = setup.from;
      client = await getClientByTwilioPhone(setup.to);

      if (!client) {
        ws.send(
          JSON.stringify({
            type: 'text',
            token: "I'm sorry, there's a system error. Please try calling back.",
            last: true,
          }),
        );
        ws.close(1008, 'Unknown phone number');
        return;
      }

      systemPrompt = buildSystemPrompt({
        name: client.name,
        services: client.services as string[],
        serviceArea: client.serviceArea,
        industry: client.industry,
        customPrompt: client.aiSystemPrompt,
      });

      // Create lead record for this call
      try {
        const [lead] = await db
          .insert(leads)
          .values({
            clientId: client.id,
            contactPhone: callerPhone,
            source: 'voice',
            status: 'new',
          })
          .onConflictDoNothing({ target: [leads.clientId, leads.contactPhone] })
          .returning();
        if (lead) {
          leadId = lead.id;
        }
      } catch (err) {
        console.error('Failed to create lead:', err instanceof Error ? err.message : 'Unknown error');
      }
      return;
    }

    // Handle interruptions — caller spoke while AI was talking
    if (msg.type === 'interrupt') {
      const interrupt = msg as ConversationRelayInterrupt;
      // Truncate the last assistant message to what the caller actually heard
      const lastAssistantIdx = messageHistory.findLastIndex(
        (m) => m.role === 'assistant',
      );
      if (lastAssistantIdx !== -1 && interrupt.utteranceUntilInterrupt) {
        const entry = messageHistory[lastAssistantIdx];
        if (typeof entry.content === 'string') {
          const cutIdx = entry.content.indexOf(interrupt.utteranceUntilInterrupt);
          if (cutIdx !== -1) {
            messageHistory[lastAssistantIdx] = {
              role: 'assistant',
              content: entry.content.substring(
                0,
                cutIdx + interrupt.utteranceUntilInterrupt.length,
              ),
            };
          }
        }
      }
      return; // The caller's next words will come as a 'prompt' message
    }

    if (msg.type === 'prompt') {
      if (!client) return; // No valid client — ignore

      const prompt = msg as ConversationRelayPrompt;
      messageHistory.push({ role: 'user', content: sanitizeUserText(prompt.voicePrompt) });

      // Cap history to prevent memory growth
      if (messageHistory.length > AI.maxHistory) { // MAX_HISTORY — now sourced from @serviceline/config
        // Keep first message (context) and last maxHistory-1
        messageHistory = [messageHistory[0], ...messageHistory.slice(-(AI.maxHistory - 1))];
      }

      const anthropic = getOrCreateAnthropicClient();
      if (!anthropic) {
        const mockResponse =
          "Thanks for calling! I'd be happy to help. Could you tell me your name and what's going on?";
        messageHistory.push({ role: 'assistant', content: mockResponse });
        ws.send(JSON.stringify({ type: 'text', token: mockResponse, last: true }));
        return;
      }

      try {
        await processWithToolLoop(anthropic, ws, client);
      } catch (err) {
        console.error('Claude API error:', err instanceof Error ? err.message : 'Unknown error');
        const fallback = "I'm having a little trouble. Could you repeat that?";
        // Record a fallback assistant turn so the conversation stays role-alternating.
        // Without this, the caller's next prompt would create two consecutive user
        // messages and the following request would 400 — turning one blip into a dead call.
        messageHistory.push({ role: 'assistant', content: fallback });
        ws.send(JSON.stringify({ type: 'text', token: fallback, last: true }));
      }
    }
  }

  /** Check if a tool invocation is within session rate limits */
  function checkToolRateLimit(toolName: string): { allowed: boolean; message?: string } {
    const limit = LIMITS.toolLimits[toolName];
    if (limit === undefined) return { allowed: true };

    const count = toolInvocationCounts[toolName] || 0;
    if (count >= limit) {
      return {
        allowed: false,
        message: `Tool "${toolName}" has reached its maximum of ${limit} invocations per session.`,
      };
    }
    return { allowed: true };
  }

  /** Record a tool invocation */
  function recordToolInvocation(toolName: string): void {
    toolInvocationCounts[toolName] = (toolInvocationCounts[toolName] || 0) + 1;
  }

  /** Process Claude response, handling tool calls in a loop */
  async function processWithToolLoop(anthropic: Anthropic, ws: WebSocket, clientRef: ClientConfig) {
    for (let iteration = 0; iteration < AI.maxToolIterations; iteration++) {
      const response = await withRetry(() =>
        anthropic.messages.create({
          model: AI.model,
          max_tokens: AI.voiceMaxTokens,
          // Cache the (static) system prompt so later turns read it from cache
          // (~10% of the input price) instead of re-billing ~2k tokens each call.
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          tools: voiceTools,
          messages: messageHistory,
        }),
      );

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) {
        // Pure text response — send to caller and exit loop
        const text = extractText(response.content) || FALLBACK_REPLY;

        messageHistory.push({ role: 'assistant', content: sanitizeContentForHistory(response.content) });
        ws.send(JSON.stringify({ type: 'text', token: text, last: true }));
        return;
      }

      // Execute ALL tool calls
      messageHistory.push({ role: 'assistant', content: sanitizeContentForHistory(response.content) });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolBlock of toolUseBlocks) {
        let result: Record<string, unknown>;

        // Check per-session rate limit
        const rateCheck = checkToolRateLimit(toolBlock.name);
        if (!rateCheck.allowed) {
          result = { error: rateCheck.message };
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result),
          });
          continue;
        }

        try {
          result = await executeTool(
            toolBlock.name,
            toolBlock.input as Record<string, string>,
            clientRef,
            leadId,
          );

          // Record invocation after successful execution
          recordToolInvocation(toolBlock.name);

          // Track state for call record
          if (toolBlock.name === 'book_appointment' && (result as { success?: boolean }).success) {
            appointmentBooked = true;
          }
          if (toolBlock.name === 'escalate_emergency' && (result as { success?: boolean }).success) {
            emergencyEscalated = true;
          }
        } catch (err) {
          console.error(`Tool ${toolBlock.name} failed:`, err instanceof Error ? err.message : 'Unknown error');
          // Do NOT leak raw error details to the LLM — they may contain DB/connection info
          // that Claude could relay to the caller
          result = { error: 'The operation could not be completed due to a temporary system issue. Please let the caller know and try an alternative approach.' };
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: JSON.stringify(result),
        });
      }

      messageHistory.push({ role: 'user', content: toolResults });
      // Loop continues — next iteration will get Claude's response to the tool results
    }

    // If we hit MAX_TOOL_ITERATIONS, send a fallback
    ws.send(
      JSON.stringify({
        type: 'text',
        token: "Let me get you connected with someone who can help directly. One moment please.",
        last: true,
      }),
    );
  }

  ws.on('close', async () => {
    // Clean up timers
    if (idleTimer) clearTimeout(idleTimer);
    clearTimeout(maxTimer);

    if (!client || !callSid) return;

    // Wait for any in-flight message processing to complete
    await processing;

    // Save call record FIRST (before summary) — ensures we never lose the record
    try {
      await db.insert(calls).values({
        clientId: client.id,
        callerPhone,
        twilioCallSid: callSid,
        status: 'answered_ai',
        leadId,
        appointmentBooked,
        emergencyEscalated,
      });
    } catch (err) {
      console.error('Failed to save call record:', err instanceof Error ? err.message : 'Unknown error');
    }

    // Then attempt summary + notification (best-effort, won't lose call record if this fails)
    try {
      if (messageHistory.length > 2) {
        const anthropic = getOrCreateAnthropicClient();
        if (anthropic) {
          const historyForSummary = messageHistory.slice(0, AI.maxSummaryHistory);
          const res = await anthropic.messages.create({
            model: AI.model,
            max_tokens: AI.summaryMaxTokens,
            system:
              'Summarize this phone call in 2-3 sentences. Include: what the caller needed, any appointment booked, and any follow-up required.',
            messages: [
              { role: 'user', content: JSON.stringify(historyForSummary) },
            ],
          });
          const textBlock = res.content.find(
            (b): b is Anthropic.TextBlock => b.type === 'text',
          );
          const summary = textBlock?.text || null;

          if (summary) {
            // Patch summary into the call record
            const { eq } = await import('drizzle-orm');
            await db
              .update(calls)
              .set({ aiSummary: summary })
              .where(eq(calls.twilioCallSid, callSid));

            await callSummaryNotification(
              client.ownerPhone,
              client.twilioPhone,
              summary,
              callerPhone,
            );
          }
        }
      }
    } catch (err) {
      console.error('Failed to generate call summary:', err instanceof Error ? err.message : 'Unknown error');
    }
  });
}
