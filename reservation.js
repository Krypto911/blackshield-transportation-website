const reservationForm = document.getElementById("reservationForm");
const reservationMessage = document.getElementById("reservationMessage");

reservationForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  reservationMessage.textContent = "Preparing secure Stripe Checkout...";

  const formData = new FormData(reservationForm);

  const reservationData = {
    customerName: formData.get("customerName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    pickupDateTime: formData.get("pickupDateTime"),
    pickupAddress: formData.get("pickupAddress"),
    dropoffAddress: formData.get("dropoffAddress"),
    vehicleChoice: formData.get("vehicleChoice"),
    passengerCount: formData.get("passengerCount"),
    luggageCount: formData.get("luggageCount"),
    flightNumber: formData.get("flightNumber"),
    tripType: formData.get("tripType"),
    specialInstructions: formData.get("specialInstructions")
  };

  try {
    const response = await fetch("/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(reservationData)
    });

    const data = await response.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      reservationMessage.textContent =
        data.error || "Unable to start payment. Please call BlackShield Transportation.";
    }
  } catch (error) {
    console.error(error);
    reservationMessage.textContent =
      "Something went wrong. Please call or text BlackShield Transportation to complete your reservation.";
  }
});
