import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_PAYLOAD_BYTES = 200 * 1024;

type SubmitPayload = {
  clinic_code: string;
  schema_version: string;
  answers: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_PAYLOAD_BYTES) {
    return jsonResponse({ ok: false, error: "Payload too large" }, 413);
  }

  let payload: SubmitPayload;
  try {
    payload = JSON.parse(rawBody) as SubmitPayload;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const expectedClinicCode = Deno.env.get("CLINIC_SUBMIT_CODE");
  if (!expectedClinicCode || payload.clinic_code !== expectedClinicCode) {
    return jsonResponse({ ok: false, error: "Invalid clinic code" }, 401);
  }

  if (typeof payload.schema_version !== "string" || payload.schema_version.trim() === "") {
    return jsonResponse({ ok: false, error: "schema_version is required" }, 400);
  }

  if (
    payload.answers === null ||
    typeof payload.answers !== "object" ||
    Array.isArray(payload.answers)
  ) {
    return jsonResponse({ ok: false, error: "answers must be an object" }, 400);
  }

  const projectUrl = Deno.env.get("PROJECT_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");

  if (!projectUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: "Server misconfiguration" }, 500);
  }

  const supabase = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const meta = {
    ...(payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta)
      ? payload.meta
      : {}),
    submitted_at: new Date().toISOString(),
    user_agent: request.headers.get("user-agent"),
    tz_offset_minutes:
      payload.meta && typeof payload.meta.tz_offset_minutes === "number"
        ? payload.meta.tz_offset_minutes
        : null,
  };

  const { data, error } = await supabase
    .from("submissions")
    .insert({
      schema_version: payload.schema_version,
      answers: payload.answers,
      meta,
    })
    .select("id")
    .single();

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  return jsonResponse({ ok: true, id: data.id }, 200);
});
