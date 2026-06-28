/**
 * Pest Control Scenario Test Suite
 *
 * Maps scenarios from pest_control_ai_voice_assistant_test_suite.md
 * to tests verifying the system prompt handles pest control correctly.
 *
 * Tests validate the PROMPT RULES -- not the AI's exact words. We verify:
 * 1. The system prompt contains rules that guide the AI correctly
 * 2. Emergency scenarios match pest-specific definitions
 * 3. Pricing questions are deflected (never quote numbers)
 * 4. AI does NOT identify pest species or recommend DIY treatments
 * 5. Routine pest issues do NOT trigger emergency escalation
 */
import { describe, it, expect, vi } from 'vitest';
import { buildSystemPrompt } from '../src/ws/prompts.js';

// Mock DB for simulator
vi.mock('@serviceline/db', () => {
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'test-uuid' }]),
  };
  return {
    db: {
      insert: vi.fn(() => ({ ...insertChain })),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }),
    },
    clients: 'clients', leads: 'leads', calls: 'calls',
    appointments: 'appointments', escalations: 'escalations',
    onCallContacts: { id: 'id', name: 'name', phone: 'phone', role: 'role', isActive: 'is_active' },
    onCallSchedule: { contactId: 'cid', clientId: 'clid', dayOfWeek: 'dow' },
    eq: vi.fn(), and: vi.fn(), notInArray: vi.fn(),
  };
});
vi.mock('../src/services/notifications.js', () => ({
  smsToOwner: vi.fn().mockResolvedValue(undefined),
  smsToCustomer: vi.fn().mockResolvedValue(undefined),
  callSummaryNotification: vi.fn().mockResolvedValue(undefined),
}));

const { createSession, sendMessage } = await import('../src/demo/simulator.js');

const CONFIG = {
  businessName: "BugShield Pest Control",
  ownerName: 'Dave Torres',
  ownerPhone: '+15552222222',
  services: ['pest_control', 'termite', 'rodent', 'mosquito', 'wildlife'],
  serviceArea: 'Dallas, TX and surrounding areas',
  callerPhone: '+15559876543',
  plan: 'pro' as const,
  industry: 'pest',
  useRealAI: false,
};

const PROMPT = buildSystemPrompt({
  name: CONFIG.businessName,
  services: CONFIG.services,
  serviceArea: CONFIG.serviceArea,
  industry: 'pest',
  month: 3, // pin to spring so seasonal assertions are deterministic year-round
});

// ==========================================================================
// CATEGORY 1: Emergency Triage (P1 scenarios)
// Pest emergencies must appear in the prompt's emergency definitions
// ==========================================================================
describe('Cat 1: Emergency Triage', () => {
  it('prompt contains pest-specific emergency definitions', () => {
    expect(PROMPT).toContain('Wasp or bee nest blocking a door or entry point');
    expect(PROMPT).toContain('Snake found inside the home');
    expect(PROMPT).toContain('Large wildlife animal trapped inside (raccoon, opossum)');
    expect(PROMPT).toContain('Severe allergic reaction risk');
    expect(PROMPT).toContain('Active termite swarm inside the home');
  });

  it('prompt instructs immediate escalation for emergencies', () => {
    expect(PROMPT).toContain('escalate_emergency');
    expect(PROMPT).toContain('IMMEDIATELY');
  });

  it('prompt says do NOT ask extra questions during emergencies', () => {
    expect(PROMPT).toContain('Do NOT ask extra questions during emergencies');
  });

  it('wasp nest at entrance is listed as emergency', () => {
    expect(PROMPT).toContain('Wasp or bee nest blocking a door or entry point');
  });

  it('snake inside home is listed as emergency', () => {
    expect(PROMPT).toContain('Snake found inside the home');
  });

  it('severe allergic reaction risk is listed as emergency', () => {
    expect(PROMPT).toContain('Severe allergic reaction risk');
    expect(PROMPT).toContain('known bee allergy');
  });

  it('large wildlife intrusion is listed as emergency', () => {
    expect(PROMPT).toContain('Large wildlife animal trapped inside');
  });

  it('active termite swarm inside home is listed as emergency', () => {
    expect(PROMPT).toContain('Active termite swarm inside the home');
  });

  it('non-emergency pest issues are handled as normal service calls', () => {
    // The prompt says anything NOT on the emergency list is a normal service call
    expect(PROMPT).toContain('Anything NOT on that list is a normal service call');
    expect(PROMPT).toContain("book an appointment, don't escalate");
  });
});

