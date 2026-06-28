import {
  pgTable, uuid, text, numeric, boolean, integer,
  timestamp, date, jsonb, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  ownerName: text('owner_name').notNull(),
  ownerPhone: text('owner_phone').notNull(),
  ownerEmail: text('owner_email'),
  twilioPhone: text('twilio_phone').unique().notNull(),
  forwardPhone: text('forward_phone').notNull(),
  businessHours: jsonb('business_hours').notNull(),
  services: text('services').array().notNull(),
  serviceArea: text('service_area').notNull(),
  avgTicketValue: numeric('avg_ticket_value').default('350'),
  googlePlaceId: text('google_place_id'),
  googleReviewLink: text('google_review_link'),
  googleCalendarId: text('google_calendar_id'),
  recordingConsentRequired: boolean('recording_consent_required').default(true),
  aiSystemPrompt: text('ai_system_prompt'),
  industry: text('industry').notNull().default('plumbing'), // plumbing|hvac|pest|painting|lawn|electrical
  plan: text('plan').notNull(), // 'starter' | 'pro'
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionStatus: text('subscription_status'), // stripe: trialing|active|past_due|canceled|unpaid
  dashboardPin: text('dashboard_pin').notNull(), // bcrypt hash
  status: text('status').notNull().default('active'), // pilot|active|paused|churned
  pilotEndsAt: timestamp('pilot_ends_at', { withTimezone: true }),
  guaranteeActive: boolean('guarantee_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  contactName: text('contact_name'),
  contactPhone: text('contact_phone').notNull(),
  contactAddress: text('contact_address'),
  issueDescription: text('issue_description'),
  issueCategory: text('issue_category'),
  urgency: integer('urgency'),
  source: text('source').notNull(), // voice|sms|missed_call
  status: text('status').notNull().default('new'),
  dripStep: integer('drip_step').default(0),
  dripNextAt: timestamp('drip_next_at', { withTimezone: true }),
  revenueRescued: numeric('revenue_rescued'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_leads_drip').on(table.clientId, table.status, table.dripNextAt),
  index('idx_leads_client_created').on(table.clientId, table.createdAt),
  uniqueIndex('idx_leads_client_phone').on(table.clientId, table.contactPhone),
]);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  leadId: uuid('lead_id').references(() => leads.id),
  contactPhone: text('contact_phone').notNull(),
  direction: text('direction').notNull(), // inbound|outbound
  channel: text('channel').notNull(), // sms|voice
  body: text('body').notNull(),
  twilioSid: text('twilio_sid'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_conversations_lookup').on(table.clientId, table.contactPhone, table.createdAt),
]);

export const calls = pgTable('calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  leadId: uuid('lead_id').references(() => leads.id),
  callerPhone: text('caller_phone').notNull(),
  twilioCallSid: text('twilio_call_sid').unique().notNull(),
  status: text('status').notNull(), // answered_human|answered_ai|missed|voicemail
  durationSeconds: integer('duration_seconds'),
  aiSummary: text('ai_summary'),
  recordingUrl: text('recording_url'),
  emergencyEscalated: boolean('emergency_escalated').default(false),
  appointmentBooked: boolean('appointment_booked').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_calls_client_created').on(table.clientId, table.createdAt),
]);

export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  leadId: uuid('lead_id').references(() => leads.id),
  contactName: text('contact_name').notNull(),
  contactPhone: text('contact_phone').notNull(),
  contactAddress: text('contact_address'),
  issueDescription: text('issue_description'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  duration: integer('duration_minutes').default(60),
  googleEventId: text('google_event_id'),
  status: text('status').notNull().default('scheduled'),
  urgency: text('urgency').default('normal'), // normal | same_day | emergency
  customerNotes: text('customer_notes'), // extra context from the AI conversation
  specialInstructions: text('special_instructions'), // e.g. "quote before work", "tenant property"
  brief: jsonb('brief'), // structured briefing card (see CallBrief type)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_appointments_client_scheduled').on(table.clientId, table.scheduledAt),
]);

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  leadId: uuid('lead_id').references(() => leads.id),
  contactPhone: text('contact_phone').notNull(),
  requestSentAt: timestamp('request_sent_at', { withTimezone: true }),
  reviewReceived: boolean('review_received').default(false),
  reviewRating: integer('review_rating'),
  reviewReplied: boolean('review_replied').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_reviews_client_created').on(table.clientId, table.createdAt),
]);

export const geoAudits = pgTable('geo_audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  auditType: text('audit_type').notNull(), // gbp|schema|ai_visibility|full
  score: numeric('score'),
  findings: jsonb('findings'),
  recommendations: jsonb('recommendations'),
  reportUrl: text('report_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const revenueMetrics = pgTable('revenue_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  date: date('date').notNull(),
  callsRescued: integer('calls_rescued').default(0),
  leadsCreated: integer('leads_created').default(0),
  appointmentsBooked: integer('appointments_booked').default(0),
  reviewsRequested: integer('reviews_requested').default(0),
  reviewsReceived: integer('reviews_received').default(0),
  estimatedRevenueRescued: numeric('estimated_revenue_rescued').default('0'),
}, (table) => [
  uniqueIndex('idx_revenue_metrics_unique').on(table.clientId, table.date),
  index('idx_revenue_metrics_client_date').on(table.clientId, table.date),
]);

export const onCallContacts = pgTable('on_call_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  role: text('role').default('technician'), // technician | manager | owner
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_on_call_contacts_client').on(table.clientId),
]);

export const onCallSchedule = pgTable('on_call_schedule', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  contactId: uuid('contact_id').notNull().references(() => onCallContacts.id),
  dayOfWeek: integer('day_of_week').notNull(), // 0=Sunday, 6=Saturday
  startTime: text('start_time').notNull(), // "08:00" (24h format)
  endTime: text('end_time').notNull(), // "17:00"
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_on_call_schedule_lookup').on(table.clientId, table.dayOfWeek),
]);

export const escalations = pgTable('escalations', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  originalContactId: uuid('original_contact_id').references(() => onCallContacts.id),
  type: text('type').notNull(), // emergency | booking | voicemail
  message: text('message').notNull(),
  sentTo: text('sent_to').notNull(), // phone number
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
  acknowledged: boolean('acknowledged').default(false),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  escalatedToOwner: boolean('escalated_to_owner').default(false),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_escalations_pending').on(table.clientId, table.acknowledged),
]);

export const pilotSignups = pgTable('pilot_signups', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessName: text('business_name').notNull(),
  ownerName: text('owner_name'),
  phone: text('phone').notNull(),
  industry: text('industry').default('plumbing'),
  status: text('status').default('pending'), // pending | contacted | converted | declined
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const googleOauthTokens = pgTable('google_oauth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id).unique(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  tokenType: text('token_type').default('Bearer'),
  scope: text('scope').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
