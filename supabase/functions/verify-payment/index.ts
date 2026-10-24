import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

async function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): Promise<boolean> {
  if (!RAZORPAY_KEY_SECRET) {
    // Dev mode: skip verification if no secret configured
    return true;
  }
  const text = orderId + "|" + paymentId;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(RAZORPAY_KEY_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expected === signature;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { booking_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!booking_id || !razorpay_payment_id) {
      return new Response(
        JSON.stringify({ error: "Missing payment data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const valid = await verifyRazorpaySignature(
      razorpay_order_id ?? "",
      razorpay_payment_id,
      razorpay_signature ?? ""
    );

    if (!valid) {
      await supabase.from("payments").update({ status: "failed" }).eq("booking_id", booking_id);
      return new Response(
        JSON.stringify({ error: "Payment signature verification failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark payment as paid
    await supabase.from("payments").update({
      status: "paid",
      razorpay_order_id,
      razorpay_payment_id,
    }).eq("booking_id", booking_id);

    // Mark booking as paid
    const { data: booking, error } = await supabase
      .from("bookings")
      .update({ status: "paid" })
      .eq("id", booking_id)
      .select("*")
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, booking }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
