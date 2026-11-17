const form = document.getElementById("enquiryForm");
const status = document.getElementById("formStatus");
const menuToggle = document.getElementById("menuToggle");
const nav = document.querySelector(".site-header nav");

document.getElementById("year").textContent = new Date().getFullYear();

menuToggle.addEventListener("click", () => nav.classList.toggle("open"));

// Enquiry form: opens the visitor's email app with a ready-to-send message.
// The destination address is set in config.js.
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const to = (window.SITE_CONFIG && window.SITE_CONFIG.contactEmail) || "";
  const data = new FormData(form);
  const name = data.get("name").trim();
  const dateOpt = form.elements.eventDate.selectedOptions[0];
  const lines = [
    "Hello, I'd like help choosing where to stay in Las Vegas.",
    "",
    `Name: ${name}`,
    `Email: ${data.get("email").trim()}`,
    `Show date: ${dateOpt && dateOpt.value ? dateOpt.textContent : "Not decided yet"}`,
    `Guests: ${data.get("guests")}`,
    `Type of stay: ${data.get("stayType")}`,
    "",
    "Questions:",
    data.get("message").trim() || "(none)"
  ];
  const href = `mailto:${to}?subject=${encodeURIComponent("Where to stay in Las Vegas - " + name)}&body=${encodeURIComponent(lines.join("\n"))}`;
  status.textContent = "Opening your email app… ";
  const fallback = document.createElement("a");
  fallback.href = href;
  fallback.textContent = "Tap here if it doesn't open.";
  status.appendChild(fallback);
  window.location.href = href;
});

/* ---- Upcoming performances (loaded from events.json) ---- */
const PAGE_SIZE = 4;
const eventsList = document.getElementById("eventsList");
const moreBtn = document.getElementById("moreEvents");
const eventsFrom = document.getElementById("eventsFrom");
const dateSelect = document.getElementById("eventDateSelect");
let upcoming = [];
let shown = 0;
let config = null;

// Current date/time in Las Vegas, as sortable strings
function vegasNow(tz) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(new Date()).reduce((o, p) => (o[p.type] = p.value, o), {});
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

const money = (n, cur) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n);
const parseDate = (d) => new Date(`${d}T12:00:00`);
// "PST" or "PDT" for that date in Las Vegas (switches automatically with daylight saving)
function tzAbbr(date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: config.timezone, timeZoneName: "short" })
    .formatToParts(new Date(`${date}T20:00:00Z`));
  return (parts.find((p) => p.type === "timeZoneName") || {}).value || "PT";
}
function formatTime(t) {
  const [h, m] = t.split(":").map(Number);
  return `${String(((h + 11) % 12) + 1).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function renderRow(ev) {
  const d = parseDate(ev.date);
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "event-row";
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const full = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const isToday = ev.date === vegasNow(config.timezone).slice(0, 10);
  btn.innerHTML = `
    <div class="event-date"><small>${month.toUpperCase()}</small><b>${d.getDate()}</b></div>
    <div class="event-info"><strong>${full}${isToday ? '<span class="event-tag">TONIGHT</span>' : ""}</strong><span>${formatTime(ev.time)} ${tzAbbr(ev.date)} · Atrium Showroom</span></div>
    <div class="event-price">from<b>${money(ev.price, config.currency)}</b>per ticket</div>`;
  btn.setAttribute("aria-label", `${full} at ${formatTime(ev.time)} ${tzAbbr(ev.date)}, from ${money(ev.price, config.currency)} per ticket. Choose tickets.`);
  btn.addEventListener("click", () => window.BookingFlow.open(ev));
  li.appendChild(btn);
  return li;
}

function showMore() {
  upcoming.slice(shown, shown + PAGE_SIZE).forEach((ev) => eventsList.appendChild(renderRow(ev)));
  shown = Math.min(shown + PAGE_SIZE, upcoming.length);
  moreBtn.hidden = shown >= upcoming.length;
  if (!moreBtn.hidden) moreBtn.textContent = `Show more dates (${upcoming.length - shown} more)`;
}

async function loadEvents() {
  try {
    const res = await fetch("events.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("events.json not found");
    config = await res.json();
    window.BookingFlow.init(config);
    const now = vegasNow(config.timezone);
    // Only performances that haven't started yet, soonest first
    upcoming = config.events
      .filter((e) => `${e.date}T${e.time}` > now)
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

    eventsList.innerHTML = "";
    if (!upcoming.length) {
      eventsList.innerHTML = '<li class="events-empty">No upcoming dates are listed right now. Use the button below to check the official calendar.</li>';
      dateSelect.innerHTML = '<option value="">No dates available</option>';
      dateSelect.disabled = true;
      return;
    }
    const low = Math.min(...upcoming.map((e) => e.price));
    eventsFrom.innerHTML = `Tickets from <b>${money(low, config.currency)}</b>`;
    showMore();
    moreBtn.addEventListener("click", showMore);

    // Enquiry form only offers dates that have a performance
    dateSelect.innerHTML = '<option value="">Not decided yet</option>' +
      upcoming.map((e) => `<option value="${e.date}">${parseDate(e.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${formatTime(e.time)} ${tzAbbr(e.date)}</option>`).join("");
  } catch (err) {
    eventsList.innerHTML = '<li class="events-empty">Dates could not be loaded. Please use the button below to see the official calendar.</li>';
    dateSelect.innerHTML = '<option value="">Dates unavailable</option>';
    console.error(err);
  }
}
loadEvents();


/* ---- Video beside the tickets list (set the link in config.js) ---- */
(function setupVideo() {
  const media = document.getElementById("showMedia");
  const v = (window.SITE_CONFIG && window.SITE_CONFIG.video) || {};
  const url = (v.url || "").trim();
  if (!media || !url) return;                       // no video set: keep the photo

  let el = null;
  let m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m || vimeo) {
    el = document.createElement("iframe");
    el.src = m ? `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0` : `https://player.vimeo.com/video/${vimeo[1]}`;
    el.title = "Carrot Top video";
    el.loading = "lazy";
    el.allow = "accelerometer; encrypted-media; picture-in-picture; fullscreen";
  } else if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) {
    el = document.createElement("video");
    el.src = url;
    el.controls = true;
    el.playsInline = true;
    el.preload = "metadata";
    if (v.poster) el.poster = v.poster;
  } else {
    console.warn("config.js: video url not recognised. Use a YouTube/Vimeo link or an .mp4/.webm file.");
    return;
  }
  media.classList.add("has-video");
  media.replaceChildren(el);
})();
