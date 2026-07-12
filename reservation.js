const reservationForm = document.getElementById("reservationForm");
const reservationMessage = document.getElementById("reservationMessage");
const pricingMessage = document.getElementById("pricingMessage");

const calculatePriceButton = document.getElementById(
  "calculatePriceButton"
);

const reservationSubmit = document.getElementById(
  "reservationSubmit"
);

const tripTypeInput = document.getElementById("tripType");
const vehicleChoiceInput = document.getElementById("vehicleChoice");
const zoneInput = document.getElementById("zone");
const requestedHoursInput = document.getElementById("requestedHours");
const pickupDateTimeInput = document.getElementById(
  "pickupDateTime"
);

const priceSummary = document.getElementById("priceSummary");
const paymentOptionsSection = document.getElementById(
  "paymentOptionsSection"
);

const summaryVehicle = document.getElementById("summaryVehicle");
const summaryTotal = document.getElementById("summaryTotal");
const summaryTripTotal = document.getElementById(
  "summaryTripTotal"
);
const summaryDescription = document.getElementById(
  "summaryDescription"
);

const fullPaymentAmount = document.getElementById(
  "fullPaymentAmount"
);
const deposit25Amount = document.getElementById(
  "deposit25Amount"
);
const deposit50Amount = document.getElementById(
  "deposit50Amount"
);

let currentPricing = null;

window.dataLayer = window.dataLayer || [];

function trackEvent(eventName, eventData = {}) {
  window.dataLayer.push({
    event: eventName,
    ...eventData
  });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(amount) || 0);
}

function setMinimumPickupDateTime() {
  const now = new Date();
  const localNow = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  );

  pickupDateTimeInput.min = localNow
    .toISOString()
    .slice(0, 16);
}

function getSelectedPaymentOption() {
  return document.querySelector(
    'input[name="paymentOption"]:checked'
  )?.value;
}

function isPickupWithin24Hours() {
  const pickupValue = pickupDateTimeInput.value;

  if (!pickupValue) {
    return false;
  }

  const pickupDate = new Date(pickupValue);
  const hoursUntilPickup =
    (pickupDate.getTime() - Date.now()) / (1000 * 60 * 60);

  return hoursUntilPickup >= 0 && hoursUntilPickup <= 24;
}

function updateConditionalFields() {
  const tripType = tripTypeInput.value.toLowerCase();
  const isAirport = tripType.includes("airport");

  const requiresHours =
    tripType.includes("hourly") ||
    tripType.includes("corporate") ||
    tripType.includes("security") ||
    tripType.includes("special event");

  zoneInput.required = isAirport;
  requestedHoursInput.required = requiresHours;

  zoneInput.closest(".form-group").classList.toggle(
    "field-active",
    isAirport
  );

  requestedHoursInput.closest(".form-group").classList.toggle(
    "field-active",
    requiresHours
  );

  if (!isAirport) {
    zoneInput.value = "";
  }

  if (!requiresHours) {
    requestedHoursInput.value = "";
  }

  resetPricing();
}

function updateVehicleRestrictions() {
  const tripType = tripTypeInput.value.toLowerCase();
  const isAirport = tripType.includes("airport");

  const options = [...vehicleChoiceInput.options];

  options.forEach((option) => {
    if (!option.value) {
      return;
    }

    const value = option.value.toLowerCase();

    const isLargeVehicle =
      value.includes("sprinter") ||
      value.includes("stretch") ||
      value.includes("mini bus");

    option.disabled = isAirport && isLargeVehicle;
  });

  if (
    vehicleChoiceInput.selectedOptions[0]?.disabled
  ) {
    vehicleChoiceInput.value = "";
  }
}

function updateSameDayPaymentRules() {
  const paymentInputs = document.querySelectorAll(
    'input[name="paymentOption"]'
  );

  const sameDay = isPickupWithin24Hours();

  paymentInputs.forEach((input) => {
    if (input.value === "full") {
      input.disabled = false;
      return;
    }

    input.disabled = sameDay;

    if (sameDay && input.checked) {
      input.checked = false;
    }
  });

  if (sameDay) {
    const fullPaymentInput = document.querySelector(
      'input[name="paymentOption"][value="full"]'
    );

    if (fullPaymentInput) {
      fullPaymentInput.checked = true;
    }
  }

  updateSubmitState();
}

