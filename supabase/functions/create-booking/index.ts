import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { ticket_type_id, city_id, event_id, persons, name, phone, email, coupon_code } = body;

    if (!ticket_type_id || !event_id || !name || !phone || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call the security definer function to create the booking
    const { data, error } = await supabase.rpc("create_booking", {
      p_data: {
        ticket_type_id,
        city_id: city_id || null,
        event_id,
        persons,
        name,
        phone,
        email,
        coupon_code: coupon_code || null,
      },
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a payment record
    const { error: payErr } = await supabase.from("payments").insert({
      booking_id: data.booking_id,
      razorpay_order_id: null,
      status: "created",
      amount: data.amount,
    });

    if (payErr) {
      console.error("Payment record error:", payErr);
    }

    return new Response(
      JSON.stringify({ success: true, booking: data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
