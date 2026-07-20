require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const path = require("path");
const Stripe = require("stripe");
const { processCompletedCheckout } = require("./reservation-workflow");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const BASE_URL = String(
  process.env.BASE_URL ||
    process.env.DOMAIN ||
    "http://localhost:3000"
).replace(/\/$/, "");

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY environment variable.");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/*
|--------------------------------------------------------------------------
| BlackShield pricing
|--------------------------------------------------------------------------
*/

const AIRPORT_RATES = {
  zone1: {
    sedan: 75,
    suv: 100
  },
  zone2: {
    sedan: 100,
    suv: 125
  },
  zone3: {
    sedan: 150,
    suv: 175
  }
};

const HOURLY_RATES = {
  sedan: {
    hourlyRate: 75,
    minimumHours: 2
  },
  suv: {
    hourlyRate: 90,
    minimumHours: 2
  },
  sprinter: {
    hourlyRate: 125,
    minimumHours: 4
  },
  stretch: {
    hourlyRate: 125,
    minimumHours: 4
  },
  minibus: {
    hourlyRate: 150,
    minimumHours: 4
  }
};

const VEHICLE_LABELS = {
  sedan: "Luxury Sedan",
  suv: "Luxury SUV",
  sprinter: "Executive Sprinter Van",
  stretch: "Stretch Limousine",
  minibus: "Mini Bus"
};

const PAYMENT_PERCENTAGES = {
  full: 1,
  deposit_25: 0.25,
  deposit_50: 0.5
};

/*
|--------------------------------------------------------------------------
| Stripe webhook
|--------------------------------------------------------------------------
| This route must remain above express.json().
*/

app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers["stripe-signature"];

    if (!webhookSecret) {
      return res.status(500).send("Webhook secret is not configured.");
    }

    if (!signature) {
      return res.status(400).send("Missing Stripe signature.");
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        webhookSecret
      );
    } catch (error) {
      console.error("Stripe signature error:", error.message);
      return res.status(400).send("Invalid webhook signature.");
    }

    const paidCheckoutEvents = new Set([
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded"
    ]);

    if (paidCheckoutEvents.has(event.type)) {
      try {
        const result = await processCompletedCheckout({
          session: event.data.object,
          stripeEventId: event.id
        });

        console.log("Reservation workflow result:", {
          stripeEventId: event.id,
          processed: result.processed,
          reservationId: result.reservationId || null,
          reason: result.reason || null
        });
      } catch (error) {
        console.error("Reservation workflow failed:", error.message);
        return res.status(500).send("Reservation workflow failed.");
      }
    }

    return res.json({ received: true });
  }
);

/*
|--------------------------------------------------------------------------
| Security middleware
|--------------------------------------------------------------------------
*/

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

const pricingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error:
      "Too many pricing requests. Please wait and try again."
  }
});

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error:
      "Too many checkout attempts. Please wait and try again."
  }
});

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname)));

app.use("/calculate-price", pricingLimiter);
app.use("/create-checkout-session", checkoutLimiter);

/*
|--------------------------------------------------------------------------
| Helper functions
|--------------------------------------------------------------------------
*/

function cleanText(value, maximumLength = 500) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maximumLength);
}

function normalizeVehicle(vehicleChoice) {
  const value = cleanText(
    vehicleChoice,
    100
  ).toLowerCase();

  if (
    value.includes("xts") ||
    value.includes("sedan")
  ) {
    return "sedan";
  }

  if (
    value.includes("escalade") ||
    value.includes("suv")
  ) {
    return "suv";
  }

  if (value.includes("sprinter")) {
    return "sprinter";
  }

  if (
    value.includes("stretch") ||
    value.includes("limousine")
  ) {
    return "stretch";
  }

  if (
    value.includes("mini bus") ||
    value.includes("minibus") ||
    value.includes("party bus")
  ) {
    return "minibus";
  }

  throw new Error("Please select a valid vehicle.");
}

function normalizeZone(zone) {
  const value = cleanText(zone, 20)
    .toLowerCase()
    .replace(/\s+/g, "");

  const zoneMap = {
    "1": "zone1",
    zone1: "zone1",
    "2": "zone2",
    zone2: "zone2",
    "3": "zone3",
    zone3: "zone3"
  };

  const normalizedZone = zoneMap[value];

  if (!normalizedZone) {
    throw new Error(
      "Please select a valid airport zone."
    );
  }

  return normalizedZone;
}

function normalizePaymentOption(paymentOption) {
  const option = cleanText(
    paymentOption,
    30
  ).toLowerCase();

  if (
    !Object.prototype.hasOwnProperty.call(
      PAYMENT_PERCENTAGES,
      option
    )
  ) {
    throw new Error(
      "Please select a valid payment option."
    );
  }

  return option;
}

