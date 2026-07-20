const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");
const {
  createReservationEvent,
  localDateTimeToUtc
} = require("./calendar");

const requiredVariables = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "RESEND_API_KEY",
  "RESERVATION_FROM_EMAIL",
  "RESERVATION_TO_EMAIL",
  "GOOGLE_CALENDAR_TIMEZONE"
];

const missingVariables = requiredVariables.filter(
  (name) => !process.env[name]
);

if (missingVariables.length > 0) {
  throw new Error(
    "Missing reservation workflow environment variables: " +
      missingVariables.join(", ")
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const resend = new Resend(process.env.RESEND_API_KEY);

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : null;
}

function customerEmail(session) {
  return (
    session.metadata?.email ||
    session.customer_details?.email ||
    session.customer_email ||
    ""
  ).trim().toLowerCase();
}

function reservationReference(session) {
  return (
    session.client_reference_id ||
    session.metadata?.reservationId ||
    ""
  ).trim();
}

function paymentRecord(session, stripeEventId) {
  const metadata = session.metadata || {};
  const reservationId = reservationReference(session);

  if (!reservationId) {
    throw new Error("Stripe session has no reservation ID.");
  }

  if (!customerEmail(session)) {
    throw new Error("Stripe session has no customer email.");
  }

  if (!metadata.pickupDateTime) {
    throw new Error("Stripe session has no pickup date/time.");
  }

  return {
    reservation_id: reservationId,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || null,
    last_stripe_event_id: stripeEventId,
    customer_name: metadata.customerName || "Customer",
    customer_email: customerEmail(session),
    customer_phone: metadata.phone || null,
    pickup_at: localDateTimeToUtc(
      metadata.pickupDateTime,
      process.env.GOOGLE_CALENDAR_TIMEZONE
    ).toISOString(),
    pickup_local: metadata.pickupDateTime,
    pickup_address: metadata.pickupAddress || null,
    dropoff_address: metadata.dropoffAddress || null,
    vehicle_key: metadata.vehicleKey || null,
    vehicle_choice: metadata.vehicleChoice || null,
    trip_type: metadata.tripType || null,
    airport_zone:
      metadata.zone && metadata.zone !== "N/A"
        ? metadata.zone
        : null,
    requested_hours: numberOrNull(metadata.requestedHours),
    passenger_count: integerOrNull(metadata.passengerCount),
    luggage_count: integerOrNull(metadata.luggageCount),
    flight_number:
      metadata.flightNumber && metadata.flightNumber !== "N/A"
        ? metadata.flightNumber
        : null,
    special_instructions:
      metadata.specialInstructions &&
      metadata.specialInstructions !== "N/A"
        ? metadata.specialInstructions
        : null,
    payment_option: metadata.paymentOption || null,
    currency: session.currency || "usd",
    trip_total: numberOrNull(metadata.tripTotalDollars),
    amount_paid: Number(session.amount_total || 0) / 100,
    remaining_balance:
      numberOrNull(metadata.remainingBalanceDollars) || 0,
    payment_status: session.payment_status || "paid",
    reservation_status: "pending_confirmation",
    workflow_status: "processing",
    workflow_error: null,
    updated_at: new Date().toISOString()
  };
}

async function savePayment(session, stripeEventId) {
  const { data, error } = await supabase
    .from("reservations")
    .upsert(paymentRecord(session, stripeEventId), {
      onConflict: "stripe_checkout_session_id"
    })
    .select("*")
    .single();

  if (error) {
    throw new Error("Supabase reservation save failed: " + error.message);
  }

  return data;
}

async function updateReservation(sessionId, changes) {
  const { data, error } = await supabase
    .from("reservations")
    .update({
      ...changes,
      updated_at: new Date().toISOString()
    })
    .eq("stripe_checkout_session_id", sessionId)
    .select("*")
    .single();

  if (error) {
    throw new Error("Supabase reservation update failed: " + error.message);
  }

  return data;
}

function ownerEmailText(session, reservationId) {
  const metadata = session.metadata || {};
  const amountPaid = (Number(session.amount_total || 0) / 100).toFixed(2);

  return [
    "BLACKSHIELD TRANSPORTATION — PAYMENT RECEIVED",
    "",
    "Reservation ID: " + reservationId,
    "Stripe session: " + session.id,
    "Payment status: " + (session.payment_status || "unknown"),
    "Amount paid: $" + amountPaid,
    "Trip total: $" + (metadata.tripTotalDollars || "N/A"),
    "Remaining balance: $" +
      (metadata.remainingBalanceDollars || "0.00"),
    "Payment option: " + (metadata.paymentOption || "N/A"),
    "",
    "Customer: " + (metadata.customerName || "N/A"),
    "Phone: " + (metadata.phone || "N/A"),
    "Email: " + (customerEmail(session) || "N/A"),
    "",
    "Pickup date/time: " + (metadata.pickupDateTime || "N/A"),
    "Pickup address: " + (metadata.pickupAddress || "N/A"),
    "Drop-off address: " + (metadata.dropoffAddress || "N/A"),
    "Trip type: " + (metadata.tripType || "N/A"),
    "Vehicle: " +
      (metadata.vehicleChoice || metadata.vehicleKey || "N/A"),
    "Passengers: " + (metadata.passengerCount || "N/A"),
    "Luggage: " + (metadata.luggageCount || "N/A"),
    "Flight number: " + (metadata.flightNumber || "N/A"),
    "Airport zone: " + (metadata.zone || "N/A"),
    "Requested hours: " + (metadata.requestedHours || "N/A"),
    "",
    "Special instructions: " +
      (metadata.specialInstructions || "N/A")
  ].join("\n");
}

function customerEmailText(session, reservationId) {
  const metadata = session.metadata || {};
  const amountPaid = (Number(session.amount_total || 0) / 100).toFixed(2);

  return [
    "Thank you for choosing BlackShield Transportation.",
    "",
    "We received your payment and reservation request.",
    "Your reservation remains pending until BlackShield confirms vehicle availability.",
    "",
    "Reservation ID: " + reservationId,
    "Amount paid: $" + amountPaid,
    "Trip total: $" + (metadata.tripTotalDollars || "N/A"),
    "Remaining balance: $" +
      (metadata.remainingBalanceDollars || "0.00"),
    "Payment option: " + (metadata.paymentOption || "N/A"),
    "",
    "Pickup date/time: " + (metadata.pickupDateTime || "N/A"),
    "Pickup address: " + (metadata.pickupAddress || "N/A"),
    "Drop-off address: " + (metadata.dropoffAddress || "N/A"),
    "Vehicle: " +
      (metadata.vehicleChoice || metadata.vehicleKey || "N/A"),
    "Service: " + (metadata.tripType || "N/A"),
    "",
    "BlackShield Transportation will contact you with final confirmation.",
    "Questions? Call 678-743-5639 or reply to this email."
  ].join("\n");
}

async function sendEmail(payload, idempotencyKey) {
  const result = await resend.emails.send(payload, { idempotencyKey });

  if (result.error) {
    throw new Error(
      result.error.message || "Resend rejected the email."
    );
  }

  return result.data?.id || null;
}

async function processCompletedCheckout({ session, stripeEventId }) {
  if (session.payment_status !== "paid") {
    return { processed: false, reason: "payment_not_paid" };
  }

  const reservationId = reservationReference(session);
  let reservation = await savePayment(session, stripeEventId);

  try {
    const calendarResult = await createReservationEvent({
      session,
      reservationId
    });

    reservation = await updateReservation(session.id, {
      google_calendar_event_id: calendarResult.eventId
    });

    if (!reservation.owner_email_sent_at) {
      const ownerEmailId = await sendEmail(
        {
          from: process.env.RESERVATION_FROM_EMAIL,
          to: [process.env.RESERVATION_TO_EMAIL],
          replyTo: customerEmail(session),
          subject:
            "PAID RESERVATION " +
            reservationId +
            " — " +
            (session.metadata?.customerName || "Customer"),
          text: ownerEmailText(session, reservationId)
        },
        "blackshield-owner/" + session.id
      );

      reservation = await updateReservation(session.id, {
        owner_email_id: ownerEmailId,
        owner_email_sent_at: new Date().toISOString()
      });
    }

    if (!reservation.customer_email_sent_at) {
      const customerEmailId = await sendEmail(
        {
          from: process.env.RESERVATION_FROM_EMAIL,
          to: [customerEmail(session)],
          replyTo: process.env.RESERVATION_TO_EMAIL,
          subject:
            "Payment received — BlackShield reservation " +
            reservationId,
          text: customerEmailText(session, reservationId)
        },
        "blackshield-customer/" + session.id
      );

      reservation = await updateReservation(session.id, {
        customer_email_id: customerEmailId,
        customer_email_sent_at: new Date().toISOString()
      });
    }

    reservation = await updateReservation(session.id, {
      workflow_status: "completed",
      workflow_error: null,
      processed_at: new Date().toISOString()
    });

    return {
      processed: true,
      reservationId,
      calendarEventId: reservation.google_calendar_event_id
    };
  } catch (error) {
    try {
      await updateReservation(session.id, {
        workflow_status: "failed",
        workflow_error: String(error.message || error).slice(0, 1000)
      });
    } catch (updateError) {
      console.error(
        "Unable to record workflow failure:",
        updateError.message
      );
    }

    throw error;
  }
}

module.exports = { processCompletedCheckout };
