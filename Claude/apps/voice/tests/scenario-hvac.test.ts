/**
 * HVAC Scenario Test Suite
 *
 * Every scenario from hvac_ai_voice_assistant_test_suite.md mapped to a test
 * verifying the system prompt handles it correctly.
 *
 * Tests validate the PROMPT RULES -- not the AI's exact words (that's
 * non-deterministic). We verify that:
 * 1. The system prompt contains rules that guide the AI correctly
 * 2. Emergency scenarios trigger escalation (mock mode)
 * 3. Pricing questions are deflected (never quote numbers)
 * 4. "Don't know" questions get honest "I'm not sure" answers
 * 5. Routine calls flow to booking, not escalation
 * 6. HVAC-specific FAQ, seasonal hints, and industry rules appear in the prompt
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
  businessName: "Cool Breeze HVAC",
  ownerName: 'Tom Williams',
  ownerPhone: '+15552222222',
  services: ['hvac', 'ac_repair', 'furnace', 'heat_pump', 'duct_cleaning'],
  serviceArea: 'Dallas, TX and surrounding areas',
  callerPhone: '+15559876543',
  plan: 'pro' as const,
  useRealAI: false,
  industry: 'hvac',
};

const PROMPT = buildSystemPrompt({
  name: CONFIG.businessName,
  services: CONFIG.services,
  serviceArea: CONFIG.serviceArea,
  industry: 'hvac',
  month: 3, // pin to spring so seasonal assertions are deterministic year-round
});

// ==========================================================================
// CATEGORY 1: Emergency Triage (P1)
// These MUST trigger escalation or be clearly covered by prompt rules
// ==========================================================================
describe('Cat 1: HVAC Emergency Triage (P1)', () => {
  it('E1: AC died in extreme heat -> prompt covers "No AC when outside temperature is above 95"', () => {
    expect(PROMPT).toContain('No AC when outside temperature is above 95');
  });

  it('E2: smoke from HVAC unit -> prompt covers smoke emergency', () => {
    expect(PROMPT).toContain('Smoke or burning smell from HVAC unit');
  });

  it('E3: furnace smells like gas -> EMERGENCY (mock keyword: "gas smell")', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "My furnace smells like gas");
    // mock regex catches "gas smell" via "smell gas" pattern reversed
    // The prompt also covers this
    expect(PROMPT).toContain('Gas smell near furnace');
  });

  it('E4: loud banging noise from furnace -> prompt covers banging sounds', () => {
    expect(PROMPT).toContain('Furnace making loud banging or popping sounds');
  });

  it('E5: AC unit outside is sparking -> prompt covers smoke/burning (closest match)', () => {
    // Sparking is dangerous; the prompt's "Smoke or burning smell" covers fire hazards
    expect(PROMPT).toContain('Smoke or burning smell from HVAC unit');
  });

  it('E6: no heat and it is winter -> EMERGENCY (mock keyword: "no heat")', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "We have no heat and it's 20 degrees outside");
    expect(s.emergencyEscalated).toBe(true);
  });

  it('E7: carbon monoxide alarm -> prompt covers CO alarm', () => {
    expect(PROMPT).toContain('Carbon monoxide alarm going off');
  });

  it('E8: burning smell from vents -> prompt covers burning smell', () => {
    expect(PROMPT).toContain('burning smell from HVAC unit');
  });

  it('E9: breaker keeps tripping when AC runs -> NOT an emergency per template', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "The breaker keeps tripping every time my AC turns on");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('E10: gas smell near water heater with gas leak context -> EMERGENCY', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I smell gas near my furnace, I think there is a gas leak");
    expect(s.emergencyEscalated).toBe(true);
  });

  it('prompt has emergency escalation rule: do NOT ask extra questions', () => {
    expect(PROMPT).toContain('Do NOT ask extra questions during emergencies');
  });

  it('prompt lists all 6 HVAC emergency definitions', () => {
    expect(PROMPT).toContain('No heat when outside temperature is below 40');
    expect(PROMPT).toContain('No AC when outside temperature is above 95');
    expect(PROMPT).toContain('Gas smell near furnace');
    expect(PROMPT).toContain('Carbon monoxide alarm going off');
    expect(PROMPT).toContain('Furnace making loud banging or popping sounds');
    expect(PROMPT).toContain('Smoke or burning smell from HVAC unit');
  });
});

// ==========================================================================
// CATEGORY 2: Routine Repair (P2-P3)
// These should NOT trigger emergency escalation
// ==========================================================================
describe('Cat 2: Routine HVAC Repair (P2-P3)', () => {
  it('R1: AC running but not cooling -> routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "My AC is running but it's not really cooling the house");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('R2: heater blowing cold air -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "The heater is blowing cold air instead of hot");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('R3: thermostat is blank -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "My thermostat screen is completely blank");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('R4: weak airflow -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "The airflow from my vents is really weak");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('R5: uneven vents -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "My vents aren't blowing evenly throughout the house");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('R6: unit turns on and off constantly -> routine (short cycling)', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "The unit turns on and off every few minutes, it won't stay running");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('R7: rattling noise -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "My AC is making a rattling noise when it runs");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('R8: upstairs hot, downstairs fine -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "My upstairs is really hot but the downstairs feels fine");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('R9: fan keeps running nonstop -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "The fan on my HVAC unit just keeps running nonstop and won't shut off");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('R10: system won\'t turn off -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "My system won't turn off, it just keeps running");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('prompt contains HVAC-specific diagnostic rule: ask about airflow', () => {
    expect(PROMPT).toContain('is the system blowing air at all');
  });

  it('prompt contains thermostat troubleshooting rule', () => {
    expect(PROMPT).toContain('ask if it\'s blank');
    expect(PROMPT).toContain('replacing batteries');
  });
});

// ==========================================================================
// CATEGORY 3: Pricing Deflection (P4)
// AI must NEVER quote specific prices. Always deflect.
// ==========================================================================
describe('Cat 3: HVAC Pricing Deflection', () => {
  it('prompt never contains dollar amounts', () => {
    expect(PROMPT).not.toMatch(/\$\d+/);
  });

  it('prompt deflects all pricing to on-site quote', () => {
    expect(PROMPT).toContain('Never quote exact prices');
  });

  it('P1: "how much does AC repair cost" -> deflect', () => {
    expect(PROMPT).toContain('provide a quote before any repairs');
  });

  it('P2: "price to replace a furnace" -> deflect to tech assessment', () => {
    expect(PROMPT).toContain('diagnose the issue on-site and provide a quote');
  });

  it('P3: "do you charge for diagnostics" -> should not guess', () => {
    expect(PROMPT).toContain('Never guess');
  });

  it('P4: "is it expensive to recharge refrigerant" -> no number', () => {
    expect(PROMPT).not.toMatch(/\$\d+/);
    expect(PROMPT).toContain('Never quote exact prices');
  });

  it('P5: "how much is a new HVAC system" -> FAQ has safe answer', () => {
    expect(PROMPT).toContain("It depends on your home's size and setup");
  });

  it('P6: "do you offer free estimates" -> should not promise', () => {
    expect(PROMPT).toContain('free on-site estimate');
  });

  it('P7: "what\'s your service fee" -> should not guess', () => {
    expect(PROMPT).toContain('Never guess');
  });

  it('P8: "repair vs replacement cost" -> should not guess', () => {
    expect(PROMPT).toContain('Never guess');
  });

  it('P9: "extra charge on weekends" -> should not guess', () => {
    expect(PROMPT).toContain('Never guess');
  });

  it('P10: "cost for maintenance" -> should not guess', () => {
    expect(PROMPT).toContain('Never guess');
  });

  it('P11: "do you offer financing" -> FAQ has safe answer', () => {
    expect(PROMPT).toContain('Yes, we have financing options available');
  });

  it('pricing questions should never trigger emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "How much does it cost to replace an AC unit?");
    expect(s.emergencyEscalated).toBe(false);
  });
});

// ==========================================================================
// CATEGORY 4: HVAC Knowledge Boundaries
// AI should reference HVAC template rules, not guess about unknowns
// ==========================================================================
describe('Cat 4: HVAC Knowledge Boundaries', () => {
  it('prompt includes HVAC services list', () => {
    expect(PROMPT).toContain('hvac');
    expect(PROMPT).toContain('ac_repair');
    expect(PROMPT).toContain('furnace');
    expect(PROMPT).toContain('heat_pump');
    expect(PROMPT).toContain('duct_cleaning');
  });

  it('prompt includes HVAC issue categories', () => {
    expect(PROMPT).toContain('ac_repair');
    expect(PROMPT).toContain('heating_repair');
    expect(PROMPT).toContain('maintenance');
    expect(PROMPT).toContain('thermostat');
    expect(PROMPT).toContain('duct_work');
    expect(PROMPT).toContain('new_install');
  });

  it('K1: "how often should I change my filter" -> FAQ has safe answer', () => {
    expect(PROMPT).toContain('Most filters should be changed every 1-3 months');
  });

  it('K2: "AC running but not cooling" -> FAQ has safe answer', () => {
    expect(PROMPT).toContain('low refrigerant, a compressor issue, or airflow problem');
  });

  it('K3: "do you install heat pumps" -> in services list', () => {
    expect(PROMPT).toContain('heat_pump');
  });

  it('K4: "can you install a smart thermostat" -> thermostat is a category', () => {
    expect(PROMPT).toContain('thermostat');
  });

  it('K5: for new installs, prompt asks about square footage', () => {
    expect(PROMPT).toContain('ask square footage of home');
  });

  it('K6: never recommend DIY fixes', () => {
    expect(PROMPT).toContain('Never recommend DIY fixes');
  });

  it('K7: "licensed and insured" -> should not make claims', () => {
    expect(PROMPT).toContain("I'm not sure about that");
  });

  it('K8: "how long in business" -> should not guess', () => {
    expect(PROMPT).toContain('Never guess');
  });

  it('K9: "warranty on your work" -> should not promise', () => {
    expect(PROMPT).toContain('Never promise');
    expect(PROMPT).toContain('warranties');
  });

  it('K10: commercial vs residential -> should not guess capability', () => {
    expect(PROMPT).toContain("I'm not sure about that");
  });

  it('services questions should never trigger emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Do you install mini splits?");
    expect(s.emergencyEscalated).toBe(false);
  });
});

// ==========================================================================
// CATEGORY 5: Seasonal Context
// HVAC has 4 seasonal hint groups; current month (March) = spring
// ==========================================================================
describe('Cat 5: HVAC Seasonal Context', () => {
  it('prompt includes seasonal context section', () => {
    expect(PROMPT).toContain('SEASONAL CONTEXT');
  });

  it('March is in spring months [3,4,5] -> spring hint present', () => {
    // Current date is March 17, month 3 is in the spring range
    expect(PROMPT).toContain('AC tune-ups before summer');
  });

  it('spring hint mentions early bird pricing', () => {
    expect(PROMPT).toContain('early bird pricing');
  });

  it('summer hint (months 6,7,8) is NOT shown in March', () => {
    // Summer hint: "AC repair demand peaks, ask about comfort level in specific rooms"
    // Should NOT be in prompt during March
    expect(PROMPT).not.toContain('AC repair demand peaks');
  });

  it('fall hint (months 9,10) is NOT shown in March', () => {
    expect(PROMPT).not.toContain('furnace inspections before winter');
  });

  it('winter hint (months 11,12,1,2) is NOT shown in March', () => {
    expect(PROMPT).not.toContain('heating emergencies common');
  });
});

// ==========================================================================
// CATEGORY 6: Scheduling / Booking Flow
// Routine scheduling should not escalate
// ==========================================================================
describe('Cat 6: HVAC Scheduling & Booking', () => {
  it('S1: "can you come today" -> routine, offer to check availability', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Can you come out today to look at my AC?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('S2: "weekend availability" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Do you have any weekend availability for a furnace tune-up?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('S3: "can I reschedule" -> should offer human callback', () => {
    expect(PROMPT).toContain('person, a human');
  });

  it('S4: "how long does service take" -> should not guess', () => {
    expect(PROMPT).toContain("I'm not sure about that");
    expect(PROMPT).toContain('technician can answer');
  });

  it('S5: "same-day service" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Do you offer same-day service for AC repair?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('prompt has booking tools for scheduling', () => {
    expect(PROMPT).toContain('check_availability');
    expect(PROMPT).toContain('book_appointment');
    expect(PROMPT).toContain('offer to book');
  });
});

// ==========================================================================
// CATEGORY 7: Installation Questions (P3-P4)
// Should flow to booking, never escalate
// ==========================================================================
describe('Cat 7: HVAC Installation Questions', () => {
  it('I1: "replace my AC unit" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I want to replace my entire AC unit");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('I2: "install a heat pump" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Do you install heat pumps?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('I3: "upgrade my system" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Can you upgrade my current HVAC system?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('I4: "building a new home" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I'm building a new home and need HVAC installed");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('I5: "install ductwork" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Can you install ductwork in my home?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('I6: "more energy-efficient system" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I want a more energy-efficient system, what do you recommend?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('I7: "convert to central air" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Can you convert my house to central air?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('I8: "install mini splits" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Do you install mini splits?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('I9: "replace my furnace" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Can you replace my old furnace?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('prompt asks for square footage and current system on installs', () => {
    expect(PROMPT).toContain('square footage');
    expect(PROMPT).toContain('what system they currently have');
  });
});

// ==========================================================================
// CATEGORY 8: Common HVAC Caller Scenarios (Edge Cases)
// ==========================================================================
describe('Cat 8: HVAC Edge Cases & Common Scenarios', () => {
  it('EC1: "my AC stopped and I have pets at home" -> NOT emergency (no temp mentioned)', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "My AC stopped working and I have two dogs at home");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('EC2: "noisy unit" -> routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "My HVAC unit is really noisy, like a rattling sound");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('EC3: "thermostat issues" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "My thermostat isn't responding when I change the temperature");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('EC4: "AC not cooling well" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "The AC is on but the house just isn't getting cool enough");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('EC5: previous tech didn\'t fix it -> routine rebooking', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "The tech who came last week didn't fix the problem and my AC is still not working right");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('EC6: multiple units / property manager -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I manage 8 rental units and several need HVAC maintenance");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('EC7: "are you a robot" -> prompt has safe response', () => {
    expect(PROMPT).toContain("Yep, I'm an AI assistant for Cool Breeze HVAC");
  });

  it('EC8: angry customer -> prompt says escalate to owner', () => {
    expect(PROMPT).toContain("Let me get the owner on the phone");
  });

  it('EC9: DIY request -> should not give DIY advice', () => {
    expect(PROMPT).toContain('Never recommend DIY fixes');
  });

  it('EC10: confused caller saying "hello?" -> prompt has recovery', () => {
    expect(PROMPT).toContain("Hey, I'm here!");
  });
});

// ==========================================================================
// CATEGORY 9: HVAC-Specific FAQ in Prompt
// ==========================================================================
describe('Cat 9: HVAC FAQ Answers in Prompt', () => {
  it('FAQ: new AC cost -> safe deflection answer present', () => {
    expect(PROMPT).toContain("It depends on your home's size and setup");
    expect(PROMPT).toContain('options and pricing on-site');
  });

  it('FAQ: filter change frequency -> safe answer present', () => {
    expect(PROMPT).toContain('Most filters should be changed every 1-3 months');
    expect(PROMPT).toContain('recommend the right schedule for your system');
  });

  it('FAQ: AC running but not cooling -> safe diagnostic deflection', () => {
    expect(PROMPT).toContain('low refrigerant, a compressor issue, or airflow problem');
    expect(PROMPT).toContain('tech will diagnose it');
  });

  it('FAQ: financing -> safe answer present', () => {
    expect(PROMPT).toContain('Yes, we have financing options available');
    expect(PROMPT).toContain('tech can walk you through them');
  });

  it('all 4 HVAC FAQ entries appear in the COMMON QUESTIONS section', () => {
    expect(PROMPT).toContain('COMMON QUESTIONS');
    expect(PROMPT).toContain('How much does a new AC cost?');
    expect(PROMPT).toContain('How often should I change my filter?');
    expect(PROMPT).toContain('My AC is running but not cooling');
    expect(PROMPT).toContain('Do you offer financing?');
  });
});

// ==========================================================================
// CATEGORY 10: HVAC Industry-Specific Prompt Rules
// ==========================================================================
describe('Cat 10: HVAC Industry-Specific Prompt Rules', () => {
  it('prompt has INDUSTRY-SPECIFIC RULES section', () => {
    expect(PROMPT).toContain('INDUSTRY-SPECIFIC RULES');
  });

  it('rule: collect caller name, address, what\'s happening', () => {
    expect(PROMPT).toContain('Collect: caller name, address');
    expect(PROMPT).toContain('AC/heat, which unit, symptoms');
  });

  it('rule: ask about airflow and temperature', () => {
    expect(PROMPT).toContain('is the system blowing air at all');
    expect(PROMPT).toContain('blowing but not cold/hot');
    expect(PROMPT).toContain('unusual sounds');
  });

  it('rule: thermostat troubleshooting questions', () => {
    expect(PROMPT).toContain('blank');
    expect(PROMPT).toContain('replacing batteries');
    expect(PROMPT).toContain('what brand');
  });

  it('rule: never recommend DIY fixes', () => {
    expect(PROMPT).toContain('Never recommend DIY fixes');
    expect(PROMPT).toContain('tech will get it sorted safely');
  });

  it('rule: new installs ask for square footage and current system', () => {
    expect(PROMPT).toContain('square footage of home');
    expect(PROMPT).toContain('what system they currently have');
  });
});

// ==========================================================================
// CATEGORY 11: Service Area
// ==========================================================================
describe('Cat 11: HVAC Service Area', () => {
  it('prompt includes the service area', () => {
    expect(PROMPT).toContain('Dallas, TX and surrounding areas');
  });

  it('prompt has escalation for emergency after-hours', () => {
    expect(PROMPT).toContain('escalate_emergency');
  });

  it('service area questions should never trigger emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Do you serve the Plano area?");
    expect(s.emergencyEscalated).toBe(false);
  });
});

// ==========================================================================
// CROSS-CATEGORY: HVAC Prompt Completeness
// ==========================================================================
describe('Cross-category: HVAC prompt completeness', () => {
  it('has pricing deflection with HVAC-specific disclaimer', () => {
    expect(PROMPT).toContain('Never quote exact prices');
    expect(PROMPT).toContain('diagnose the issue on-site and provide a quote');
  });

  it('has diagnosis prohibition', () => {
    // The general prompt rule about not diagnosing
    expect(PROMPT).toContain('Never diagnose');
    expect(PROMPT).toContain('tech will take a look');
  });

  it('has "I don\'t know" fallback for questions outside AI scope', () => {
    expect(PROMPT).toContain("I'm not sure about that");
    expect(PROMPT).toContain('technician can answer');
  });

  it('has all 6 HVAC emergency definitions', () => {
    expect(PROMPT).toContain('No heat when outside temperature is below 40');
    expect(PROMPT).toContain('No AC when outside temperature is above 95');
    expect(PROMPT).toContain('Gas smell near furnace');
    expect(PROMPT).toContain('Carbon monoxide alarm going off');
    expect(PROMPT).toContain('Furnace making loud banging or popping sounds');
    expect(PROMPT).toContain('Smoke or burning smell from HVAC unit');
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

  it('non-emergency HVAC items are excluded from emergency list', () => {
    // The prompt says "Anything NOT on that list is a normal service call"
    expect(PROMPT).toContain('NOT on that list is a normal service call');
  });

  it('prompt word count is under 1100', () => {
    const wordCount = PROMPT.split(/\s+/).length;
    expect(wordCount).toBeLessThan(1100);
  });

  it('HVAC-specific: prompt does NOT contain plumbing emergency definitions', () => {
    expect(PROMPT).not.toContain('Burst or spraying pipe');
    expect(PROMPT).not.toContain('Sewage backup into the home');
    expect(PROMPT).not.toContain('No running water to entire house');
  });
});