function isSameDayOrImmediateReservation(
  pickupDateTime
) {
  const pickupDate = new Date(pickupDateTime);

  if (Number.isNaN(pickupDate.getTime())) {
    throw new Error(
      "Please enter a valid pickup date and time."
    );
  }

  const hoursUntilPickup =
    (pickupDate.getTime() - Date.now()) /
    (1000 * 60 * 60);

  if (hoursUntilPickup < 0) {
    throw new Error(
      "Pickup time cannot be in the past."
    );
  }

  return hoursUntilPickup <= 24;
}

function calculateTripPrice({
  tripType,
  vehicleKey,
  zone,
  requestedHours
}) {
  const normalizedTripType = cleanText(
    tripType,
    100
  ).toLowerCase();

  if (normalizedTripType.includes("airport")) {
    if (!["sedan", "suv"].includes(vehicleKey)) {
      throw new Error(
        "Sprinter, limousine, and mini-bus airport reservations require hourly service."
      );
    }

    const normalizedZone = normalizeZone(zone);

    const totalDollars =
      AIRPORT_RATES[normalizedZone][vehicleKey];

    return {
      serviceType: "airport",
      totalDollars,
      rateDescription: `${normalizedZone.replace(
        "zone",
        "Zone "
      )} airport transfer`
    };
  }

  const isHourlyService =
    normalizedTripType.includes("hourly") ||
    normalizedTripType.includes("corporate") ||
    normalizedTripType.includes("security") ||
    normalizedTripType.includes("special event");

  if (isHourlyService) {
    const rate = HOURLY_RATES[vehicleKey];
    const submittedHours = Number(requestedHours);

    if (
      !Number.isFinite(submittedHours) ||
      submittedHours <= 0
    ) {
      throw new Error(
        "Please enter the number of service hours."
      );
    }

    const billableHours = Math.max(
      Math.ceil(submittedHours),
      rate.minimumHours
    );

    return {
      serviceType: "hourly",
      totalDollars:
        billableHours * rate.hourlyRate,
      billableHours,
      hourlyRate: rate.hourlyRate,
      minimumHours: rate.minimumHours,
      rateDescription: `${billableHours} hours at $${rate.hourlyRate} per hour`
    };
  }

  throw new Error(
    "This trip requires a custom quote. Please call BlackShield Transportation."
  );
}

function calculateAmountDue(
  totalDollars,
  paymentOption
) {
  const percentage =
    PAYMENT_PERCENTAGES[paymentOption];

  return Math.round(
    totalDollars * percentage * 100
  );
}

function paymentOptionLabel(paymentOption) {
  const labels = {
    full: "Full Payment",
    deposit_25: "25% Reservation Deposit",
    deposit_50: "50% Reservation Deposit"
  };

  return labels[paymentOption];
}

/*
|--------------------------------------------------------------------------
| Price calculation
|--------------------------------------------------------------------------
*/

app.post("/calculate-price", (req, res) => {
  try {
    const vehicleKey = normalizeVehicle(
      req.body.vehicleChoice
    );

    const pricing = calculateTripPrice({
      tripType: req.body.tripType,
      vehicleKey,
      zone: req.body.zone,
      requestedHours: req.body.requestedHours
    });

    return res.json({
      vehicleKey,
      vehicleLabel: VEHICLE_LABELS[vehicleKey],
      totalDollars: pricing.totalDollars,
      totalFormatted: `$${pricing.totalDollars.toFixed(
        2
      )}`,
      rateDescription: pricing.rateDescription,
      minimumHours:
        pricing.minimumHours || null,
      billableHours:
        pricing.billableHours || null
    });
  } catch (error) {
    return res.status(400).json({
      error:
        error.message ||
        "Unable to calculate reservation price."
    });
  }
});

/*
|--------------------------------------------------------------------------
| Stripe Checkout
|--------------------------------------------------------------------------
*/