// ==========================================================================
// CATEGORY 2: Routine calls — should NOT trigger emergency
// Ants, spiders, mosquitoes in yard, etc. are routine
// ==========================================================================
describe('Cat 2: Routine pest calls — no escalation', () => {
  it('ants in kitchen → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "There are ants all over my kitchen counter");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('seeing a spider → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I keep seeing spiders in my bathroom");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('mosquitoes in yard → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "We have a lot of mosquitoes in our yard this summer");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('saw one roach yesterday → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I saw one roach yesterday in my kitchen");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('think I might have termites → inspection, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I think I might have termites — I noticed some damage on my porch");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('droppings in pantry → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I noticed droppings in my pantry, not sure what it is");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('bugs near windows → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "There are tiny bugs near my windows");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('fleas on pets → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I think my dog has fleas and now they're in the carpet");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('worried about bed bugs → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I'm worried I might have bed bugs — I have bites on my arms");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('hearing scratching in walls → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I hear scratching sounds in my walls at night");
    expect(s.emergencyEscalated).toBe(false);
  });
});

// ==========================================================================
// CATEGORY 3: Pest Identification — AI must NOT identify species
// ==========================================================================
describe('Cat 3: Pest Identification — AI must not ID species', () => {
  it('prompt says never identify pest species over the phone', () => {
    expect(PROMPT).toContain('Never identify pest species over the phone');
    expect(PROMPT).toContain('our inspector will ID them on-site');
  });

  it('prompt collects what they are seeing, not what species it is', () => {
    expect(PROMPT).toContain('what they\'re seeing (type of pest, where, how many, how long)');
  });

  it('for termites: asks about previous inspection, home age, mud tubes', () => {
    expect(PROMPT).toContain('ask if they\'ve had a previous inspection');
    expect(PROMPT).toContain('when the home was built');
    expect(PROMPT).toContain('mud tubes or wing piles');
  });

  it('for rodents: asks about sounds, location, time of day', () => {
    expect(PROMPT).toContain('hearing sounds (scratching in walls)');
    expect(PROMPT).toContain('time of day');
  });

  it('asks indoor or outdoor, which rooms, droppings, pets/children', () => {
    expect(PROMPT).toContain('indoor or outdoor');
    expect(PROMPT).toContain('Which rooms');
    expect(PROMPT).toContain('droppings');
    expect(PROMPT).toContain('pets or small children');
  });
});

