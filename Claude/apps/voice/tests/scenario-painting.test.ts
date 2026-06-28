/**
 * Painting Scenario Test Suite
 *
 * Tests validate the PROMPT RULES for the painting industry. We verify that:
 * 1. The system prompt contains rules that guide the AI correctly
 * 2. Painting has NO emergencies — almost everything is routine
 * 3. Pricing questions are deflected to free on-site estimates
 * 4. Paint brand, color, and prep questions are deferred to the painter
 * 5. Routine calls flow to booking, not escalation
 * 6. Painting-specific FAQ, seasonal hints, and industry rules appear in the prompt
 * 7. Common painting scenarios (interior, exterior, cabinets, staining, etc.) are handled
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
  businessName: "Fresh Coat Painting",
  ownerName: 'Sarah Chen',
  ownerPhone: '+15553333333',
  services: ['painting', 'interior', 'exterior', 'cabinet_refinishing', 'staining'],
  serviceArea: 'Austin, TX and surrounding areas',
  callerPhone: '+15551234567',
  plan: 'pro' as const,
  useRealAI: false,
  industry: 'painting',
};

const PROMPT = buildSystemPrompt({
  name: CONFIG.businessName,
  services: CONFIG.services,
  serviceArea: CONFIG.serviceArea,
  industry: 'painting',
  month: 3, // pin to spring so seasonal assertions are deterministic year-round
});

// ==========================================================================
// CATEGORY 1: Emergency vs Routine
// Painting has ZERO emergencies — everything is routine
// ==========================================================================
describe('Cat 1: Painting Has No Emergencies', () => {
  it('painting template defines ZERO emergency definitions', () => {
    // The prompt should NOT contain an emergency list since painting has none
    expect(PROMPT).not.toContain('These are emergencies for this type of business');
  });

  it('prompt acknowledges this industry rarely has emergencies', () => {
    expect(PROMPT).toContain('This industry rarely has true emergencies');
  });

  it('prompt still allows escalation for immediate safety hazard', () => {
    expect(PROMPT).toContain('immediate safety hazard or property damage happening RIGHT NOW');
  });

  it('prompt does NOT contain plumbing emergency definitions', () => {
    expect(PROMPT).not.toContain('Burst or spraying pipe');
    expect(PROMPT).not.toContain('Sewage backup into the home');
    expect(PROMPT).not.toContain('No running water to entire house');
  });

  it('prompt does NOT contain HVAC emergency definitions', () => {
    expect(PROMPT).not.toContain('No heat when outside temperature is below 40');
    expect(PROMPT).not.toContain('No AC when outside temperature is above 95');
    expect(PROMPT).not.toContain('Carbon monoxide alarm going off');
  });

  it('interior repaint request -> NOT emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I'd like to get my living room repainted");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('exterior painting request -> NOT emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I need the outside of my house painted");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('cabinet refinishing request -> NOT emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I want to refinish my kitchen cabinets");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('deck staining request -> NOT emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Can you stain my deck?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('wallpaper removal request -> NOT emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I need wallpaper removed from my dining room");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('pressure washing request -> NOT emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Can you pressure wash my driveway before painting?");
    expect(s.emergencyEscalated).toBe(false);
  });
});

// ==========================================================================
// CATEGORY 2: Estimate / Pricing Deflection
// Painting is estimate-heavy — always deflect to free on-site estimate
// ==========================================================================
describe('Cat 2: Painting Estimate & Pricing Deflection', () => {
  it('prompt never contains dollar amounts', () => {
    expect(PROMPT).not.toMatch(/\$\d+/);
  });

  it('prompt deflects all pricing to on-site estimate', () => {
    expect(PROMPT).toContain('Never quote exact prices');
  });

  it('painting pricing disclaimer mentions free estimate', () => {
    expect(PROMPT).toContain('free estimate');
    expect(PROMPT).toContain('pricing depends on the scope, surfaces, and prep work needed');
  });

  it('prompt rule: never quote prices, offer free on-site estimates', () => {
    expect(PROMPT).toContain('free on-site estimates because every job is different');
  });

  it('"how much to paint a room" -> deflect to estimate', () => {
    expect(PROMPT).toContain('free on-site estimate');
  });

  it('"how much for exterior painting" -> no number, deflect', () => {
    expect(PROMPT).not.toMatch(/\$\d+/);
    expect(PROMPT).toContain('Never quote exact prices');
  });

  it('"what\'s the cost per square foot" -> should not guess', () => {
    expect(PROMPT).toContain('Never guess');
  });

  it('"do you charge for estimates" -> FAQ says paint included or free estimate', () => {
    // The pricing disclaimer clearly says free estimate
    expect(PROMPT).toContain("free estimate");
  });

  it('"extra charge for high ceilings" -> should not guess', () => {
    expect(PROMPT).toContain('Never guess');
  });

  it('"how much for cabinet refinishing" -> should not guess', () => {
    expect(PROMPT).toContain('Never guess');
  });

  it('pricing questions should never trigger emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "How much does it cost to paint a whole house?");
    expect(s.emergencyEscalated).toBe(false);
  });
});

// ==========================================================================
// CATEGORY 3: Painting-Specific Knowledge Boundaries
// Colors, brands, surface prep — the AI must NOT guess
// ==========================================================================
describe('Cat 3: Painting Knowledge Boundaries (Colors, Brands, Prep)', () => {
  it('prompt includes painting services list', () => {
    expect(PROMPT).toContain('painting');
    expect(PROMPT).toContain('interior');
    expect(PROMPT).toContain('exterior');
    expect(PROMPT).toContain('cabinet_refinishing');
    expect(PROMPT).toContain('staining');
  });

  it('prompt includes painting issue categories', () => {
    expect(PROMPT).toContain('interior');
    expect(PROMPT).toContain('exterior');
    expect(PROMPT).toContain('cabinets');
    expect(PROMPT).toContain('drywall_repair');
    expect(PROMPT).toContain('pressure_wash');
    expect(PROMPT).toContain('staining');
    expect(PROMPT).toContain('wallpaper');
    expect(PROMPT).toContain('consultation');
  });

  it('"what paint brand do you use" -> should not guess', () => {
    // AI should never recommend specific paint brands
    expect(PROMPT).toContain('Never guess');
  });

  it('"what color should I use" -> prompt asks about color preferences, does not recommend', () => {
    // The prompt rule says "Ask if they have a color in mind or need help choosing"
    expect(PROMPT).toContain('color in mind or need help choosing');
  });

  it('"how should I prep the walls" -> should not give DIY advice', () => {
    // AI should defer prep questions to the painter
    expect(PROMPT).toContain("I'm not sure about that");
    expect(PROMPT).toContain('technician can answer');
  });

  it('"is Sherwin-Williams better than Benjamin Moore" -> should not compare', () => {
    expect(PROMPT).toContain("can't speak to other companies");
  });

  it('"are you licensed and insured" -> should not make claims', () => {
    expect(PROMPT).toContain("I'm not sure about that");
  });

  it('"how long have you been in business" -> should not guess', () => {
    expect(PROMPT).toContain('Never guess');
  });

  it('"do you guarantee your work" -> should not promise warranties', () => {
    expect(PROMPT).toContain('Never promise');
    expect(PROMPT).toContain('warranties');
  });

  it('knowledge questions should never trigger emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "What kind of paint do you use for exteriors?");
    expect(s.emergencyEscalated).toBe(false);
  });
});

// ==========================================================================
// CATEGORY 4: Painting-Specific Prompt Rules (Info Collection)
// ==========================================================================
describe('Cat 4: Painting-Specific Prompt Rules', () => {
  it('prompt has INDUSTRY-SPECIFIC RULES section', () => {
    expect(PROMPT).toContain('INDUSTRY-SPECIFIC RULES');
  });

  it('rule: collect caller name, address, what they want painted', () => {
    expect(PROMPT).toContain('Collect: caller name, address, what they want painted');
  });

  it('rule: ask about rooms, square footage, interior vs exterior', () => {
    expect(PROMPT).toContain('how many rooms or what square footage');
    expect(PROMPT).toContain('Interior or exterior');
  });

  it('rule: ask about prep work needed (peeling, patching)', () => {
    expect(PROMPT).toContain('prep work needed');
    expect(PROMPT).toContain('peeling');
    expect(PROMPT).toContain('patching');
  });

  it('rule: for exterior ask about siding material', () => {
    expect(PROMPT).toContain('siding material');
    expect(PROMPT).toContain('wood, stucco, brick, vinyl');
  });

  it('rule: for cabinets ask how many and paint vs stain', () => {
    expect(PROMPT).toContain('how many');
    expect(PROMPT).toContain('paint or stain');
  });

  it('rule: ask about color preference or need help choosing', () => {
    expect(PROMPT).toContain('color in mind or need help choosing');
  });

  it('rule: ask about timeline', () => {
    expect(PROMPT).toContain('timeline');
    expect(PROMPT).toContain('when do they want it done');
  });
});

// ==========================================================================
// CATEGORY 5: Seasonal Context
// Current month (March) = Spring -> exterior season starting
// ==========================================================================
describe('Cat 5: Painting Seasonal Context', () => {
  it('prompt includes seasonal context section', () => {
    expect(PROMPT).toContain('SEASONAL CONTEXT');
  });

  it('March is in spring months [3,4,5] -> spring hint present', () => {
    expect(PROMPT).toContain('exterior painting season starting');
  });

  it('spring hint mentions booking early', () => {
    expect(PROMPT).toContain('booking early');
  });

  it('summer hint (months 6,7,8) is NOT shown in March', () => {
    expect(PROMPT).not.toContain('peak exterior season');
    expect(PROMPT).not.toContain('mention deck staining');
  });

  it('fall hint (months 9,10,11) is NOT shown in March', () => {
    expect(PROMPT).not.toContain('last chance for exterior before winter');
  });

  it('winter hint (months 12,1,2) is NOT shown in March', () => {
    expect(PROMPT).not.toContain('interior painting season, cabinet refinishing');
  });
});

// ==========================================================================
// CATEGORY 6: Painting FAQ Answers in Prompt
// ==========================================================================
describe('Cat 6: Painting FAQ Answers in Prompt', () => {
  it('all 4 painting FAQ entries appear in COMMON QUESTIONS section', () => {
    expect(PROMPT).toContain('COMMON QUESTIONS');
    expect(PROMPT).toContain('How long does it take to paint a room?');
    expect(PROMPT).toContain('Do you provide the paint?');
    expect(PROMPT).toContain('Do I need to move my furniture?');
    expect(PROMPT).toContain('How many coats?');
  });

  it('FAQ: room painting time -> safe answer present', () => {
    expect(PROMPT).toContain('Most single rooms take a day');
    expect(PROMPT).toContain('depends on prep work');
  });

  it('FAQ: paint provided -> safe answer present', () => {
    expect(PROMPT).toContain('paint is included in our quotes');
    expect(PROMPT).toContain('supply your own if you prefer');
  });

  it('FAQ: furniture moving -> safe answer present', () => {
    expect(PROMPT).toContain('moving and covering furniture as part of the job');
  });

  it('FAQ: number of coats -> safe answer present', () => {
    expect(PROMPT).toContain('two coats for full coverage');
    expect(PROMPT).toContain('primer if needed');
  });
});

// ==========================================================================
// CATEGORY 7: Common Painting Scenarios (all routine)
// ==========================================================================
describe('Cat 7: Common Painting Scenarios', () => {
  it('interior repaint -> routine, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I want to repaint my bedroom and bathroom");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('full exterior house painting -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I need the entire exterior of my house painted, it's a two-story colonial");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('cabinet refinishing -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I want to refinish my kitchen cabinets from dark oak to white");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('touch-up work -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I just need some touch-up painting on a few walls where the kids scuffed them");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('commercial painting -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I need the lobby and hallways of my office building repainted");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('new construction painting -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I'm building a new home and need interior painting for the whole house");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('wallpaper removal -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I need old wallpaper removed and the walls painted");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('deck staining -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I have a large wood deck that needs to be stained");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('pressure washing before painting -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I need the house pressure washed before you paint it");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('fence staining -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Can you stain my wooden fence?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('drywall repair before painting -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I have some drywall damage that needs to be patched and painted over");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('color consultation -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I'm not sure what colors to pick, do you help with that?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('multiple rooms estimate -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "I want to paint 5 rooms — living room, dining room, kitchen, and two bedrooms");
    expect(s.emergencyEscalated).toBe(false);
  });
});

// ==========================================================================
// CATEGORY 8: Property-Specific Questions
// Painting AI should collect property details, not guess answers
// ==========================================================================
describe('Cat 8: Property-Specific Questions', () => {
  it('prompt asks about square footage', () => {
    expect(PROMPT).toContain('square footage');
  });

  it('prompt asks about number of rooms', () => {
    expect(PROMPT).toContain('how many rooms');
  });

  it('prompt asks about exterior siding material', () => {
    expect(PROMPT).toContain('siding material');
  });

  it('prompt asks about interior vs exterior', () => {
    expect(PROMPT).toContain('Interior or exterior');
  });

  it('prompt asks about prep work condition', () => {
    expect(PROMPT).toContain('peeling');
    expect(PROMPT).toContain('patching');
  });

  it('"how many square feet is your house" -> property question, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "It's about 2400 square feet, two stories");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('"it\'s a stucco house" -> provides siding info, not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "It's a stucco exterior with some cracks");
    expect(s.emergencyEscalated).toBe(false);
  });
});

// ==========================================================================
// CATEGORY 9: Scheduling & Booking Flow
// ==========================================================================
describe('Cat 9: Painting Scheduling & Booking', () => {
  it('"can you come out for an estimate" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Can you come out and give me an estimate?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('"weekend availability" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Do you have any weekend availability for an estimate?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('"how soon can you start" -> routine', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "How soon could you start if we go with you?");
    expect(s.emergencyEscalated).toBe(false);
  });

  it('"can I reschedule" -> should offer human callback', () => {
    expect(PROMPT).toContain('person, a human');
  });

  it('prompt has booking tools for scheduling', () => {
    expect(PROMPT).toContain('check_availability');
    expect(PROMPT).toContain('book_appointment');
    expect(PROMPT).toContain('offer to book');
  });
});

// ==========================================================================
// CATEGORY 10: Edge Cases & General Interactions
// ==========================================================================
describe('Cat 10: Painting Edge Cases & General Interactions', () => {
  it('"are you a robot" -> prompt has safe response', () => {
    expect(PROMPT).toContain("Yep, I'm an AI assistant for Fresh Coat Painting");
  });

  it('angry customer -> prompt says escalate to owner', () => {
    expect(PROMPT).toContain("Let me get the owner on the phone");
  });

  it('confused caller saying "hello?" -> prompt has recovery', () => {
    expect(PROMPT).toContain("Hey, I'm here!");
  });

  it('prompt has human escalation path', () => {
    expect(PROMPT).toContain('person, a human');
    expect(PROMPT).toContain('owner call you right back');
  });

  it('prompt includes the service area', () => {
    expect(PROMPT).toContain('Austin, TX and surrounding areas');
  });

  it('service area question -> not emergency', async () => {
    const s = await createSession(CONFIG);
    await sendMessage(s, "Do you serve the Round Rock area?");
    expect(s.emergencyEscalated).toBe(false);
  });
});

// ==========================================================================
// CROSS-CATEGORY: Painting Prompt Completeness
// ==========================================================================
describe('Cross-category: Painting prompt completeness', () => {
  it('has pricing deflection with painting-specific disclaimer', () => {
    expect(PROMPT).toContain('Never quote exact prices');
    expect(PROMPT).toContain('free estimate');
  });

  it('has diagnosis prohibition', () => {
    expect(PROMPT).toContain('Never diagnose');
  });

  it('has "I don\'t know" fallback for questions outside AI scope', () => {
    expect(PROMPT).toContain("I'm not sure about that");
    expect(PROMPT).toContain('technician can answer');
  });

  it('has NO emergency definitions (painting has zero)', () => {
    expect(PROMPT).not.toContain('These are emergencies for this type of business');
    expect(PROMPT).toContain('This industry rarely has true emergencies');
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

  it('prompt word count is under 1100', () => {
    const wordCount = PROMPT.split(/\s+/).length;
    expect(wordCount).toBeLessThan(1100);
  });

  it('painting-specific: prompt does NOT contain HVAC-specific rules', () => {
    expect(PROMPT).not.toContain('is the system blowing air at all');
    expect(PROMPT).not.toContain('replacing batteries');
    expect(PROMPT).not.toContain('Never recommend DIY fixes');
  });

  it('painting-specific: prompt does NOT contain plumbing-specific rules', () => {
    expect(PROMPT).not.toContain('water heater issues');
    expect(PROMPT).not.toContain('drain issues');
    expect(PROMPT).not.toContain('gurgling sounds');
  });
});
