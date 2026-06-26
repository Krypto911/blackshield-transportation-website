require("dotenv").config();

const express = require("express");
const Stripe = require("stripe");
const path = require("path");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(express.json());
app.use(express.static(__dirname));

app.post("/create-checkout-session", async (req, res) => {
  try {
    const {
      customerName,
      phone,
      email,
      pickupDateTime,
      pickupAddress,
      dropoffAddress,
      vehicleChoice,
      passengerCount,
      luggageCount,
      flightNumber,
      tripType,
      specialInstructions
    } = req.body;

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
        error: "Missing required reservation fields."
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price: process.env.PRICE_ID_RESERVATION_DEPOSIT,
          quantity: 1
        }
      ],
      success_url: `${process.env.DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DOMAIN}/cancel.html`,
      metadata: {
        customerName,
        phone,
        email,
        pickupDateTime,
        pickupAddress,
        dropoffAddress,
        vehicleChoice,
        passengerCount,
        luggageCount: luggageCount || "N/A",
        flightNumber: flightNumber || "N/A",
        tripType,
        specialInstructions: specialInstructions || "N/A"
      },
      payment_intent_data: {
        description: `BlackShield reservation deposit for ${customerName}`,
        metadata: {
          customerName,
          phone,
          email,
          pickupDateTime,
          pickupAddress,
          dropoffAddress,
          vehicleChoice,
          tripType
        }
      }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe Checkout error:", error);
    res.status(500).json({
      error: "Unable to create Stripe Checkout session."
    });
  }
});

app.get("/health", (req, res) => {
  res.send("BlackShield server is running.");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`BlackShield server running on port ${PORT}`);
});
