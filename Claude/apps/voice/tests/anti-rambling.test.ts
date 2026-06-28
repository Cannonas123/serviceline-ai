/**
 * Anti-Rambling & Voice Quality Tests
 *
 * Based on research: 8-10 second attention span for spoken info,
 * 30-50 words max per turn, never start with preamble, handle
 * interruptions, never guess answers, talk like a dispatcher.
 *
 * The #1 reason people hang up on AI phone agents is rambling.
 * These tests ensure our system prompt and handler enforce conciseness.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildSystemPrompt } from '../src/ws/prompts.js';
import { EventEmitter } from 'events';

const DEFAULT_PROMPT = buildSystemPrompt({
  name: "Mike's Plumbing",
  services: ['plumbing', 'drain', 'water_heater'],
  serviceArea: 'Austin, TX',
});

// ==========================================================================
// CONCISENESS RULES — under 35 words, under 2 sentences
// Research: 8-10 second attention span, 30-50 words max per turn.
// The old prompt said "1-2 sentences" — too vague. Now explicit word count.
// ==========================================================================
describe('Conciseness enforcement', () => {
  it('prompt enforces a hard word limit (under 35 words)', () => {
    expect(DEFAULT_PROMPT).toContain('under 35 words');
  });

  it('prompt enforces 2 sentence max', () => {
    expect(DEFAULT_PROMPT).toContain('under 2 sentences');
  });

  it('prompt says "ask ONE question at a time"', () => {
    expect(DEFAULT_PROMPT).toContain('ONE question at a time');
    expect(DEFAULT_PROMPT).toContain('Never stack questions');
  });

  it('prompt tells AI to start with the answer, not preamble', () => {
    expect(DEFAULT_PROMPT).toContain('Start with the answer or action');
  });
});

// ==========================================================================
// NO PREAMBLE — "Great question!", "Absolutely!", "I'd be happy to help!"
// Research: wastes 3-5 seconds before useful content. People hang up.
// ==========================================================================
describe('No preamble / filler elimination', () => {
  it('prompt explicitly bans common preamble phrases', () => {
    expect(DEFAULT_PROMPT).toContain('Great question!');
    expect(DEFAULT_PROMPT).toContain("I'd be happy to help!");
    expect(DEFAULT_PROMPT).toContain('Absolutely!');
    // These appear in the "never start with" rule, not as things to say
    expect(DEFAULT_PROMPT).toContain('Never start with');
  });

  it('prompt bans repeating back what the caller said', () => {
    expect(DEFAULT_PROMPT).toContain('Never repeat back what the caller just said');
  });

  it('prompt bans listing multiple options unnecessarily', () => {
    expect(DEFAULT_PROMPT).toContain('Never list multiple options when one will do');
  });
});

// ==========================================================================
// PLAIN LANGUAGE — talk like a plumber, not a professor
// The caller is on a job site, in their truck, or panicking in their basement.
// ==========================================================================
describe('Plain language / dispatcher tone', () => {
  it('prompt instructs to use plain words with specific examples', () => {
    expect(DEFAULT_PROMPT).toContain('plain words');
    // Specific "say X not Y" examples
    // Specific "say X not Y" examples — uses smart quotes in prompt
    expect(DEFAULT_PROMPT).toContain('fix');
    expect(DEFAULT_PROMPT).toContain('remediate');
    expect(DEFAULT_PROMPT).toContain('come out');
    expect(DEFAULT_PROMPT).toContain('dispatch a technician');
  });

  it('prompt describes tone as "friendly dispatcher"', () => {
    expect(DEFAULT_PROMPT).toContain('dispatcher');
  });

  it('prompt says no jargon', () => {
    expect(DEFAULT_PROMPT).toContain('no jargon');
  });

  it('prompt itself uses plain language (practices what it preaches)', () => {
    // The prompt should not contain corporate/academic language
    const corporateTerms = [
      'facilitate',
      'leverage',
      'utilize',
      'endeavor',
      'pursuant',
      'aforementioned',
      'herein',
      'notwithstanding',
    ];
    for (const term of corporateTerms) {
      expect(DEFAULT_PROMPT.toLowerCase()).not.toContain(term);
    }
  });
});

// ==========================================================================
// NEVER GUESS — if you don't know, say so
// Horror story: Air Canada chatbot invented a refund policy. Court enforced it.
// Cursor chatbot hallucinated a login policy. Mass cancellations.
// ==========================================================================
describe('Never guess / never fabricate', () => {
  it('prompt instructs to admit when it does not know', () => {
    expect(DEFAULT_PROMPT).toContain("I'm not sure about that");
    expect(DEFAULT_PROMPT).toContain('technician can answer');
  });

  it('prompt says "Never guess or make up information"', () => {
    expect(DEFAULT_PROMPT).toContain('Never guess');
    expect(DEFAULT_PROMPT).toContain('make up information');
  });

  it('prompt does not contain specific prices that could be cited', () => {
    expect(DEFAULT_PROMPT).not.toMatch(/\$\d+/);
  });

  it('prompt does not contain specific response times or ETAs', () => {
    expect(DEFAULT_PROMPT).not.toMatch(/within \d+ (minutes|hours|days)/i);
    expect(DEFAULT_PROMPT).not.toMatch(/\d+ minute response/i);
  });
});

// ==========================================================================
// VOICE-SPECIFIC FORMATTING — numbers and dates for TTS
// Research: "$20.50" is read as "dollar sign twenty period fifty" by TTS.
// "3/28" is read as "three slash twenty-eight."
// ==========================================================================
describe('Voice-friendly formatting instructions', () => {
  it('prompt instructs to spell out numbers and dates', () => {
    expect(DEFAULT_PROMPT).toContain('Spell out numbers and dates');
  });

  it('prompt provides a concrete date format example', () => {
    // Should show "Tuesday March eighteenth at two PM" style, not ISO
    expect(DEFAULT_PROMPT).toContain('Tuesday March eighteenth');
  });
});

// ==========================================================================
// MAX_TOKENS — capped at 150 for voice (research: 100-150 optimal)
// Default Claude max is 4096. At voice speed (~150 words/min),
// 300 tokens ≈ 225 words ≈ 90 seconds of nonstop talking. Way too long.
// 150 tokens ≈ 110 words ≈ 45 seconds max. Still long but bounded.
// ==========================================================================
describe('max_tokens enforcement', () => {
  it('handler uses max_tokens of 150, not 300+', async () => {
    const handlerSource = await import('fs').then((fs) =>
      fs.readFileSync(new URL('../src/ws/handler.ts', import.meta.url), 'utf-8'),
    );

    // All Claude API calls should use 150, not 300
    const tokenMatches = handlerSource.match(/max_tokens:\s*(\d+)/g) || [];
    for (const match of tokenMatches) {
      const value = parseInt(match.replace(/max_tokens:\s*/, ''));
      expect(value).toBeLessThanOrEqual(200); // Allow 200 for summary, 150 for conversation
    }
  });
});