app.post(
  "/create-checkout-session",
  async (req, res) => {
    try {
      const customerName = cleanText(
        req.body.customerName,
        100
      );

      const phone = cleanText(
        req.body.phone,
        40
      );

      const email = cleanText(
        req.body.email,
        150
      ).toLowerCase();

      const pickupDateTime = cleanText(
        req.body.pickupDateTime,
        80
      );

      const pickupAddress = cleanText(
        req.body.pickupAddress,
        250
      );

      const dropoffAddress = cleanText(
        req.body.dropoffAddress,
        250
      );

      const vehicleChoice = cleanText(
        req.body.vehicleChoice,
        100
      );

      const tripType = cleanText(
        req.body.tripType,
        100
      );

      const passengerCount = cleanText(
        req.body.passengerCount,
        10
      );

      const luggageCount = cleanText(
        req.body.luggageCount || "0",
        10
      );

      const flightNumber = cleanText(
        req.body.flightNumber || "N/A",
        50
      );

      const specialInstructions = cleanText(
        req.body.specialInstructions || "N/A",
        500
      );

      const zone = cleanText(
        req.body.zone,
        20
      );

      const requestedHours = cleanText(
        req.body.requestedHours,
        10
      );

      if (
        !customerName ||
        !phone ||
        !email ||
        !pickupDateTime ||
        !pickupAddress ||
        !dropoffAddress ||
        !vehicleChoice ||
        !passengerCount ||
        !tripType
      ) {
        return res.status(400).json({
          error:
            "Please complete all required reservation fields."
        });
      }

      const vehicleKey =
        normalizeVehicle(vehicleChoice);

      let paymentOption =
        normalizePaymentOption(
          req.body.paymentOption
        );

      const pricing = calculateTripPrice({
        tripType,
        vehicleKey,
        zone,
        requestedHours
      });

      if (
        isSameDayOrImmediateReservation(
          pickupDateTime
        )
      ) {
        paymentOption = "full";
      }

      const amountDueCents =
        calculateAmountDue(
          pricing.totalDollars,
          paymentOption
        );

      if (amountDueCents < 50) {
        throw new Error(
          "The payment amount is below Stripe’s minimum."
        );
      }

      const reservationId = `BS-${crypto
        .randomUUID()
        .split("-")[0]
        .toUpperCase()}`;

      const remainingBalance =
        pricing.totalDollars -
        amountDueCents / 100;

      const session =
        await stripe.checkout.sessions.create({
          mode: "payment",
          customer_email: email,
          client_reference_id: reservationId,

          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: amountDueCents,
                product_data: {
                  name: `${paymentOptionLabel(
                    paymentOption
                  )} — ${
                    VEHICLE_LABELS[vehicleKey]
                  }`,
                  description: `${pricing.rateDescription}. Trip total: $${pricing.totalDollars.toFixed(
                    2
                  )}.`
                }
              },
              quantity: 1
            }
          ],

          success_url:
            `${BASE_URL}/success.html` +
            `?session_id={CHECKOUT_SESSION_ID}` +
            `&reservation_id=${reservationId}`,

          cancel_url:
            `${BASE_URL}/cancel.html`,

          billing_address_collection: "auto",

          phone_number_collection: {
            enabled: true
          },

          metadata: {
            reservationId,
            customerName,
            phone,
            email,
            pickupDateTime,
            pickupAddress,
            dropoffAddress,
            vehicleKey,
            vehicleChoice,
            passengerCount,
            luggageCount,
            flightNumber,
            tripType,
            zone: zone || "N/A",
            requestedHours:
              requestedHours || "N/A",
            paymentOption,
            tripTotalDollars:
              pricing.totalDollars.toFixed(2),
            amountDueDollars:
              (amountDueCents / 100).toFixed(2),
            remainingBalanceDollars:
              remainingBalance.toFixed(2),
            specialInstructions
          },

          payment_intent_data: {
            description:
              `${paymentOptionLabel(
                paymentOption
              )} for BlackShield reservation ${reservationId}`,

            metadata: {
              reservationId,
              customerName,
              phone,
              pickupDateTime,
              vehicleKey,
              tripType,
              paymentOption,
              tripTotalDollars:
                pricing.totalDollars.toFixed(2),
              remainingBalanceDollars:
                remainingBalance.toFixed(2)
            }
          }
        });

      return res.json({
        url: session.url,
        reservationId,
        tripTotal: pricing.totalDollars,
        amountDue: amountDueCents / 100,
        paymentOption
      });
    } catch (error) {
      console.error(
        "Stripe Checkout error:",
        error
      );

      return res.status(400).json({
        error:
          error.message ||
          "Unable to start payment. Please call BlackShield Transportation."
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| Health check and fallback
|--------------------------------------------------------------------------
*/

app.get("/health", (req, res) => {
  const services = {
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    supabase: Boolean(
      process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
    ),
    resend: Boolean(
      process.env.RESEND_API_KEY &&
      process.env.RESERVATION_FROM_EMAIL &&
      process.env.RESERVATION_TO_EMAIL
    ),
    googleCalendar: Boolean(
      process.env.GOOGLE_CALENDAR_CREDENTIALS &&
      process.env.GOOGLE_CALENDAR_ID &&
      process.env.GOOGLE_CALENDAR_TIMEZONE
    )
  };

  const healthy = Object.values(services).every(Boolean);

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    service: "BlackShield Transportation",
    integrations: services
  });
});

app.get("*", (req, res) => {
  return res
    .status(404)
    .sendFile(
      path.join(__dirname, "index.html")
    );
});

app.listen(PORT, () => {
  console.log(
    `BlackShield server running on port ${PORT}`
  );

  console.log(`Website URL: ${BASE_URL}`);
});
