import bcrypt from "bcryptjs";
import { db, schema } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import IndustryServiceSelector from "@/components/admin/IndustryServiceSelector";
import { getTemplateOrThrow } from "@serviceline/templates";
import { requireAdminSession } from "@/lib/auth";

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
}

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateTwilioPhone(): string {
  let digits = "";
  for (let i = 0; i < 7; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return `+1555${digits}`;
}

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; pin?: string; slug?: string; clientId?: string }>;
}) {
  const params = await searchParams;

  if (params.success === "1") {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white">Client Created</h1>
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-8 max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
              <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white">Client created successfully!</h2>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 mb-6">
            <p className="text-sm font-medium text-amber-400">
              Save this PIN (shown only once):
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-500 font-mono tracking-wider">
              {params.pin}
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Dashboard URL</p>
              <p className="mt-1 text-sm text-white font-mono">/dashboard/{params.slug}</p>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <Link
              href={`/admin/clients/${params.clientId}`}
              className="inline-flex items-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-400 transition-colors"
            >
              View Client
            </Link>
            <Link
              href="/admin/clients"
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
            >
              All Clients
            </Link>
          </div>
        </div>
      </div>
    );
  }

  async function createClient(formData: FormData) {
    "use server";
    await requireAdminSession();

    const name = formData.get("name") as string;
    const ownerName = formData.get("ownerName") as string;
    const ownerPhone = formData.get("ownerPhone") as string;
    const serviceArea = formData.get("serviceArea") as string;
    const plan = formData.get("plan") as string;
    const industry = (formData.get("industry") as string) || "plumbing";
    const aiSystemPrompt = (formData.get("aiSystemPrompt") as string) || null;

    const template = getTemplateOrThrow(industry);
    const services = template.services.filter(
      (s: string) => formData.get(`service_${s}`) === "on"
    );

    if (!name || !ownerName || !ownerPhone) {
      throw new Error("Missing required fields");
    }

    const slug = generateSlug(name);
    const pin = generatePin();
    const twilioPhone = generateTwilioPhone();

    const defaultBusinessHours = {
      monday: { open: "08:00", close: "17:00" },
      tuesday: { open: "08:00", close: "17:00" },
      wednesday: { open: "08:00", close: "17:00" },
      thursday: { open: "08:00", close: "17:00" },
      friday: { open: "08:00", close: "17:00" },
      saturday: { open: "09:00", close: "14:00" },
      sunday: null,
    };

    const [client] = await db
      .insert(schema.clients)
      .values({
        name,
        slug,
        ownerName,
        ownerPhone,
        forwardPhone: ownerPhone,
        twilioPhone,
        businessHours: defaultBusinessHours,
        industry,
        services: services.length > 0 ? services : [template.services[0]],
        serviceArea: serviceArea || "Austin, TX and surrounding areas",
        avgTicketValue: template.defaultTicketValue.toString(),
        aiSystemPrompt,
        plan: plan || "starter",
        dashboardPin: await bcrypt.hash(pin, 10),
        status: "active",
      })
      .returning();

    redirect(
      `/admin/clients/new?success=1&pin=${pin}&slug=${slug}&clientId=${client.id}`
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">New Client</h1>
          <p className="mt-1 text-sm text-slate-500">
            Add a new ServiceLine AI customer
          </p>
        </div>
        <Link
          href="/admin/clients"
          className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
        >
          Cancel
        </Link>
      </div>

      <form action={createClient} className="mt-8 max-w-2xl">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-6">
          {/* Business Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-300">
              Business Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              placeholder="Mike's Plumbing & Heating"
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          {/* Owner Name */}
          <div>
            <label htmlFor="ownerName" className="block text-sm font-medium text-slate-300">
              Owner Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="ownerName"
              name="ownerName"
              required
              placeholder="Mike Johnson"
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          {/* Owner Phone */}
          <div>
            <label htmlFor="ownerPhone" className="block text-sm font-medium text-slate-300">
              Owner Phone <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="ownerPhone"
              name="ownerPhone"
              required
              placeholder="+15551234567"
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          {/* Service Area */}
          <div>
            <label htmlFor="serviceArea" className="block text-sm font-medium text-slate-300">
              Service Area
            </label>
            <input
              type="text"
              id="serviceArea"
              name="serviceArea"
              defaultValue="Austin, TX and surrounding areas"
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          {/* Industry + Services + AI Prompt (client component) */}
          <IndustryServiceSelector />

          {/* Plan */}
          <fieldset>
            <legend className="block text-sm font-medium text-slate-300">
              Plan
            </legend>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-3 cursor-pointer hover:border-slate-600 transition-colors flex-1">
                <input
                  type="radio"
                  name="plan"
                  value="starter"
                  defaultChecked
                  className="h-4 w-4 border-slate-600 text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <p className="text-sm font-medium text-white">Starter</p>
                  <p className="text-xs text-slate-500">$199/mo</p>
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-3 cursor-pointer hover:border-slate-600 transition-colors flex-1">
                <input
                  type="radio"
                  name="plan"
                  value="pro"
                  className="h-4 w-4 border-slate-600 text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <p className="text-sm font-medium text-white">Pro</p>
                  <p className="text-xs text-slate-500">$499/mo</p>
                </div>
              </label>
            </div>
          </fieldset>
        </div>

        {/* Submit */}
        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-medium text-black hover:bg-amber-400 transition-colors shadow-sm"
          >
            Create Client
          </button>
          <Link
            href="/admin/clients"
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