// ==========================================================================
// CATEGORY 4: Pricing Deflection
// AI must NEVER quote specific prices
// ==========================================================================
describe('Cat 4: Pricing Deflection', () => {
  it('prompt never contains dollar amounts', () => {
    expect(PROMPT).not.toMatch(/\$\d+/);
  });

  it('prompt deflects pricing to free inspection', () => {
    expect(PROMPT).toContain('Never quote exact prices');
    expect(PROMPT).toContain("free inspection first");
  });

  it('prompt includes pest-specific pricing disclaimer', () => {
    expect(PROMPT).toContain("We'll do a free inspection first, then give you a treatment plan with clear pricing before we start.");
  });

  it('pricing question does not trigger emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "How much does pest control cost?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('termite treatment pricing → deflect, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "What's the price for termite treatment?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('monthly plan pricing → deflect, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Is there a monthly plan? How much is it?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('rodent removal cost → deflect, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "How much for rodent removal?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('AI should not guess about extra charges for large infestations', () => {
    expect(PROMPT).toContain('Never guess');
  });

  it('AI should not promise warranties or guarantees on pricing', () => {
    expect(PROMPT).toContain('Never promise');
    expect(PROMPT).toContain('warranties');
    expect(PROMPT).toContain('guarantees');
  });
});

// ==========================================================================
// CATEGORY 5: Treatment Safety — AI must NOT give chemical/treatment advice
// ==========================================================================
describe('Cat 5: Treatment Safety — no DIY or chemical advice', () => {
  it('prompt says never diagnose', () => {
    expect(PROMPT).toContain('Never diagnose');
    expect(PROMPT).toContain('tech will take a look');
  });

  it('prompt mentions treatment is safe for pets and children once dry', () => {
    expect(PROMPT).toContain('treatment is safe for pets and children once dry');
  });

  it('FAQ: "Is the treatment safe for my pets?" has a safe answer', () => {
    expect(PROMPT).toContain('once the treatment dries, it\'s safe for pets and kids');
    expect(PROMPT).toContain('specific re-entry times');
  });

  it('FAQ: "Do I need to leave the house?" has a safe answer', () => {
    expect(PROMPT).toContain('For most treatments you can stay');
    expect(PROMPT).toContain('areas need to be vacated briefly');
  });

  it('spray my house request → should not give chemical advice, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I need someone to spray my house for bugs");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('DIY treatment question → prompt says never diagnose, defer to tech', () => {
    // AI should not recommend specific chemicals or DIY methods
    expect(PROMPT).toContain('Never diagnose');
    expect(PROMPT).toContain("I'm not sure about that");
  });
});

// ==========================================================================
// CATEGORY 6: Seasonal Context
// Prompt should include seasonal hints for the current month
// ==========================================================================
describe('Cat 6: Seasonal Context', () => {
  it('pest template has seasonal hints for spring (ant/termite season)', () => {
    // March is month 3 — spring hints should be in the prompt
    // The current date context says March 2026
    expect(PROMPT).toContain('SEASONAL CONTEXT');
    expect(PROMPT).toContain('ant and termite season');
  });

  it('seasonal hints mention preventive treatments in spring', () => {
    expect(PROMPT).toContain('preventive treatments');
  });

  it('seasonal context says use naturally, do not force', () => {
    expect(PROMPT).toContain("use naturally, don't force it");
  });
});

// ==========================================================================
// CATEGORY 7: FAQ — Pest-specific common questions
// ==========================================================================
describe('Cat 7: Pest-specific FAQ in prompt', () => {
  it('FAQ: pet safety answer is in the prompt', () => {
    expect(PROMPT).toContain('Is the treatment safe for my pets?');
    expect(PROMPT).toContain('safe for pets and kids');
  });

  it('FAQ: treatment duration answer is in the prompt', () => {
    expect(PROMPT).toContain('How long does treatment take?');
    expect(PROMPT).toContain('30-60 minutes');
  });

  it('FAQ: warranty answer is in the prompt', () => {
    expect(PROMPT).toContain('Do you offer a warranty?');
    expect(PROMPT).toContain('most of our treatments include a warranty');
  });

  it('FAQ: leaving the house answer is in the prompt', () => {
    expect(PROMPT).toContain('Do I need to leave the house?');
    expect(PROMPT).toContain('For most treatments you can stay');
  });
});

// ==========================================================================
// CATEGORY 8: Services and Capabilities
// ==========================================================================
describe('Cat 8: Services & Capabilities', () => {
  it('prompt includes pest services list', () => {
    expect(PROMPT).toContain('pest_control');
    expect(PROMPT).toContain('termite');
    expect(PROMPT).toContain('rodent');
    expect(PROMPT).toContain('mosquito');
    expect(PROMPT).toContain('wildlife');
  });

  it('prompt includes pest issue categories for booking', () => {
    expect(PROMPT).toContain('general_pest');
    expect(PROMPT).toContain('termite');
    expect(PROMPT).toContain('rodent');
    expect(PROMPT).toContain('mosquito');
    expect(PROMPT).toContain('bed_bug');
    expect(PROMPT).toContain('wildlife');
    expect(PROMPT).toContain('ant');
    expect(PROMPT).toContain('roach');
    expect(PROMPT).toContain('wasp_bee');
  });

  it('prompt includes service area', () => {
    expect(PROMPT).toContain('Dallas, TX');
  });

  it('services questions should never trigger emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Do you handle rodent control?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('bed bug treatment question → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I need help with bed bugs in my apartment");
    expect(s.emergencyEscalated).toBe(false);
  });
});