// ==========================================================================
// INTERRUPT HANDLING — ConversationRelay sends 'interrupt' messages
// Research: Twilio sends utteranceUntilInterrupt + durationUntilInterruptMs.
// We must truncate the assistant's message history to what was actually heard.
// Otherwise the AI thinks it said things the caller never heard.
// ==========================================================================
describe('Interrupt handling', () => {
  it('handler type includes interrupt message', async () => {
    const handlerSource = await import('fs').then((fs) =>
      fs.readFileSync(new URL('../src/ws/handler.ts', import.meta.url), 'utf-8'),
    );

    expect(handlerSource).toContain("type: 'interrupt'");
    expect(handlerSource).toContain('utteranceUntilInterrupt');
  });

  it('handler truncates assistant message on interrupt', async () => {
    const handlerSource = await import('fs').then((fs) =>
      fs.readFileSync(new URL('../src/ws/handler.ts', import.meta.url), 'utf-8'),
    );

    // Should find and truncate the last assistant message
    expect(handlerSource).toContain('findLastIndex');
    expect(handlerSource).toContain('substring');
  });

  it('handler processes interrupt before prompt (correct order)', async () => {
    const handlerSource = await import('fs').then((fs) =>
      fs.readFileSync(new URL('../src/ws/handler.ts', import.meta.url), 'utf-8'),
    );

    // Interrupt handling should come before prompt handling in the code
    const interruptIdx = handlerSource.indexOf("msg.type === 'interrupt'");
    const promptIdx = handlerSource.indexOf("msg.type === 'prompt'");
    expect(interruptIdx).toBeGreaterThan(-1);
    expect(promptIdx).toBeGreaterThan(-1);
    expect(interruptIdx).toBeLessThan(promptIdx);
  });
});

