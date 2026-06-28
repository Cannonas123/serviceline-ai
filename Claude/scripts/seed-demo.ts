import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { eq, and } from 'drizzle-orm';
import {
  clients,
  calls,
  leads,
  appointments,
  revenueMetrics,
  reviews,
} from '../packages/db/src/schema.js';

// ── Config ──────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

// ── Helpers ─────────────────────────────────────────────────────────
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function randomDate(day: Date, minHour: number, maxHour: number): Date {
  const d = new Date(day);
  d.setHours(rand(minHour, maxHour - 1), rand(0, 59), rand(0, 59), 0);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Data Pools ──────────────────────────────────────────────────────
const PHONE_POOL = [
  '+15125550101', '+15125550102', '+15125550103', '+15125550104', '+15125550105',
  '+15125550106', '+15125550107', '+15125550108', '+15125550109', '+15125550110',
  '+15125550111', '+15125550112', '+15125550113', '+15125550114', '+15125550115',
  '+15125550116', '+15125550117', '+15125550118', '+15125550119', '+15125550120',
  '+15125550121', '+15125550122', '+15125550123', '+15125550124', '+15125550125',
  '+15125550126', '+15125550127', '+15125550128', '+15125550129', '+15125550130',
  '+15125550131', '+15125550132', '+15125550133', '+15125550134', '+15125550135',
  '+15125550136', '+15125550137', '+15125550138', '+15125550139', '+15125550140',
  '+15125550141', '+15125550142', '+15125550143', '+15125550144', '+15125550145',
];

const NAMES = [
  'Sarah Williams', 'James Rodriguez', 'Emily Chen', 'Robert Taylor',
  'Jessica Martinez', 'David Kim', 'Amanda Johnson', 'Michael Brown',
  'Laura Garcia', 'Chris Anderson', 'Patricia Wilson', 'Daniel Lee',
  'Jennifer Thomas', 'Kevin Hernandez', 'Maria Lopez',
];

const ADDRESSES = [
  '1420 S Congress Ave, Austin, TX 78704',
  '3200 Duval St, Austin, TX 78705',
  '8900 Shoal Creek Blvd, Austin, TX 78757',
  '2100 Barton Springs Rd, Austin, TX 78704',
  '5500 Balcones Dr, Austin, TX 78731',
  '1100 E 6th St, Austin, TX 78702',
  '4200 Medical Pkwy, Austin, TX 78756',
  '7300 Manchaca Rd, Austin, TX 78745',
  '900 W Oltorf St, Austin, TX 78704',
  '6100 N Lamar Blvd, Austin, TX 78752',
  '1800 E Riverside Dr, Austin, TX 78741',
  '3500 Greystone Dr, Austin, TX 78731',
  '10200 Research Blvd, Austin, TX 78759',
  '2400 E Cesar Chavez St, Austin, TX 78702',
  '4800 Burnet Rd, Austin, TX 78756',
];

const CALL_STATUSES = ['answered_ai', 'missed', 'voicemail', 'answered_human'] as const;
const CALL_WEIGHTS = [60, 20, 15, 5];

const LEAD_SOURCES = ['voice', 'missed_call', 'sms'] as const;
const LEAD_SOURCE_WEIGHTS = [50, 30, 20];

const LEAD_STATUSES = ['new', 'contacted', 'booked', 'completed', 'lost'] as const;
const LEAD_STATUS_WEIGHTS = [20, 15, 30, 25, 10];

// ── Industry-Specific Data ──────────────────────────────────────────

interface IndustryConfig {
  name: string;
  slug: string;
  ownerName: string;
  industry: string;
  services: string[];
  twilioPhone: string;
  forwardPhone: string;
  avgTicketValue: string;
  issueCategories: string[];
  issues: string[];
  aiSummaries: string[];
}

const INDUSTRY_CONFIGS: IndustryConfig[] = [
  {
    name: "Mike's Plumbing & Drain",
    slug: 'mikes-plumbing-demo',
    ownerName: 'Mike Johnson',
    industry: 'plumbing',
    services: ['Leak Repair', 'Drain Cleaning', 'Water Heater', 'Sewer Line', 'Fixture Install'],
    twilioPhone: '+15559990001',
    forwardPhone: '+15551234567',
    avgTicketValue: '350',
    issueCategories: ['leak_repair', 'drain_clog', 'water_heater', 'sewer_line', 'fixture_install'],
    issues: [
      'Leaky faucet in kitchen',
      'Clogged drain in master bath',
      'Water heater not producing hot water',
      'Running toilet won\'t stop',
      'Low water pressure throughout house',
      'Garbage disposal jammed',
      'Slow draining bathtub',
      'Pipe under sink dripping',
      'Water heater making popping sounds',
      'Outdoor faucet leaking',
    ],
    aiSummaries: [
      'Caller reported a leaky faucet in the kitchen. Booked appointment for Tuesday at 2 PM.',
      'Customer has a clogged drain in the master bathroom. Tried Drano but it didn\'t work. Scheduled service visit.',
      'Water heater issue - no hot water since this morning. Advised turning off the unit. Appointment booked for same day.',
      'Toilet running constantly. Customer concerned about water bill. Booked next-day appointment.',
      'Low water pressure in all faucets since yesterday. Could be a main line issue. Technician dispatched.',
      'Garbage disposal making grinding noise and won\'t turn on. Reset button doesn\'t help. Appointment scheduled.',
      'Bathtub draining very slowly. Customer mentioned hair buildup. Service visit booked.',
      'Pipe under kitchen sink has a slow drip. Customer placed a bucket. Next-day appointment confirmed.',
      'Water heater making loud popping and banging sounds. Over 10 years old. Inspection scheduled.',
      'Outdoor hose bib leaking when turned on. Customer worried about foundation damage. Appointment booked.',
      'Caller asked about sewer line inspection pricing. AI provided estimate range and booked a camera inspection.',
      'Emergency call - burst pipe in garage. Advised to shut off main water valve. Emergency dispatch initiated.',
      'Customer wants a new tankless water heater installed. AI gathered house size and current setup details.',
      'Slow drain in multiple sinks. Possible main line issue. Booked diagnostic appointment.',
      'Toilet flange leaking at base. Water on bathroom floor. Next-day morning appointment set.',
    ],
  },
  {
    name: 'CoolAir HVAC Solutions',
    slug: 'coolair-hvac-demo',
    ownerName: 'Carlos Rivera',
    industry: 'hvac',
    services: ['AC Repair', 'Heating Repair', 'Maintenance & Tune-Up', 'Duct Work', 'Thermostat', 'New System Install'],
    twilioPhone: '+15559990002',
    forwardPhone: '+15552345678',
    avgTicketValue: '400',
    issueCategories: ['ac_repair', 'heating_repair', 'maintenance', 'thermostat', 'duct_work', 'new_install'],
    issues: [
      'AC is running but not blowing cold air',
      'Furnace won\'t turn on when thermostat set to heat',
      'Thermostat display is blank and unresponsive',
      'Loud banging noise coming from the furnace',
      'AC unit outside is making a grinding sound',
      'Air coming out of vents feels weak',
      'Home isn\'t cooling evenly — upstairs is 10 degrees warmer',
      'Strange burning smell when heater kicks on',
      'AC is leaking water inside near the handler',
      'Need annual maintenance tune-up before summer',
    ],
    aiSummaries: [
      'Caller reports AC running but not cooling. System is 8 years old. Booked diagnostic for tomorrow morning.',
      'Furnace won\'t turn on. Thermostat set correctly. Customer checked breaker — it\'s fine. Same-day appointment booked.',
      'Thermostat went blank overnight. Tried new batteries with no luck. Scheduled technician visit.',
      'Loud banging from furnace when it starts. Customer concerned about safety. Booked morning appointment.',
      'AC unit outside making grinding noise. Still blowing cold but sound is getting worse. Service visit scheduled.',
      'Weak airflow from vents throughout the house. Could be a duct or blower issue. Technician dispatched.',
      'Uneven cooling — upstairs is very warm while downstairs is fine. AI asked about duct work and home age. Appointment set.',
      'Customer smells burning when heater kicks on for first time this season. Advised to turn off unit. Emergency appointment booked.',
      'Water pooling around indoor AC unit. AI advised checking the drain line. Booked next-day service visit.',
      'Annual tune-up request. System is 5 years old. AI booked maintenance appointment and quoted the tune-up special.',
      'Customer asking about replacing their 15-year-old AC system. AI collected home square footage and current system details.',
      'Mini-split in bedroom stopped cooling. Thermostat shows error code E4. Technician dispatched.',
      'Air quality concern — musty smell from vents. AI suggested duct cleaning and booked an inspection.',
      'Customer wants to add a zone to their existing system. AI gathered details and scheduled a consultation.',
      'After-hours call — no heat with temp below 35 outside. Emergency dispatch for heating repair.',
    ],
  },
  {
    name: 'GreenShield Pest Control',
    slug: 'greenshield-pest-demo',
    ownerName: 'Dana Whitfield',
    industry: 'pest',
    services: ['General Pest Control', 'Termite Inspection', 'Termite Treatment', 'Rodent Control', 'Mosquito Treatment', 'Bed Bug Treatment'],
    twilioPhone: '+15559990003',
    forwardPhone: '+15553456789',
    avgTicketValue: '200',
    issueCategories: ['general_pest', 'termite', 'rodent', 'mosquito', 'bed_bug', 'ant', 'roach', 'wasp_bee'],
    issues: [
      'Seeing large cockroaches in the kitchen at night',
      'Found mud tubes along the foundation — possible termites',
      'Hearing scratching sounds in the attic walls at night',
      'Ant trails coming in through the back door',
      'Wasp nest forming under the eaves of the garage',
      'Mouse droppings found in the pantry',
      'Mosquitoes are terrible in the backyard — kids getting bitten',
      'Woke up with bites — think it might be bed bugs',
      'Saw a large rat in the garage yesterday evening',
      'Tiny black ants all over the bathroom counter',
    ],
    aiSummaries: [
      'Caller seeing large roaches in kitchen nightly for the past week. AI asked about pets and children. Booked inspection.',
      'Customer found mud tubes along the foundation. Previous termite inspection was 3 years ago. Scheduled inspection for tomorrow.',
      'Scratching sounds in the walls at night. Customer thinks it might be rats or squirrels. Booked same-day assessment.',
      'Ant problem — trail coming in through the back door and into the kitchen. AI asked about food storage. Treatment visit booked.',
      'Wasp nest under the garage eaves. Growing for about a week. No one allergic. Scheduled removal for morning.',
      'Mouse droppings in pantry and under the sink. Customer has small children. Booked inspection and exclusion quote.',
      'Mosquito problem in the backyard. Kids are getting bitten regularly. AI recommended yard treatment and booked a visit.',
      'Customer suspects bed bugs — waking up with bite marks. AI asked about recent travel. Inspection booked for tomorrow.',
      'Rat spotted in garage. Customer worried about it getting into the house. Emergency assessment scheduled.',
      'Small black ants covering the bathroom counter. Customer tried spray but they keep coming back. Treatment visit scheduled.',
      'Customer wants quarterly pest control plan. Home is 2,500 sq ft. AI provided plan options and booked first treatment.',
      'Termite swarm inside the living room. Many winged insects near the window. Emergency inspection dispatched.',
      'Customer needs wildlife removal — raccoon in the crawlspace. AI confirmed and booked a technician.',
      'Flea problem after getting a new pet. Customer tried over-the-counter treatment. Professional treatment booked.',
      'Customer asking about mosquito misting system installation. AI gathered yard details and scheduled consultation.',
    ],
  },
];

// Pre-hashed bcrypt for "123456"
const DEMO_PIN_HASH = '$2b$10$5HxlGdGFd.9O8sHKo/9O5OXkVRYIahYWZCScB5KgpwXWQr4626g.G';

// ── Main ────────────────────────────────────────────────────────────
async function seed() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const config of INDUSTRY_CONFIGS) {
    console.log(`\n── Seeding: ${config.name} (${config.industry}) ──`);

    // 1. Clear existing demo data for this client
    const existing = await db.select({ id: clients.id })
      .from(clients)
      .where(eq(clients.slug, config.slug));

    for (const row of existing) {
      await db.delete(reviews).where(eq(reviews.clientId, row.id));
      await db.delete(revenueMetrics).where(eq(revenueMetrics.clientId, row.id));
      await db.delete(appointments).where(eq(appointments.clientId, row.id));
      await db.delete(calls).where(eq(calls.clientId, row.id));
      await db.delete(leads).where(eq(leads.clientId, row.id));
      await db.delete(clients).where(eq(clients.id, row.id));
    }
    console.log(`  Cleared ${existing.length} existing client(s)`);

    // 2. Create client
    const [client] = await db.insert(clients).values({
      name: config.name,
      slug: config.slug,
      ownerName: config.ownerName,
      ownerPhone: config.forwardPhone,
      twilioPhone: config.twilioPhone,
      forwardPhone: config.forwardPhone,
      industry: config.industry,
      businessHours: {
        monday: { open: '08:00', close: '17:00' },
        tuesday: { open: '08:00', close: '17:00' },
        wednesday: { open: '08:00', close: '17:00' },
        thursday: { open: '08:00', close: '17:00' },
        friday: { open: '08:00', close: '17:00' },
        saturday: { open: '09:00', close: '14:00' },
        sunday: null,
      },
      services: config.services,
      serviceArea: 'Austin, TX and surrounding areas',
      plan: 'pro',
      dashboardPin: DEMO_PIN_HASH,
      status: 'active',
      avgTicketValue: config.avgTicketValue,
    }).returning();

    const clientId = client.id;
    console.log(`  Created client: ${client.name} (${clientId})`);

    // 3. Generate 30 days of data
    let totalCalls = 0;
    let totalLeads = 0;
    let totalAppointments = 0;
    let totalRevenueDays = 0;
    let totalReviews = 0;

    // Each client gets its own slice of the phone pool to avoid unique constraint conflicts
    const clientIndex = INDUSTRY_CONFIGS.indexOf(config);
    const phonesPerClient = Math.floor(PHONE_POOL.length / INDUSTRY_CONFIGS.length);
    const clientPhones = PHONE_POOL.slice(
      clientIndex * phonesPerClient,
      (clientIndex + 1) * phonesPerClient,
    );

    const usedLeadPhones = new Set<string>();
    const ticketValue = parseInt(config.avgTicketValue, 10);

    for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
      const day = new Date(today);
      day.setDate(day.getDate() - dayOffset);
      const isPast = dayOffset > 0;
      const dateStr = formatDate(day);

      // ── Calls (2-6 per day) ──
      const numCalls = rand(2, 6);
      const dayCalls: Array<{ status: string; phone: string }> = [];
      for (let c = 0; c < numCalls; c++) {
        const status = weightedPick([...CALL_STATUSES], CALL_WEIGHTS);
        const phone = pick(clientPhones);
        const isAnswered = status === 'answered_ai' || status === 'answered_human';

        const voicemailSummary = config.industry === 'hvac'
          ? 'Voicemail left. Caller requested a callback about an HVAC issue.'
          : config.industry === 'pest'
            ? 'Voicemail left. Caller requested a callback about a pest problem.'
            : 'Voicemail left. Caller requested a callback about a plumbing issue.';

        await db.insert(calls).values({
          clientId,
          callerPhone: phone,
          twilioCallSid: `CA${dateStr.replace(/-/g, '')}${rand(100000, 999999)}`,
          status,
          durationSeconds: isAnswered ? rand(60, 300) : null,
          aiSummary: isAnswered ? pick(config.aiSummaries) : (status === 'voicemail' ? voicemailSummary : null),
          recordingUrl: isAnswered ? `https://api.twilio.com/recordings/RE${rand(100000, 999999)}` : null,
          appointmentBooked: status === 'answered_ai' && Math.random() < 0.4,
          createdAt: randomDate(day, 7, 19),
        });
        dayCalls.push({ status, phone });
        totalCalls++;
      }

      // ── Leads (1-4 per day) ──
      const numLeads = rand(1, 4);
      const dayLeadData: Array<{ name: string; phone: string; address: string; issue: string }> = [];
      for (let l = 0; l < numLeads; l++) {
        let phone: string;
        let attempts = 0;
        do {
          phone = pick(clientPhones);
          attempts++;
        } while (usedLeadPhones.has(phone) && attempts < 50);

        if (usedLeadPhones.has(phone)) continue;
        usedLeadPhones.add(phone);

        const name = pick(NAMES);
        const address = pick(ADDRESSES);
        const issue = pick(config.issues);
        const source = weightedPick([...LEAD_SOURCES], LEAD_SOURCE_WEIGHTS);
        const status = weightedPick([...LEAD_STATUSES], LEAD_STATUS_WEIGHTS);
        const category = pick(config.issueCategories);

        await db.insert(leads).values({
          clientId,
          contactName: name,
          contactPhone: phone,
          contactAddress: address,
          issueDescription: issue,
          issueCategory: category,
          urgency: rand(1, 5),
          source,
          status,
          createdAt: randomDate(day, 8, 17),
        });
        dayLeadData.push({ name, phone, address, issue });
        totalLeads++;
      }

      // ── Appointments (0-2 per day) ──
      const numAppointments = Math.min(rand(0, 2), dayLeadData.length);
      for (let a = 0; a < numAppointments; a++) {
        const lead = dayLeadData[a];
        const apptStatus = isPast
          ? weightedPick(['completed', 'completed', 'no_show'], [80, 15, 5])
          : 'scheduled';

        await db.insert(appointments).values({
          clientId,
          contactName: lead.name,
          contactPhone: lead.phone,
          contactAddress: lead.address,
          issueDescription: lead.issue,
          scheduledAt: randomDate(day, 8, 17),
          duration: pick([60, 90, 120]),
          status: apptStatus,
          urgency: pick(['normal', 'same_day']),
          createdAt: randomDate(day, 7, 10),
        });
        totalAppointments++;
      }

      // ── Revenue Metrics (1 per day) ──
      const answeredAi = dayCalls.filter(c => c.status === 'answered_ai').length;
      const missed = dayCalls.filter(c => c.status === 'missed').length;
      const callsRescued = answeredAi + Math.round(missed * 0.7);

      await db.insert(revenueMetrics).values({
        clientId,
        date: dateStr,
        callsRescued,
        leadsCreated: dayLeadData.length,
        appointmentsBooked: numAppointments,
        reviewsRequested: Math.random() < 0.4 ? 1 : 0,
        reviewsReceived: Math.random() < 0.3 ? 1 : 0,
        estimatedRevenueRescued: String(callsRescued * ticketValue),
      });
      totalRevenueDays++;

      // ── Reviews (0-1 per day, ~12 total over 30 days) ──
      if (Math.random() < 0.4 && totalReviews < 15) {
        const received = Math.random() < 0.8;
        await db.insert(reviews).values({
          clientId,
          contactPhone: pick(clientPhones),
          requestSentAt: randomDate(day, 10, 16),
          reviewReceived: received,
          reviewRating: received ? weightedPick([5, 4], [70, 30]) : null,
          createdAt: randomDate(day, 10, 16),
        });
        totalReviews++;
      }
    }

    console.log(`  Seeded: ${totalCalls} calls, ${totalLeads} leads, ${totalAppointments} appointments, ${totalRevenueDays} revenue days, ${totalReviews} reviews`);
  }

  console.log('\nAll demo clients seeded successfully.');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
