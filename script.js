const mobileMenu = document.getElementById("mobileMenu");
const mainNav = document.getElementById("mainNav");

const heroVehicleImage = document.getElementById("heroVehicleImage");
const heroThumbs = document.querySelectorAll(".hero-thumb");

const vehicleCards = document.querySelectorAll(".vehicle-card");
const dots = document.querySelectorAll(".dot");

function closeMobileMenu() {
  if (!mobileMenu || !mainNav) {
    return;
  }

  mainNav.classList.remove("open");
  mobileMenu.setAttribute("aria-expanded", "false");
  mobileMenu.setAttribute("aria-label", "Open navigation menu");
}

if (mobileMenu && mainNav) {
  mobileMenu.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("open");

    mobileMenu.setAttribute("aria-expanded", String(isOpen));
    mobileMenu.setAttribute(
      "aria-label",
      isOpen ? "Close navigation menu" : "Open navigation menu"
    );
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      closeMobileMenu();
    }
  });
}

heroThumbs.forEach((thumb) => {
  thumb.addEventListener("click", () => {
    if (!heroVehicleImage) {
      return;
    }

    const newImage = thumb.dataset.hero;
    const newAlt =
      thumb.dataset.alt ||
      thumb.querySelector("img")?.alt ||
      "BlackShield luxury transportation vehicle";

    if (!newImage) {
      return;
    }

    heroVehicleImage.src = newImage;
    heroVehicleImage.alt = newAlt;

    heroThumbs.forEach((item) => {
      item.classList.remove("active");
    });

    thumb.classList.add("active");

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "hero_vehicle_selected",
      vehicle_image: newImage,
      vehicle_description: newAlt
    });
  });
});

function selectVehicleCard(selectedIndex) {
  vehicleCards.forEach((card, index) => {
    const isSelected = index === selectedIndex;

    card.classList.toggle("selected", isSelected);
    card.setAttribute("aria-selected", String(isSelected));
  });

  dots.forEach((dot, index) => {
    const isSelected = index === selectedIndex;

    dot.classList.toggle("active", isSelected);
    dot.setAttribute("aria-current", isSelected ? "true" : "false");
  });
}

vehicleCards.forEach((card, index) => {
  card.setAttribute("tabindex", "0");
  card.setAttribute("role", "option");

  card.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      return;
    }

    selectVehicleCard(index);
  });

  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectVehicleCard(index);
    }
  });
});

dots.forEach((dot, index) => {
  dot.addEventListener("click", () => {
    selectVehicleCard(index);

    vehicleCards[index]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center"
    });
  });
});

if (vehicleCards.length > 0) {
  selectVehicleCard(0);
}