function resetPricing() {
  currentPricing = null;

  priceSummary.hidden = true;
  paymentOptionsSection.hidden = true;
  reservationSubmit.disabled = true;

  pricingMessage.textContent = "";

  document
    .querySelectorAll('input[name="paymentOption"]')
    .forEach((input) => {
      input.checked = false;
    });
}

function updatePaymentAmounts(totalDollars) {
  fullPaymentAmount.textContent =
    `${formatCurrency(totalDollars)} today`;

  deposit25Amount.textContent =
    `${formatCurrency(totalDollars * 0.25)} today`;

  deposit50Amount.textContent =
    `${formatCurrency(totalDollars * 0.5)} today`;
}

function updateSubmitState() {
  const paymentOption = getSelectedPaymentOption();
  const termsAccepted =
    document.getElementById("termsAccepted").checked;

  reservationSubmit.disabled = !(
    currentPricing &&
    paymentOption &&
    termsAccepted
  );
}

function validatePricingFields() {
  const tripType = tripTypeInput.value;
  const vehicleChoice = vehicleChoiceInput.value;

  if (!tripType) {
    throw new Error("Please select a service type.");
  }

  if (!vehicleChoice) {
    throw new Error("Please select a vehicle.");
  }

  const normalizedTripType = tripType.toLowerCase();

  if (
    normalizedTripType.includes("point-to-point")
  ) {
    throw new Error(
      "Point-to-point transportation requires a custom quote. Please call 678-743-5639."
    );
  }

  if (
    normalizedTripType.includes("airport") &&
    !zoneInput.value
  ) {
    throw new Error("Please select an airport zone.");
  }

  const requiresHours =
    normalizedTripType.includes("hourly") ||
    normalizedTripType.includes("corporate") ||
    normalizedTripType.includes("security") ||
    normalizedTripType.includes("special event");

  if (
    requiresHours &&
    (!requestedHoursInput.value ||
      Number(requestedHoursInput.value) <= 0)
  ) {
    throw new Error(
      "Please enter the requested number of service hours."
    );
  }
}

async function calculatePrice() {
  try {
    validatePricingFields();

    calculatePriceButton.disabled = true;
    pricingMessage.textContent =
      "Calculating your reservation price...";

    const pricingRequest = {
      tripType: tripTypeInput.value,
      vehicleChoice: vehicleChoiceInput.value,
      zone: zoneInput.value,
      requestedHours: requestedHoursInput.value
    };

    const response = await fetch("/calculate-price", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(pricingRequest)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Unable to calculate the reservation price."
      );
    }

    currentPricing = data;

    summaryVehicle.textContent = data.vehicleLabel;
    summaryTotal.textContent = data.totalFormatted;
    summaryTripTotal.textContent = data.totalFormatted;
    summaryDescription.textContent =
      data.rateDescription;

    updatePaymentAmounts(data.totalDollars);

    priceSummary.hidden = false;
    paymentOptionsSection.hidden = false;

    pricingMessage.textContent =
      "Your estimated rate has been calculated.";

    updateSameDayPaymentRules();
    updateSubmitState();

    trackEvent("quote_completed", {
      vehicle: data.vehicleKey,
      vehicle_name: data.vehicleLabel,
      trip_total: data.totalDollars,
      service_type: tripTypeInput.value,
      airport_zone: zoneInput.value || "not_applicable",
      requested_hours:
        requestedHoursInput.value || "not_applicable"
    });

    priceSummary.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  } catch (error) {
    console.error(error);

    pricingMessage.textContent =
      error.message ||
      "Unable to calculate your price. Please call BlackShield Transportation.";

    resetPricing();
    pricingMessage.textContent =
      error.message ||
      "Unable to calculate your price. Please call BlackShield Transportation.";
  } finally {
    calculatePriceButton.disabled = false;
  }
}

