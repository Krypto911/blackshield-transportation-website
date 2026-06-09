
const navLinks = document.querySelectorAll('.main-nav a');
const sections = [...navLinks].map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
window.addEventListener('scroll', () => {
  let current = 'home';
  sections.forEach(section => {
    if (window.scrollY >= section.offsetTop - 130) current = section.id;
  });
  navLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${current}`));
});

document.getElementById('mobileMenu').addEventListener('click', () => {
  document.getElementById('mainNav').classList.toggle('open');
});

const heroImage = document.getElementById('heroVehicleImage');
const heroThumbs = document.querySelectorAll('.hero-thumb');
heroThumbs.forEach(btn => {
  btn.addEventListener('click', () => {
    heroThumbs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    heroImage.src = btn.dataset.hero;
  });
});

const vehicleCards = Array.from(document.querySelectorAll('.vehicle-card'));
const dots = Array.from(document.querySelectorAll('.dot'));
const vehicleSelect = document.getElementById('vehicleSelect');
const passengers = document.getElementById('passengers');
let selectedIndex = 0;

function selectVehicle(index){
  selectedIndex = (index + vehicleCards.length) % vehicleCards.length;
  vehicleCards.forEach((card, i) => card.classList.toggle('selected', i === selectedIndex));
  dots.forEach((dot, i) => dot.classList.toggle('active', i === selectedIndex));
  const card = vehicleCards[selectedIndex];
  vehicleSelect.value = card.dataset.vehicle;
  passengers.value = card.dataset.capacity;
  heroImage.src = card.dataset.hero;
  heroThumbs.forEach(b => b.classList.toggle('active', b.dataset.hero === card.dataset.hero));
}
vehicleCards.forEach((card, index) => card.addEventListener('click', () => selectVehicle(index)));
dots.forEach(dot => dot.addEventListener('click', () => selectVehicle(Number(dot.dataset.index))));
vehicleSelect.addEventListener('change', () => {
  const index = vehicleCards.findIndex(card => card.dataset.vehicle === vehicleSelect.value);
  if(index >= 0) selectVehicle(index);
});
document.querySelectorAll('.vehicle-card button').forEach(button => {
  button.addEventListener('click', event => {
    event.stopPropagation();
    document.getElementById('reservations').scrollIntoView({behavior:'smooth'});
    setTimeout(() => document.getElementById('pickupLocation').focus(), 500);
  });
});

const securityToggle = document.getElementById('securityToggle');
let securityRequested = false;
securityToggle.addEventListener('click', () => {
  securityRequested = !securityRequested;
  securityToggle.classList.toggle('on', securityRequested);
});

const monthLabel = document.getElementById('monthLabel');
const calendarDays = document.getElementById('calendarDays');
const pickupDate = document.getElementById('pickupDate');
let viewDate = new Date(2025, 4, 1);
let selectedDate = new Date(2025, 4, 20);

function formatDate(date){
  return date.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
}
function renderCalendar(){
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  monthLabel.textContent = viewDate.toLocaleDateString('en-US', {month:'long', year:'numeric'});
  calendarDays.innerHTML = '';
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  for(let i = firstDay - 1; i >= 0; i--){
    const btn = document.createElement('button');
    btn.className = 'muted';
    btn.textContent = prevMonthDays - i;
    calendarDays.appendChild(btn);
  }
  for(let day = 1; day <= daysInMonth; day++){
    const btn = document.createElement('button');
    btn.textContent = day;
    const date = new Date(year, month, day);
    if(date.getFullYear() === selectedDate.getFullYear() &&
       date.getMonth() === selectedDate.getMonth() &&
       date.getDate() === selectedDate.getDate()){
      btn.classList.add('active-day');
    }
    btn.addEventListener('click', () => {
      selectedDate = date;
      pickupDate.value = formatDate(selectedDate);
      renderCalendar();
    });
    calendarDays.appendChild(btn);
  }
  const totalCells = calendarDays.children.length;
  const nextCells = (7 - (totalCells % 7)) % 7;
  for(let day = 1; day <= nextCells; day++){
    const btn = document.createElement('button');
    btn.className = 'muted';
    btn.textContent = day;
    calendarDays.appendChild(btn);
  }
}
document.getElementById('prevMonth').addEventListener('click', () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
  renderCalendar();
});
document.getElementById('nextMonth').addEventListener('click', () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
  renderCalendar();
});
renderCalendar();

const modal = document.getElementById('confirmModal');
const closeModal = document.getElementById('closeModal');
const secureReservation = document.getElementById('secureReservation');
const modalSummary = document.getElementById('modalSummary');
const emailReservation = document.getElementById('emailReservation');

function openReservationModal(){
  const pickupLocation = document.getElementById('pickupLocation').value || 'Pickup location not entered';
  const dropLocation = document.getElementById('dropLocation').value || 'Drop-off location not entered';
  const time = document.getElementById('pickupTime').value;
  const requests = document.getElementById('specialRequests').value || 'No special requests';

  const summary = `Vehicle: ${vehicleSelect.value}
Date: ${pickupDate.value}
Time: ${time}
Passengers: ${passengers.value}
Pickup: ${pickupLocation}
Drop-off: ${dropLocation}
Armed Security Chauffeur: ${securityRequested ? 'Requested' : 'Not requested'}
Special Requests: ${requests}`;

  modalSummary.textContent = summary;
  emailReservation.href = `mailto:your-email@example.com?subject=BlackShield Reservation Request&body=${encodeURIComponent(summary)}`;
  modal.classList.add('open');
}
secureReservation.addEventListener('click', openReservationModal);
closeModal.addEventListener('click', () => modal.classList.remove('open'));
modal.addEventListener('click', e => { if(e.target === modal) modal.classList.remove('open'); });
