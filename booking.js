/* Ticket-selection flow: quantity -> seats -> cart -> official checkout */
(function () {
  "use strict";

  const ROWS = "ABCDEFGHIJKLM".split("");
  const state = { ev: null, qty: 1, accessible: false, tier: null, selected: null, view: "qty", paymentMethod: null };
  const cart = [];
  let cfg = null, overlay, sheet, cartBtn, lastFocus;

  const cents = (n) => Math.round(n * 100);
  const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: (cfg && cfg.currency) || "USD" }).format(n);
  const unitTotal = (l) => (cents(l.base) + cents(cfg.feeEach)) / 100;
  const lineTotal = (l, q) => (cents(l.base) + cents(cfg.feeEach)) * q / 100;
  const maxQty = () => (cfg && cfg.maxTickets) || 8;
  const listingsFor = (ev) => ev.listings || cfg.listings || [];
  const tierColor = (base) => ((cfg.tiers || []).find((t) => t.base === base) || {}).color || "#999";

  function dateLabel(ev) {
    return new Date(ev.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  function timeLabel(ev) {
    const [h, m] = ev.time.split(":").map(Number);
    const tz = (new Intl.DateTimeFormat("en-US", { timeZone: cfg.timezone || "America/Los_Angeles", timeZoneName: "short" })
      .formatToParts(new Date(`${ev.date}T20:00:00Z`)).find((p) => p.type === "timeZoneName") || {}).value || "PT";
    return `${String(((h + 11) % 12) + 1).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} ${tz}`;
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  /* ---------- data helpers ---------- */
  function matching() {
    return listingsFor(state.ev)
      .map((l, i) => Object.assign({ i }, l))
      .filter((l) => l.qty >= state.qty && (!state.accessible || l.type === "wheelchair"));
  }

  /* ---------- seat map (simplified drawing) ---------- */
  function mapSvg(shown) {
    const cx = 320, cy = 440, r0 = 100, step = 20.5;
    const span = 48 * Math.PI / 180, bg = 56 * Math.PI / 180;
    const pt = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    const arc = (r, a1, a2, sweep) => {
      const [x1, y1] = pt(r, a1), [x2, y2] = pt(r, a2);
      return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 ${sweep} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    };
    const [ox1, oy1] = pt(358, -bg), [ox2, oy2] = pt(358, bg), [ix1, iy1] = pt(88, bg), [ix2, iy2] = pt(88, -bg);
    let s = `<svg class="seatmap" viewBox="0 0 640 470" role="img" aria-label="Seating chart with the stage at the bottom and sections 1 to 4 moving back">`;
    s += `<path class="map-bg" d="M${ox1} ${oy1} A358 358 0 0 1 ${ox2} ${oy2} L${ix1} ${iy1} A88 88 0 0 0 ${ix2} ${iy2} Z"/>`;
    [2.5, 9.5, 11.5].forEach((k) => { s += `<path class="map-sep" d="${arc(r0 + step * k, -bg, bg, 1)}"/>`; });
    // colour each row by the first visible listing in it
    const rowColor = {};
    shown.forEach((l) => { if (!rowColor[l.row]) rowColor[l.row] = tierColor(l.base); });
    const sel = state.selected != null ? listingsFor(state.ev)[state.selected] : null;
    ROWS.forEach((row, idx) => {
      const r = r0 + idx * step;
      const n = Math.floor(2 * span * r / 13);
      const isSel = sel && sel.row === row;
      const fill = rowColor[row] || "#cfcfe2";
      for (let k = 0; k < n; k++) {
        const [x, y] = pt(r, -span + 2 * span * (k / (n - 1)));
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isSel ? 4.2 : 3.2}" fill="${fill}"${isSel ? ' stroke="#111" stroke-width="1"' : ""}/>`;
      }
    });
    [[1, 1], [2, 6], [3, 10.5], [4, 12]].forEach(([n, k]) => {
      [-1, 1].forEach((side) => {
        const [x, y] = pt(r0 + step * k, side * 62 * Math.PI / 180);
        s += `<text class="map-num" x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle">${n}</text>`;
      });
    });
    s += `<path class="map-stage" d="M190 470 A130 55 0 0 1 450 470 Z"/><text class="map-stage-t" x="320" y="458" text-anchor="middle">STAGE</text></svg>`;
    return s;
  }

  /* ---------- views ---------- */
  function header() {
    const closeBtn = '<button class="sheet-x" data-act="close" aria-label="Close">✕</button>';
    if (state.view === "cart") {
      return `<div class="sheet-head"><button class="sheet-back" data-act="back" aria-label="Back">‹</button><div class="sheet-title"><strong>Your selection</strong><span>Review before checkout</span></div>${closeBtn}</div>`;
    }
    if (state.view === "payment") {
      return `<div class="sheet-head"><button class="sheet-back" data-act="back" aria-label="Back">‹</button><div class="sheet-title"><strong>Choose payment method</strong><span>Payment instructions</span></div>${closeBtn}</div>`;
    }
    const back = state.view === "seats" ? '<button class="sheet-back" data-act="back" aria-label="Back">‹</button>' : '<span class="sheet-back-gap"></span>';
    return `<div class="sheet-head">${back}<div class="sheet-title"><strong>${cfg.show}</strong><span>${timeLabel(state.ev)} – ${dateLabel(state.ev)}</span></div>${closeBtn}</div>`;
  }

  function qtyView() {
    return {
      body: `<div class="qty-wrap">
        <h3>How many tickets do you need?</h3>
        <div class="qty-num" aria-live="polite">${state.qty}</div>
        <div class="qty-ctrl">
          <button data-act="minus" aria-label="Fewer tickets" ${state.qty <= 1 ? "disabled" : ""}>−</button>
          <button data-act="plus" aria-label="More tickets" ${state.qty >= maxQty() ? "disabled" : ""}>+</button>
        </div>
        <p class="qty-note">Maximum ${maxQty()} tickets. For larger parties, please contact Luxor through the official website.</p>
        <label class="acc-row"><span>Do you need accessible seating?</span>
          <input type="checkbox" role="switch" id="accToggle" ${state.accessible ? "checked" : ""}><i class="switch"></i></label>
      </div>`,
      foot: `<button class="primary-button full" data-act="find">Find seats <span>→</span></button>`
    };
  }

  function seatsView() {
    const base = matching();
    const tiers = [...new Set(base.map((l) => l.base))].sort((a, b) => a - b);
    if (state.tier != null && !tiers.includes(state.tier)) state.tier = null;
    const shown = state.tier == null ? base : base.filter((l) => l.base === state.tier);
    const chips = `<div class="chips"><button class="chip ${state.tier == null ? "on" : ""}" data-act="tier" data-v="all">All prices</button>${
      tiers.map((b) => `<button class="chip ${state.tier === b ? "on" : ""}" data-act="tier" data-v="${b}"><i style="background:${tierColor(b)}"></i>${money(unitTotal({ base: b }))}</button>`).join("")}</div>`;
    const list = shown.length ? shown.map((l) => `
      <button class="listing ${state.selected === l.i ? "sel" : ""}" data-act="pick" data-i="${l.i}" aria-pressed="${state.selected === l.i}">
        <span class="l-left"><b>Section ${l.section}, Row ${l.row}</b>
          <small>${l.type === "wheelchair" ? "♿ " + plural(l.qty, "Wheelchair Accessible Seat") : plural(l.qty, "Standard Ticket")}</small></span>
        <span class="l-right"><small>${money(l.base)}</small><small>+ ${money(cfg.feeEach)} service fee</small><b>${money(unitTotal(l))} <em>/ea</em></b></span>
      </button>`).join("") : `<p class="empty">No seats found for ${plural(state.qty, "ticket")}${state.accessible ? " with accessible seating" : ""}. Try fewer tickets or check the official site.</p>`;
    const sel = state.selected != null ? listingsFor(state.ev)[state.selected] : null;
    const foot = sel
      ? `<div class="pick-bar"><div><b>${plural(state.qty, "ticket")} · ${money(lineTotal(sel, state.qty))}</b><small>Section ${sel.section}, Row ${sel.row}</small></div><button class="primary-button" data-act="add">Add to cart <span>→</span></button></div>`
      : `<p class="foot-hint">Choose a seat option to add it to your cart.</p>`;
    return {
      body: `${mapSvg(shown)}<h4 class="sec-h">Sections*</h4>${chips}<div class="listings">${list}</div>
        <p class="fineprint">*Prices per ticket include the service fee and exclude taxes. Seat listings are a snapshot and may change or sell out; the final seats and price are confirmed at Luxor's official checkout.</p>`,
      foot
    };
  }

  function cartView() {
    if (!cart.length) return { body: '<p class="empty">Your cart is empty.</p>', foot: '<button class="primary-button full" data-act="close">Browse dates</button>' };
    const sum = cart.reduce((t, c) => t + cents(lineTotal(c.listing, c.qty)), 0) / 100;
    const count = cart.reduce((t, c) => t + c.qty, 0);
    const items = cart.map((c) => `
      <div class="cart-item">
        <div><b>${cfg.show}</b><span>${dateLabel(c.ev)} · ${timeLabel(c.ev)}</span>
          <span>Section ${c.listing.section}, Row ${c.listing.row} · ${c.listing.type === "wheelchair" ? "Wheelchair accessible" : "Standard"}</span>
          <span>${plural(c.qty, "ticket")} × ${money(unitTotal(c.listing))}</span></div>
        <div class="cart-right"><b>${money(lineTotal(c.listing, c.qty))}</b><button data-act="remove" data-k="${c.key}">Remove</button></div>
      </div>`).join("");
    return {
      body: `${items}<div class="cart-total"><span>${plural(count, "ticket")} · excl. taxes</span><b>${money(sum)}</b></div>
        <p class="fineprint"><strong>This is a summary only.</strong> Vegas Show Booking is independent and is not affiliated with Luxor/MGM. Seat listings are illustrative and do not reserve live seats. Payments are handled manually; ticket issuance and confirmation must be arranged separately with support.</p>`,
      foot: `<button class="primary-button full" data-act="checkout">Continue to payment <span>→</span></button>
             <button class="link-btn" data-act="more">+ Add more tickets</button>`
    };
  }


  function paymentView() {
    const amount = cart.reduce((t, c) => t + cents(lineTotal(c.listing, c.qty)), 0) / 100;
    const count = cart.reduce((n, c) => n + c.qty, 0);
    const selected = state.paymentMethod;
    let details = "";
    if (selected === "usdt") details = `
      <div class="payment-detail"><span class="payment-label">Asset / network</span><b>USDT · BNB Smart Chain (BEP20)</b>
      <span class="payment-label">Deposit address</span><code>0x08082b2e7f579fb37da49ca3e3162777014fd284</code>
      <button class="copy-payment" data-act="copy-address" data-copy="0x08082b2e7f579fb37da49ca3e3162777014fd284">Copy USDT address</button></div>`;
    else if (selected === "btc") details = `
      <div class="payment-detail"><span class="payment-label">Asset / network</span><b>Bitcoin (BTC) · Bitcoin network</b>
      <span class="payment-label">Deposit address</span><code>16k1giXi95gkcsRzTju5hnmjPfsKxjJ9oi</code>
      <button class="copy-payment" data-act="copy-address" data-copy="16k1giXi95gkcsRzTju5hnmjPfsKxjJ9oi">Copy BTC address</button></div>`;
    else if (selected === "gift") details = `
      <div class="payment-detail"><b>Pay with a gift card</b><p>Send your gift card to the email address below. Include your booking name and show date.</p>
      <code>support@vegasshowbooking.store</code>
      <button class="copy-payment" data-act="copy-address" data-copy="support@vegasshowbooking.store">Copy email address</button>
      <a class="primary-button full" href="mailto:support@vegasshowbooking.store?subject=Gift%20card%20payment&body=Booking%20name%3A%0AShow%20date%3A%0AOrder%20total%3A">Email gift card details ↗</a></div>`;
    else if (selected === "cashapp") details = `
      <div class="payment-detail"><b>Cash App</b><p>Continue to the Cash App payment page to complete your payment.</p>
      <a class="primary-button full" href="https://gocashapp.online/pay/vegas-show-booking" target="_blank" rel="noopener noreferrer">Open Cash App payment ↗</a></div>`;
    return {
      body: `<div class="payment-summary"><span>Order total</span><b>${money(amount)}</b><small>${plural(count, "ticket")} · ${cfg.show}</small></div>
        <h3 class="sec-h">Choose your payment method</h3>
        <div class="payment-methods">
          <button class="payment-option ${selected === "usdt" ? "active" : ""}" data-act="payment" data-method="usdt"><span class="pay-icon usdt-icon">₮</span><span><b>USDT</b><small>BNB Smart Chain (BEP20) · Crypto</small></span><span class="pay-check">${selected === "usdt" ? "✓" : "›"}</span></button>
          <button class="payment-option ${selected === "btc" ? "active" : ""}" data-act="payment" data-method="btc"><span class="pay-icon btc-icon">₿</span><span><b>Bitcoin (BTC)</b><small>Bitcoin network · Crypto</small></span><span class="pay-check">${selected === "btc" ? "✓" : "›"}</span></button>
          <button class="payment-option ${selected === "gift" ? "active" : ""}" data-act="payment" data-method="gift"><span class="pay-icon gift-icon">🎁</span><span><b>Gift cards</b><small>Send to our support email</small></span><span class="pay-check">${selected === "gift" ? "✓" : "›"}</span></button>
          <button class="payment-option ${selected === "cashapp" ? "active" : ""}" data-act="payment" data-method="cashapp"><span class="pay-icon cash-icon">$</span><span><b>Cash App</b><small>Pay online</small></span><span class="pay-check">${selected === "cashapp" ? "✓" : "›"}</span></button>
        </div>${details}
        <p class="fineprint">Only send the exact asset on the network shown. Crypto transfers are generally irreversible. Your order is not confirmed until payment is received and manually verified by support. Include your booking details with your payment.</p>`,
      foot: `<p class="foot-hint">Need help? <a href="mailto:support@vegasshowbooking.store">support@vegasshowbooking.store</a></p>`
    };
  }

  function render() {
    const old = sheet.querySelector(".sheet-body");
    const prev = old ? old.scrollTop : 0;
    const v = state.view === "qty" ? qtyView() : state.view === "seats" ? seatsView() : state.view === "payment" ? paymentView() : cartView();
    sheet.innerHTML = header() + `<div class="sheet-body">${v.body}</div><div class="sheet-foot">${v.foot}</div>`;
    sheet.querySelector(".sheet-body").scrollTop = prev;
  }

  /* ---------- open / close ---------- */
  function openSheet() {
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    render();
    sheet.focus();
  }
  function closeSheet() {
    overlay.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function updateCartBtn() {
    const n = cart.reduce((t, c) => t + c.qty, 0);
    cartBtn.hidden = n === 0;
    cartBtn.textContent = `Your tickets · ${n}`;
  }

  function onClick(e) {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const act = t.dataset.act;
    if (act === "close") return closeSheet();
    if (act === "back") {
      if (state.view === "seats") state.view = "qty";
      else if (state.view === "payment") state.view = "cart";
      else if (state.view === "cart" && state.ev) state.view = "seats";
      else return closeSheet();
    } else if (act === "plus") { if (state.qty < maxQty()) state.qty++; state.selected = null; }
    else if (act === "minus") { if (state.qty > 1) state.qty--; state.selected = null; }
    else if (act === "find") { state.view = "seats"; state.selected = null; state.tier = null; }
    else if (act === "tier") { state.tier = t.dataset.v === "all" ? null : Number(t.dataset.v); state.selected = null; }
    else if (act === "pick") { state.selected = Number(t.dataset.i); }
    else if (act === "add") {
      const l = listingsFor(state.ev)[state.selected];
      const key = `${state.ev.date}|${state.ev.time}|${state.selected}`;
      const ex = cart.find((c) => c.key === key);
      if (ex) ex.qty = state.qty;
      else cart.push({ key, ev: { date: state.ev.date, time: state.ev.time }, listing: l, qty: state.qty });
      state.view = "cart";
      updateCartBtn();
    } else if (act === "remove") {
      const i = cart.findIndex((c) => c.key === t.dataset.k);
      if (i > -1) cart.splice(i, 1);
      updateCartBtn();
    } else if (act === "more") {
      if (state.ev) state.view = "seats"; else return closeSheet();
    } else if (act === "checkout") {
      state.view = "payment";
      state.paymentMethod = null;
    } else if (act === "payment") {
      state.paymentMethod = t.dataset.method;
    } else if (act === "copy-address") {
      const value = t.dataset.copy || "";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(() => { t.textContent = "Copied"; })
          .catch(() => { window.prompt("Copy this payment detail:", value); });
      } else window.prompt("Copy this payment detail:", value);
    }
    render();
  }

  function init(config) {
    cfg = config;
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "sheet-overlay";
    overlay.hidden = true;
    overlay.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Choose tickets" tabindex="-1"></div>';
    document.body.appendChild(overlay);
    sheet = overlay.firstChild;
    cartBtn = document.createElement("button");
    cartBtn.className = "cart-fab";
    cartBtn.hidden = true;
    document.body.appendChild(cartBtn);

    sheet.addEventListener("click", onClick);
    sheet.addEventListener("change", (e) => {
      if (e.target.id === "accToggle") { state.accessible = e.target.checked; state.selected = null; }
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeSheet(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) closeSheet(); });
    cartBtn.addEventListener("click", () => { state.view = "cart"; openSheet(); });
  }

  function open(ev) {
    Object.assign(state, { ev, qty: 1, accessible: false, tier: null, selected: null, view: "qty", paymentMethod: null });
    openSheet();
  }

  window.BookingFlow = { init, open };
})();