function collectReservationData() {
  const formData = new FormData(reservationForm);

  return {
    customerName: formData.get("customerName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    pickupDateTime: formData.get("pickupDateTime"),
    pickupAddress: formData.get("pickupAddress"),
    dropoffAddress: formData.get("dropoffAddress"),
    vehicleChoice: formData.get("vehicleChoice"),
    tripType: formData.get("tripType"),
    zone: formData.get("zone"),
    requestedHours: formData.get("requestedHours"),
    passengerCount: formData.get("passengerCount"),
    luggageCount: formData.get("luggageCount"),
    flightNumber: formData.get("flightNumber"),
    paymentOption: formData.get("paymentOption"),
    specialInstructions: formData.get(
      "specialInstructions"
    )
  };
}

async function submitReservation(event) {
  event.preventDefault();

  reservationMessage.textContent = "";

  if (!reservationForm.checkValidity()) {
    reservationForm.reportValidity();

    reservationMessage.textContent =
      "Please complete all required fields.";

    return;
  }

  if (!currentPricing) {
    reservationMessage.textContent =
      "Please calculate your reservation price first.";

    return;
  }

  const reservationData = collectReservationData();

  if (!reservationData.paymentOption) {
    reservationMessage.textContent =
      "Please select a payment option.";

    return;
  }

  reservationSubmit.disabled = true;
  reservationSubmit.textContent =
    "Preparing Secure Stripe Checkout...";

  reservationMessage.textContent =
    "Please wait while we prepare your secure payment page.";

  trackEvent("begin_checkout", {
    vehicle: currentPricing.vehicleKey,
    vehicle_name: currentPricing.vehicleLabel,
    trip_total: currentPricing.totalDollars,
    payment_option: reservationData.paymentOption,
    service_type: reservationData.tripType
  });

  try {
    const response = await fetch(
      "/create-checkout-session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(reservationData)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Unable to start secure Stripe Checkout."
      );
    }

    if (!data.url) {
      throw new Error(
        "Stripe Checkout did not return a payment link."
      );
    }

    sessionStorage.setItem(
      "blackshieldReservation",
      JSON.stringify({
        reservationId: data.reservationId,
        tripTotal: data.tripTotal,
        amountDue: data.amountDue,
        paymentOption: data.paymentOption,
        vehicle: currentPricing.vehicleLabel,
        serviceType: reservationData.tripType
      })
    );

    window.location.assign(data.url);
  } catch (error) {
    console.error(error);

    reservationMessage.textContent =
      error.message ||
      "Something went wrong. Please call 678-743-5639 to complete your reservation.";

    reservationSubmit.disabled = false;
    reservationSubmit.textContent =
      "Continue to Secure Stripe Checkout";
  }
}

function preselectVehicleFromUrl() {
  const urlParameters = new URLSearchParams(
    window.location.search
  );

  const requestedVehicle =
    urlParameters.get("vehicle");

  if (!requestedVehicle) {
    return;
  }

  const matchingOption = [
    ...vehicleChoiceInput.options
  ].find((option) => {
    return (
      option.value.toLowerCase() ===
      requestedVehicle.toLowerCase()
    );
  });

  if (matchingOption) {
    vehicleChoiceInput.value =
      matchingOption.value;

    trackEvent("vehicle_selected", {
      vehicle_name: matchingOption.value,
      source: "homepage_vehicle_link"
    });
  }
}

tripTypeInput.addEventListener("change", () => {
  updateConditionalFields();
  updateVehicleRestrictions();

  trackEvent("service_type_selected", {
    service_type: tripTypeInput.value
  });
});

vehicleChoiceInput.addEventListener("change", () => {
  resetPricing();

  trackEvent("vehicle_selected", {
    vehicle_name: vehicleChoiceInput.value,
    source: "reservation_form"
  });
});

zoneInput.addEventListener("change", resetPricing);
requestedHoursInput.addEventListener(
  "input",
  resetPricing
);

pickupDateTimeInput.addEventListener(
  "change",
  updateSameDayPaymentRules
);

calculatePriceButton.addEventListener(
  "click",
  calculatePrice
);

document
  .querySelectorAll('input[name="paymentOption"]')
  .forEach((input) => {
    input.addEventListener("change", () => {
      updateSubmitState();

      trackEvent("payment_option_selected", {
        payment_option: input.value,
        trip_total:
          currentPricing?.totalDollars || 0
      });
    });
  });

document
  .getElementById("termsAccepted")
  .addEventListener("change", updateSubmitState);

reservationForm.addEventListener(
  "submit",
  submitReservation
);

reservationForm.addEventListener(
  "focusin",
  (event) => {
    if (
      event.target.matches(
        "input, select, textarea"
      )
    ) {
      trackEvent("quote_started", {
        form_name:
          "blackshield_reservation_form"
      });
    }
  },
  {
    once: true
  }
);

setMinimumPickupDateTime();
preselectVehicleFromUrl();
updateConditionalFields();
updateVehicleRestrictions();
updateSameDayPaymentRules();