// ==========================================================================
// CATEGORY 9: Scheduling — routine booking flow
// ==========================================================================
describe('Cat 9: Scheduling', () => {
  it('prompt has booking tools for scheduling', () => {
    expect(PROMPT).toContain('check_availability');
    expect(PROMPT).toContain('book_appointment');
    expect(PROMPT).toContain('offer to book');
  });

  it('can you come today → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Can you come out today to look at the ants?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('weekend availability → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Do you have weekend availability for an inspection?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('reschedule → AI should offer human callback', () => {
    expect(PROMPT).toContain('person, a human');
  });

  it('how long does treatment take → FAQ has answer', () => {
    expect(PROMPT).toContain('30-60 minutes');
  });
});

// ==========================================================================
// CATEGORY 10: Edge Cases and Credentials
// ==========================================================================
describe('Cat 10: Edge Cases & Credentials', () => {
  it('licensed and insured question → should not make claims', () => {
    expect(PROMPT).toContain("I'm not sure about that");
    expect(PROMPT).toContain('technician can answer');
  });

  it('how long in business → should not guess', () => {
    expect(PROMPT).toContain('Never guess');
  });

  it('previous treatment did not work → routine rebooking', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "The last treatment didn't work and the ants are back");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('commercial property question → should not guess', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I manage a commercial building and need pest control for all units");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('preventive pest control → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I want preventative pest control for my home");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('seal entry points request → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Can you seal entry points where mice are getting in?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('inspect my attic → routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I think something is living in my attic, can you inspect it?");
    expect(s.emergencyEscalated).toBe(false);
  });
});

// ==========================================================================
// CROSS-CATEGORY: Prompt completeness
// ==========================================================================
describe('Cross-category: prompt completeness for pest control', () => {
  it('has pricing deflection to free inspection', () => {
    expect(PROMPT).toContain('Never quote exact prices');
    expect(PROMPT).toContain('free inspection first');
  });

  it('has diagnosis prohibition', () => {
    expect(PROMPT).toContain('Never diagnose');
    expect(PROMPT).toContain('tech will take a look');
  });

  it('has "I don\'t know" fallback', () => {
    expect(PROMPT).toContain("I'm not sure about that");
    expect(PROMPT).toContain('technician can answer');
  });

  it('has all 5 pest emergency definitions', () => {
    expect(PROMPT).toContain('Wasp or bee nest blocking a door or entry point');
    expect(PROMPT).toContain('Snake found inside the home');
    expect(PROMPT).toContain('Large wildlife animal trapped inside (raccoon, opossum)');
    expect(PROMPT).toContain('Severe allergic reaction risk');
    expect(PROMPT).toContain('Active termite swarm inside the home');
  });

  it('has booking tools', () => {
    expect(PROMPT).toContain('check_availability');
    expect(PROMPT).toContain('book_appointment');
    expect(PROMPT).toContain('offer to book');
  });

  it('has human escalation path', () => {
    expect(PROMPT).toContain('person, a human');
    expect(PROMPT).toContain('owner call you right back');
  });

  it('has industry-specific collection rules', () => {
    expect(PROMPT).toContain('INDUSTRY-SPECIFIC RULES');
    expect(PROMPT).toContain('caller name, address, what they\'re seeing');
  });

  it('prompt word count is under 1100', () => {
    const wordCount = PROMPT.split(/\s+/).length;
    expect(wordCount).toBeLessThan(1100);
  });
});
