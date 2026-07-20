const crypto = require("crypto");
const { google } = require("googleapis");

if (
  !process.env.GOOGLE_CALENDAR_CREDENTIALS ||
  !process.env.GOOGLE_CALENDAR_ID ||
  !process.env.GOOGLE_CALENDAR_TIMEZONE
) {
  throw new Error(
    "Missing Google Calendar environment variables."
  );
}

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_CALENDAR_CREDENTIALS,
  scopes: [
    "https://www.googleapis.com/auth/calendar.events"
  ]
});

const calendar = google.calendar({
  version: "v3",
  auth
});

function localDateTimeToUtc(
  localDateTime,
  timeZone
) {
  const match = String(localDateTime).match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );

  if (!match) {
    throw new Error(
      "Reservation pickup date/time is invalid."
    );
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second = "00"
  ] = match;

  let timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  const formatter = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }
  );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(timestamp))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );

    const representedTimestamp = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );

    timestamp -=
      representedTimestamp -
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      );
  }

  return new Date(timestamp);
}

function calculateEndDateTime(
  pickupDateTime,
  requestedHours,
  timeZone
) {
  const duration = Number(requestedHours);
  const durationHours =
    Number.isFinite(duration) && duration > 0
      ? Math.max(1, duration)
      : 2;

  const start = localDateTimeToUtc(
    pickupDateTime,
    timeZone
  );

  return new Date(
    start.getTime() +
      durationHours * 60 * 60 * 1000
  ).toISOString();
}

async function createReservationEvent({
  session,
  reservationId
}) {
  const metadata = session.metadata || {};
  const pickupDateTime = metadata.pickupDateTime;

  if (!pickupDateTime) {
    throw new Error(
      "Reservation has no pickup date/time."
    );
  }

  const eventId = crypto
    .createHash("sha256")
    .update(session.id)
    .digest("hex")
    .slice(0, 32);

  const description = [
    `Reservation ID: ${reservationId}`,
    `Payment status: ${session.payment_status || "unknown"}`,
    `Amount paid: $${(
      Number(session.amount_total || 0) / 100
    ).toFixed(2)}`,
    `Trip total: $${metadata.tripTotalDollars || "N/A"}`,
    `Remaining balance: $${metadata.remainingBalanceDollars || "0.00"}`,
    `Payment option: ${metadata.paymentOption || "N/A"}`,
    "",
    `Customer: ${metadata.customerName || "N/A"}`,
    `Phone: ${metadata.phone || "N/A"}`,
    `Email: ${metadata.email || session.customer_details?.email || "N/A"}`,
    `Drop-off: ${metadata.dropoffAddress || "N/A"}`,
    `Vehicle: ${metadata.vehicleChoice || metadata.vehicleKey || "N/A"}`,
    `Trip type: ${metadata.tripType || "N/A"}`,
    `Passengers: ${metadata.passengerCount || "N/A"}`,
    `Luggage: ${metadata.luggageCount || "N/A"}`,
    `Flight: ${metadata.flightNumber || "N/A"}`,
    `Special instructions: ${metadata.specialInstructions || "N/A"}`
  ].join("\n");

  try {
    const result = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      requestBody: {
        id: eventId,
        summary:
          `PAID — ${metadata.customerName || "Customer"} — ` +
          `${metadata.vehicleChoice || metadata.vehicleKey || "Vehicle"}`,
        description,
        location:
          metadata.pickupAddress ||
          "Pickup location pending",
        start: {
          dateTime: localDateTimeToUtc(
            pickupDateTime,
            process.env.GOOGLE_CALENDAR_TIMEZONE
          ).toISOString(),
          timeZone:
            process.env.GOOGLE_CALENDAR_TIMEZONE
        },
        end: {
          dateTime: calculateEndDateTime(
            pickupDateTime,
            metadata.requestedHours,
            process.env.GOOGLE_CALENDAR_TIMEZONE
          ),
          timeZone:
            process.env.GOOGLE_CALENDAR_TIMEZONE
        },
        extendedProperties: {
          private: {
            reservationId,
            stripeSessionId: session.id
          }
        }
      }
    });

    return {
      created: true,
      eventId: result.data.id
    };
  } catch (error) {
    if (
      error.code === 409 ||
      error.response?.status === 409
    ) {
      return {
        created: false,
        eventId
      };
    }

    throw error;
  }
}

module.exports = {
  createReservationEvent
};
