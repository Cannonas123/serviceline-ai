"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/* ─────────────────────────────────────────────── */
/*  ROI CALCULATOR                                  */
/* ─────────────────────────────────────────────── */
function Calculator() {
  const [calls, setCalls] = useState(40);
  const [ticket, setTicket] = useState(350);
  const missed = Math.round(calls * 0.62);
  const rescued = Math.round(missed * 0.85);
  const monthly = rescued * ticket;

  return (
    <Card className="border-amber-500/20 bg-card/60 backdrop-blur">
      <CardContent className="p-5 sm:p-6">
        <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-widest mb-5">
          How much are you losing?
        </p>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">Calls per month</span>
              <span className="font-mono text-white">{calls}</span>
            </div>
            <input type="range" min={10} max={200} value={calls}
              onChange={(e) => setCalls(Number(e.target.value))}
              className="w-full accent-amber-500 h-1.5 cursor-pointer" />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">Avg job value</span>
              <span className="font-mono text-white">${ticket}</span>
            </div>
            <input type="range" min={100} max={2000} step={50} value={ticket}
              onChange={(e) => setTicket(Number(e.target.value))}
              className="w-full accent-amber-500 h-1.5 cursor-pointer" />
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-white/5 space-y-2 text-[13px]">
          <div className="flex justify-between text-slate-500">
            <span>You&apos;re missing</span>
            <span className="font-mono text-slate-300">{missed} calls/mo</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>AI would rescue</span>
            <span className="font-mono text-slate-300">{rescued} calls/mo</span>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-amber-500/5 border border-amber-500/10 p-4 text-center">
          <p className="text-[11px] text-amber-500/70 uppercase tracking-wider">You&apos;re leaving on the table</p>
          <p className="mt-1 text-3xl sm:text-4xl font-bold font-mono text-amber-500 tracking-tight">
            ${monthly.toLocaleString()}
            <span className="text-sm font-normal text-amber-500/60">/mo</span>
          </p>
        </div>

        <Button asChild className="mt-4 w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold h-11 shadow-lg shadow-amber-500/25">
          <Link href="/dashboard/mikes-plumbing-demo/overview">
            See How It Works →
          </Link>
        </Button>
        <div className="mt-3 flex items-center justify-center gap-4">
          <a href="#pilot" className="text-[11px] text-amber-500/70 hover:text-amber-500 transition-colors underline underline-offset-2">
            or start your free pilot now
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────── */
/*  LEAD CAPTURE FORM                               */
/* ─────────────────────────────────────────────── */
function PilotForm() {
  const [formValues, setFormValues] = useState({ businessName: "", ownerName: "", phone: "", industry: "" });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValues.businessName || !formValues.phone) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/pilot-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValues),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="text-center py-8">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-white">You&apos;re in. We&apos;ll call you within 24 hours.</p>
        <p className="text-sm text-slate-400 mt-2 max-w-xs mx-auto">We&apos;ll set up your AI phone line, branded with your business name. You&apos;ll hear it yourself before it goes live.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {/* Industry pills */}
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { k: "plumbing", i: "🪠", l: "Plumbing" },
          { k: "hvac", i: "❄️", l: "HVAC" },
          { k: "pest", i: "🛡️", l: "Pest" },
          { k: "painting", i: "🎨", l: "Painting" },
          { k: "lawn", i: "🌿", l: "Lawn" },
          { k: "electrical", i: "⚡", l: "Electrical" },
        ].map((ind) => (
          <button key={ind.k} type="button"
            onClick={() => setFormValues({ ...formValues, industry: ind.k })}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition-all ${
              formValues.industry === ind.k
                ? "border-amber-500/50 bg-amber-500/10 text-white scale-[1.02]"
                : "border-white/5 bg-white/[0.02] text-slate-500 hover:border-white/10 hover:text-slate-300"
            }`}
          >
            <span>{ind.i}</span>{ind.l}
          </button>
        ))}
      </div>

      <Input placeholder="Business name" value={formValues.businessName}
        onChange={(e) => setFormValues({ ...formValues, businessName: e.target.value })}
        className="bg-white/[0.03] border-white/5 h-10 text-sm placeholder:text-slate-600 focus:border-amber-500/30" required />
      <Input placeholder="Your name" value={formValues.ownerName}
        onChange={(e) => setFormValues({ ...formValues, ownerName: e.target.value })}
        className="bg-white/[0.03] border-white/5 h-10 text-sm placeholder:text-slate-600 focus:border-amber-500/30" />
      <Input placeholder="Phone number" type="tel" value={formValues.phone}
        onChange={(e) => setFormValues({ ...formValues, phone: e.target.value })}
        className="bg-white/[0.03] border-white/5 h-10 text-sm placeholder:text-slate-600 focus:border-amber-500/30" required />

      <Button type="submit" disabled={status === "submitting"}
        className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold h-11 shadow-lg shadow-amber-500/25">
        {status === "submitting" ? "Sending..." : "Start My Free Pilot →"}
      </Button>
      {status === "error" && <p className="text-xs text-red-400 text-center">Something went wrong. Try again or call us.</p>}
      <p className="text-[11px] text-slate-600 text-center">14 days free · No credit card · No contracts</p>
    </form>
  );
}

/* ─────────────────────────────────────────────── */
/*  MAIN PAGE                                       */
/* ─────────────────────────────────────────────── */
export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ━━ NAV ━━ */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.04] bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-bold tracking-tight">ServiceLine<span className="text-amber-500">AI</span></span>
            <span className="hidden sm:block text-[11px] text-slate-600 border-l border-white/5 pl-2.5">Virginia, USA</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="#pilot" className="hidden sm:inline text-xs text-slate-400 hover:text-white transition-colors">Start Free Pilot</a>
            <Button asChild size="sm" className="bg-amber-500 hover:bg-amber-400 text-black font-medium h-8 px-3.5 text-xs">
              <Link href="/dashboard/mikes-plumbing-demo/overview">Live Demo</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ━━ HERO ━━ */}
      <section className="mx-auto max-w-6xl px-5">
        <div className="pt-14 sm:pt-20 pb-14 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">

          {/* Left — pitch */}
          <div className="lg:col-span-7">
            <Badge variant="outline" className="border-amber-500/20 text-amber-500 bg-amber-500/5 gap-1.5 text-[11px] py-1 mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Built in Virginia · US-based support
            </Badge>

            <h1 className="text-[2.5rem] sm:text-5xl lg:text-[3.25rem] font-bold tracking-tight leading-[1.1]">
              Stop losing money<br className="hidden sm:block" /> to{" "}
              <span className="text-amber-500">missed calls.</span>
            </h1>

            <p className="mt-5 text-[15px] sm:text-base text-slate-400 leading-relaxed max-w-lg">
              62% of calls to home service companies go unanswered. 85% of those
              callers never call back — they call your competitor. Our AI picks
              up in 10 seconds, books the job, and texts your tech a briefing
              card. You wake up to revenue, not voicemails.
            </p>

            {/* Trust chips */}
            <div className="mt-6 flex flex-wrap gap-2">
              {["14-day free pilot", "No contracts", "US-based team", "$1K revenue guarantee"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] px-3 py-1 text-[11px] text-slate-400">
                  <svg className="h-3 w-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                  {t}
                </span>
              ))}
            </div>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-amber-500 hover:bg-amber-400 text-black font-semibold h-12 px-6 shadow-lg shadow-amber-500/20">
                <Link href="/dashboard/mikes-plumbing-demo/overview">See a Live Dashboard →</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 px-6 border-white/10 text-slate-300 hover:bg-white/5">
                <a href="#pilot">Start Free Pilot</a>
              </Button>
            </div>

            {/* Metrics strip */}
            <div className="mt-10 grid grid-cols-4 gap-4 max-w-lg">
              {[
                { n: "92%", l: "booking rate" },
                { n: "<10s", l: "answer time" },
                { n: "24/7", l: "coverage" },
                { n: "6", l: "industries" },
              ].map((m) => (
                <div key={m.l}>
                  <p className="text-xl font-bold font-mono text-white">{m.n}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{m.l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — calculator */}
          <div className="lg:col-span-5">
            <Calculator />
          </div>
        </div>
      </section>

      {/* ━━ SOCIAL PROOF BAR ━━ */}
      <section className="border-y border-white/[0.04] bg-white/[0.01]">
        <div className="mx-auto max-w-6xl px-5 py-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[11px] text-slate-500">
          <span className="font-medium text-slate-400">Trusted by contractors in</span>
          {["Plumbing", "HVAC", "Pest Control", "Painting", "Lawn Care", "Electrical"].map((i) => (
            <span key={i} className="px-2.5 py-1 rounded-full border border-white/5 bg-white/[0.02]">{i}</span>
          ))}
        </div>
      </section>

      {/* ━━ HOW IT WORKS ━━ */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-widest mb-3">How it works</p>
        <h2 className="text-2xl sm:text-3xl font-bold max-w-md">Three steps. Zero missed calls.</h2>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            {
              n: "01", title: "We set up your AI line",
              body: "Branded with your business name. Knows your services, your hours, your service area. Takes less than a day.",
            },
            {
              n: "02", title: "AI answers when you can't",
              body: "Caller hears a friendly dispatcher — not a robot. Books the appointment, captures the address, texts your tech a job card.",
            },
            {
              n: "03", title: "You see every dollar rescued",
              body: "Dashboard shows calls handled, appointments booked, and revenue rescued. Updated daily. The number that makes you never cancel.",
              link: "/dashboard/mikes-plumbing-demo/overview",
              linkText: "See a live dashboard →",
            },
          ].map((s: { n: string; title: string; body: string; link?: string; linkText?: string }) => (
            <div key={s.n} className="group rounded-xl border border-white/[0.04] bg-white/[0.01] p-6 hover:border-amber-500/20 transition-colors">
              <span className="text-xs font-mono text-amber-500/50 group-hover:text-amber-500 transition-colors">{s.n}</span>
              <h3 className="mt-3 text-base font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{s.body}</p>
              {s.link && (
                <Link href={s.link} className="inline-block mt-3 text-xs text-amber-500 hover:text-amber-400 transition-colors">
                  {s.linkText}
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ━━ FEATURES ━━ */}
      <section className="border-y border-white/[0.04] bg-white/[0.01]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-widest mb-3">What you get</p>
          <h2 className="text-2xl sm:text-3xl font-bold max-w-md">Everything your front office needs. Nothing you don&apos;t.</h2>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { t: "AI Voice Agent", d: "Answers in your business name. Books appointments. Handles emergencies. Talks like a dispatcher, not a robot." },
              { t: "Call Briefing Cards", d: "Your tech gets a text — customer name, address, issue, urgency — before they knock on the door." },
              { t: "Emergency Triage", d: "Burst pipe at 2 AM? AI texts your on-call person instantly. No voicemail delay. No missed emergencies." },
              { t: "Revenue Rescued Dashboard", d: "See every call, every lead, every dollar. Updated daily. This is the number that pays for everything." },
              { t: "On-Call Routing", d: "Your weekday tech gets weekday calls. Weekend guy gets weekends. Falls back to you if nobody responds." },
              { t: "SMS Follow-Up Drip", d: "Missed leads get a 3-text sequence. Most book within 48 hours. Works while you sleep." },
              { t: "Review Harvesting", d: "After every job, AI texts the customer asking for a Google review. Watch your star rating climb." },
              { t: "Multi-Industry", d: "Plumbing, HVAC, pest, painting, lawn, electrical. Each gets industry-specific prompts, emergency rules, and FAQ." },
            ].map((f) => (
              <div key={f.t} className="p-5 rounded-lg border border-white/[0.04] bg-white/[0.01]">
                <h3 className="text-sm font-semibold text-white">{f.t}</h3>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━ TESTIMONIALS ━━ */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-widest mb-3">From real contractors</p>
        <h2 className="text-2xl sm:text-3xl font-bold">They stopped losing calls. So did their revenue.</h2>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            {
              q: "I didn't know I was missing 25 calls a month until I saw the dashboard. First month, the AI booked 12 appointments I would have lost to voicemail. That's over $4,000.",
              name: "Mike J.", co: "Mike's Plumbing & Drain", loc: "Austin, TX",
            },
            {
              q: "My wife used to answer the phone between jobs. Now the AI handles it and she gets her evenings back. Best $499 I spend every month — and it's not even close.",
              name: "Carlos R.", co: "CoolAir HVAC Solutions", loc: "Charlotte, NC",
            },
            {
              q: "The briefing cards are why I stay. My guys show up knowing the customer's name, the issue, and whether it's urgent. No more walking into surprises.",
              name: "Sarah C.", co: "Precision Plumbing Co.", loc: "Richmond, VA",
            },
          ].map((t) => (
            <Card key={t.name} className="border-white/[0.04] bg-white/[0.01]">
              <CardContent className="p-6">
                <div className="flex gap-0.5 mb-4">
                  {[1,2,3,4,5].map((s) => (
                    <svg key={s} className="h-3.5 w-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">&ldquo;{t.q}&rdquo;</p>
                <div className="mt-5 pt-4 border-t border-white/5">
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-[11px] text-slate-600">{t.co} · {t.loc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ━━ PRICING + SIGNUP ━━ */}
      <section id="pilot" className="border-y border-white/[0.04] bg-white/[0.01]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

            {/* Left — pricing */}
            <div>
              <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-widest mb-3">Pricing</p>
              <h2 className="text-2xl sm:text-3xl font-bold">Simple. Month-to-month. Cancel anytime.</h2>

              <div className="mt-8 space-y-4">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-sm font-semibold text-white">Starter</span>
                      <span className="text-xs text-slate-500 ml-2">Missed-call text-back + SMS + drip</span>
                    </div>
                    <span className="text-lg font-bold font-mono text-white">$199<span className="text-xs text-slate-500 font-normal">/mo</span></span>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-5 relative">
                  <Badge className="absolute -top-2.5 right-4 bg-amber-500 text-black text-[10px] font-semibold hover:bg-amber-500">Popular</Badge>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-sm font-semibold text-amber-500">Pro</span>
                      <span className="text-xs text-slate-500 ml-2">AI voice agent + everything</span>
                    </div>
                    <span className="text-lg font-bold font-mono text-white">$499<span className="text-xs text-slate-500 font-normal">/mo</span></span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Includes: AI voice answering, calendar booking, call briefing cards, emergency triage, on-call routing, SMS drip, review harvesting, Revenue Rescued dashboard.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-2 text-xs text-emerald-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>
                $1,000 Revenue Rescued Guarantee — first month free if we don&apos;t rescue $1K+ in potential revenue.
              </div>
            </div>

            {/* Right — signup form */}
            <div>
              <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-widest mb-3">Start your free pilot</p>
              <h3 className="text-lg font-semibold text-white mb-5">14 days. Full Pro features. No credit card.</h3>
              <Card className="border-amber-500/15 bg-card/60">
                <CardContent className="p-5 sm:p-6">
                  <PilotForm />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ━━ FAQ ━━ */}
      <section className="mx-auto max-w-3xl px-5 py-20">
        <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-widest mb-3 text-center">FAQ</p>
        <h2 className="text-2xl font-bold text-center mb-8">Questions contractors ask us</h2>

        <Accordion className="space-y-1.5">
          {[
            { q: "Does it actually sound good on the phone?", a: "Yes. Callers usually don't know it's AI until they ask. It uses natural speech, talks like a dispatcher (short and direct), and never says 'Great question!' or 'I'd be happy to help.' If someone asks if it's a robot, it says yes — honestly." },
            { q: "What happens during a real emergency?", a: "The AI detects emergency keywords — burst pipe, gas smell, flooding, sewage, no heat — and immediately texts your on-call person with the caller's info. No qualifying questions. No delay. Address and phone number, sent in seconds." },
            { q: "What if the AI can't help?", a: "'Let me have the owner call you right back.' Then it texts you. Every call has a path to a human. Callers are never stuck." },
            { q: "How long does setup take?", a: "About a day. We configure your AI with your business name, services, and service area. You get a phone number. You call it yourself. If you like what you hear, it goes live." },
            { q: "Do I need special equipment?", a: "No. You forward your existing number to the AI line, or use the AI number directly. Works with any phone. Takes 30 seconds." },
            { q: "What's the catch?", a: "No catch. 14-day pilot with full Pro features, no credit card. Plus a $1,000 Revenue Rescued Guarantee — if we don't rescue at least $1K in potential revenue in your first paid month, that month is free. Month-to-month after that. Cancel anytime." },
            { q: "Who builds this?", a: "A small team in Virginia. When you call us, you talk to a real person in the same time zone. Your data stays in the US. We built this because we got tired of watching good contractors lose jobs to voicemail." },
          ].map((f) => (
            <AccordionItem key={f.q} value={f.q} className="border border-white/[0.04] rounded-lg px-4 data-[state=open]:border-amber-500/15 data-[state=open]:bg-white/[0.01]">
              <AccordionTrigger className="text-sm font-medium text-left hover:no-underline py-4 text-slate-200">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-slate-500 leading-relaxed pb-4">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* ━━ FINAL CTA ━━ */}
      <section className="border-t border-white/[0.04]">
        <div className="mx-auto max-w-6xl px-5 py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">
            Every missed call costs you <span className="font-mono text-amber-500">$350</span>.
          </h2>
          <p className="mt-3 text-slate-500">How many did you miss this week?</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild size="lg" className="bg-amber-500 hover:bg-amber-400 text-black font-semibold h-12 px-8 shadow-lg shadow-amber-500/20">
              <a href="#pilot">Start Free Pilot →</a>
            </Button>
          </div>
        </div>
      </section>

      {/* ━━ FOOTER ━━ */}
      <footer className="border-t border-white/[0.04]">
        <div className="mx-auto max-w-6xl px-5 h-12 flex items-center justify-between text-[11px] text-slate-600">
          <span>Built for American contractors · Virginia, USA</span>
          <span>© 2026 ServiceLine AI</span>
        </div>
      </footer>

      {/* ━━ STICKY MOBILE CTA ━━ */}
      <div className="fixed bottom-0 left-0 right-0 sm:hidden border-t border-white/[0.06] bg-background/95 backdrop-blur-xl px-4 py-2.5 z-50">
        <div className="flex gap-2">
          <Button asChild className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold h-10 text-xs">
            <a href="#pilot">Start Free Pilot</a>
          </Button>
          <Button asChild variant="outline" className="h-10 px-3 border-white/10 text-slate-300 text-xs">
            <Link href="/dashboard/mikes-plumbing-demo/overview">Demo</Link>
          </Button>
        </div>
      </div>

      {/* Bottom padding for mobile sticky bar */}
      <div className="h-16 sm:hidden" />
    </div>
  );
}
