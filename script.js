const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");

if (menuToggle && navLinks) {
  menuToggle.addEventListener("click", () => {
    navLinks.classList.toggle("active");
  });
}

document.getElementById("year").textContent = new Date().getFullYear();

document.querySelectorAll(".select-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const vehicleName = button.closest(".vehicle-card").querySelector("h3").textContent;
    setTimeout(() => {
      const select = document.querySelector('select[name="Vehicle Selection"]');
      if (select) {
        for (const option of select.options) {
          if (option.textContent.trim() === vehicleName.trim()) {
            select.value = option.textContent;
          }
        }
      }
    }, 250);
  });
});