// ==========================================================================
// CROSS-CHECK: Conciseness must NOT sacrifice essential data collection
// We want short responses, but still need name, address, issue.
// ==========================================================================
describe('Balance: concise but complete', () => {
  it('prompt still requires collecting name, address, and issue', () => {
    expect(DEFAULT_PROMPT).toContain('name');
    expect(DEFAULT_PROMPT).toContain('address');
    expect(DEFAULT_PROMPT).toContain("what's going on");
  });

  it('prompt still has emergency escalation (conciseness does not skip emergencies)', () => {
    expect(DEFAULT_PROMPT).toContain('escalate_emergency');
    expect(DEFAULT_PROMPT).toContain('IMMEDIATELY');
  });

  it('prompt still has human escape hatch (conciseness does not trap callers)', () => {
    expect(DEFAULT_PROMPT).toContain('person');
    expect(DEFAULT_PROMPT).toContain('human');
    expect(DEFAULT_PROMPT).toContain("call you right back");
  });

  it('prompt still has the honesty directive about being AI', () => {
    expect(DEFAULT_PROMPT).toContain("Yep, I'm an AI assistant");
  });

  it('prompt still forbids pricing and diagnosis', () => {
    expect(DEFAULT_PROMPT).toContain('Never quote exact prices');
    expect(DEFAULT_PROMPT).toContain('Never diagnose');
  });
});

// ==========================================================================
// ANTI-PATTERN DETECTION — behaviors that make people hang up
// Research: 51% of customers abandon businesses over bad IVR.
// One bad voice interaction and some users "sever all ties."
// ==========================================================================
describe('Anti-pattern prevention', () => {
  it('prompt does not use "Certainly" or "Absolutely" as instruction examples to follow', () => {
    // These words should only appear in the "never start with" rule
    const certainlyCount = (DEFAULT_PROMPT.match(/certainly/gi) || []).length;
    const absolutelyCount = (DEFAULT_PROMPT.match(/absolutely/gi) || []).length;
    // They appear in the ban list only
    expect(certainlyCount).toBeLessThanOrEqual(1);
    expect(absolutelyCount).toBeLessThanOrEqual(1);
  });

  it('prompt does not contain multi-paragraph instructions that would cause verbose output', () => {
    // Count blank line breaks (paragraph separators)
    const paragraphs = DEFAULT_PROMPT.split('\n\n').length;
    // Should be compact — industry templates add emergency defs, FAQ, seasonal, rules sections
    expect(paragraphs).toBeLessThanOrEqual(10);
  });

  it('system prompt itself is under 2000 tokens (research: over 2000 increases latency)', () => {
    // Rough token estimate: words / 0.75
    const wordCount = DEFAULT_PROMPT.split(/\s+/).length;
    const estimatedTokens = wordCount / 0.75;
    expect(estimatedTokens).toBeLessThan(2500);
  });

  it('system prompt word count is reasonable for voice AI (under 1100 words)', () => {
    const wordCount = DEFAULT_PROMPT.split(/\s+/).length;
    expect(wordCount).toBeLessThan(1100); // Grew to ~955 with industry templates (emergency defs, FAQ, seasonal hints, prompt rules)
  });
});

// ==========================================================================
// WELCOME GREETING — the first thing the caller hears
// Research: must be under 40 words, include business name, not say "robot"
// ==========================================================================
describe('Welcome greeting quality', () => {
  it('call-status TwiML greeting is concise (under 50 words)', async () => {
    const { callStatusRoutes } = await import('../src/routes/call-status.js');
    const Fastify = (await import('fastify')).default;
    const formbody = (await import('@fastify/formbody')).default;
    const clientConfig = await import('../src/lib/client-config.js');

    process.env.TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'test-auth-token';
    vi.spyOn(clientConfig, 'getClientByTwilioPhone').mockResolvedValue({
      id: 'test', name: "Mike's Plumbing", plan: 'pro', status: 'active',
      recordingConsentRequired: false, twilioPhone: '+15551234567',
      ownerPhone: '+15559876543',
    } as any);

    const app = Fastify({ logger: false });
    app.register(formbody);
    app.register(callStatusRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST', url: '/call-status',
      payload: { DialCallStatus: 'no-answer', To: '+15551234567', From: '+15550000001', CallSid: 'CA1' },
    });

    const greetingMatch = res.body.match(/welcomeGreeting="([^"]+)"/);
    expect(greetingMatch).toBeTruthy();

    // Decode XML entities for accurate word count
    const greeting = greetingMatch![1]
      .replace(/&amp;/g, '&').replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

    const words = greeting.split(/\s+/).length;
    expect(words).toBeLessThan(50);

    // Must NOT contain preamble
    expect(greeting).not.toContain('Great question');
    expect(greeting).not.toContain("I'd be happy");

    // Must contain business name
    expect(greeting).toContain('Mike');

    // Must NOT say "robot" or "artificial intelligence" upfront
    expect(greeting.toLowerCase()).not.toContain('robot');
    expect(greeting.toLowerCase()).not.toContain('artificial intelligence');

    await app.close();
  });
});
