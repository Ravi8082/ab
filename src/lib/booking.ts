import { supabase } from '@/lib/supabase';

export interface CreateBookingInput {
  ticket_type_id: string;
  event_id: string;
  city_id?: string;
  persons: number;
  name: string;
  phone: string;
  email: string;
  coupon_code?: string;
}

export interface BookingResult {
  booking_id: string;
  booking_code: string;
  amount: number;
}

export async function createBooking(input: CreateBookingInput): Promise<BookingResult> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-booking`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(input),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || 'Failed to create booking');
  }

  return data.booking as BookingResult;
}

export async function verifyPayment(
  bookingId: string,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
): Promise<boolean> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      booking_id: bookingId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    }),
  });

  const data = await response.json();
  return response.ok && data.success;
}

export async function lookupBooking(phone?: string, bookingCode?: string): Promise<unknown[]> {
  const { data, error } = await supabase.rpc('lookup_booking', {
    p_phone: phone ?? null,
    p_booking_code: bookingCode ?? null,
  });

  if (error) throw new Error(error.message);
  const result = data as unknown;
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object') return [result];
  return [];
}

declare global {
  interface Window {
    Razorpay?: unknown;
  }
}

let razorpayScriptLoaded = false;

export function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (razorpayScriptLoaded && window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => {
      razorpayScriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Razorpay'));
    document.body.appendChild(script);
  });
}

export async function openRazorpayCheckout(
  amount: number,
  bookingId: string,
  bookingCode: string,
  customerName: string,
  customerEmail: string,
  customerPhone: string,
  onSuccess: (paymentId: string, orderId: string, signature: string) => void,
  onFailure: (error: string) => void
): Promise<void> {
  await loadRazorpayScript();

  // In dev mode without Razorpay key configured, simulate success
  const razorpayKeyId = import.meta.env.VITE_RAZORPAY_KEY_ID;

  if (!razorpayKeyId || !window.Razorpay) {
    // Dev simulation
    setTimeout(() => {
      onSuccess('pay_dev_simulated', 'order_dev_simulated', 'sig_dev_simulated');
    }, 1500);
    return;
  }

  const options = {
    key: razorpayKeyId,
    amount: amount * 100,
    currency: 'INR',
    name: 'Adhyatmik Bharat',
    description: `Booking ${bookingCode}`,
    prefill: {
      name: customerName,
      email: customerEmail,
      contact: customerPhone,
    },
    theme: { color: '#E8891D' },
    handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
      onSuccess(response.razorpay_payment_id, response.razorpay_order_id, response.razorpay_signature);
    },
    modal: {
      ondismiss: () => onFailure('Payment cancelled'),
    },
  };

  const rzp = new (window.Razorpay as typeof RazorpayConstructor)(options);
  rzp.open();
}

// Minimal type for the Razorpay constructor
type RazorpayConstructor = new (options: unknown) => { open: () => void };
