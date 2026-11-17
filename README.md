# Vegas Show Booking

Independent event-information and referral website starter project.

## Requirements
- Node.js 18 or newer
- VS Code (recommended)

## Run locally
1. Extract this folder.
2. Open the folder in VS Code.
3. Open Terminal in VS Code.
4. Run `npm install`
5. Run `npm start`
6. Open `http://localhost:3000`

## Files
- `public/index.html` — page structure and content
- `public/styles.css` — layout, colours and responsive styling
- `public/app.js` — mobile navigation and enquiry form behaviour
- `server.js` — Express server and enquiry API
- `bookings.db` — SQLite database created automatically after first run

## Important booking limitations
This starter site does NOT sell or issue Carrot Top tickets. The ticket button sends customers to the Luxor/MGM official booking page. Ticket dates, seats, prices, inventory, checkout and confirmations are controlled by Luxor/MGM.

The accommodation cards link to third-party accommodation websites. They are not live embedded booking engines and do not automatically earn commissions. Apply to an accommodation affiliate programme or sign a partner agreement before expecting commissions.

The enquiry form stores an enquiry only. It is not a ticket, hotel reservation or payment.

Before publishing:
- Replace the demo brand/content with your own approved branding.
- Confirm all show dates and venue details against Luxor's official calendar.
- Add a privacy policy, terms, cookie notice and contact details.
- Configure HTTPS and secure hosting.
- Add rate limiting, spam protection, validation and database backups.
- Do not use Carrot Top/MGM logos, copyrighted photos or imply official affiliation without permission.

## Set your enquiry email
Open `public/config.js` and replace `YOUR-EMAIL@example.com` with your real address. The "Need a place to stay?" form opens the visitor's email app with a prefilled message to that address.

\n## Payment selection added
The checkout flow now lets a customer select USDT on BNB Smart Chain (BEP20), Bitcoin on the Bitcoin network, gift card by email, or Cash App. Crypto addresses and the Cash App URL are configured in `public/booking.js` in the `paymentView()` function.

**Important:** this is a manual-instructions checkout, not a payment processor. It does not detect blockchain transactions, validate gift cards, confirm Cash App payments, or automatically issue tickets. Staff must verify every payment and separately confirm fulfilment. The listed seat options are sample/static data and do not reserve live seats. Do not represent this as an official Luxor/MGM checkout. Before accepting customer funds, verify that the wallet addresses and payment URL are controlled by your business, confirm applicable legal/tax requirements, and define a refund and fulfilment process.
