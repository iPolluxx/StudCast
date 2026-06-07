# Lone Ranger Estimator — Contractor User Journey

This document details the step-by-step user journey of a residential contractor using the Lone Ranger Estimator, from their initial landing on the website to account activation, estimate creation, customer approvals, and final invoice delivery.

> **Accuracy note (read first).** This describes the **intended end-to-end journey**, which currently spans two
> surfaces: onboarding (Steps 1–5) runs through the **legacy flow** (`public/index.html` → `/dashboard-legacy`,
> Google OAuth → phone/OTP → profile wizard), then hands off to the **React dashboard** (`ui/`, at `/dashboard`)
> for estimating (Steps 6+). Differences in the current build vs. the narrative below:
> • **OTP** is delivered by **email fallback** while Twilio A2P is in review (`SMS_LIVE=false`).
> • In the React app the **voice orb is a scripted demo** (the live intake path is typing → `/api/process-text`).
> • The React app has **no "Contractor vs Average Rates" toggle** and **no unsaved-changes interceptor** (those
>   are legacy `dashboard.html` only); the publish control is labeled **"Publish & Send PDF"** (not "Scope Job"
>   / "Approve & Lock Invoice").
> • Stripe activation is confirmed via `POST /api/billing/verify-session` on return (webhook-independent).

---

## Step 1: Landing & Discovery
* **Goal:** The contractor learns what the tool does and starts the signup process.
* **Journey Details:**
  * The contractor lands on the public home page (`index.html`) from their computer or mobile phone.
  * They see the headline: **"Bid Jobs From Your Truck in 60 Seconds."**
  * They read the description explaining that they can simply text a voice note and get a professional, print-ready PDF estimate instantly.
  * They click the prominent button **"Launch Free Workspace →"** or tap the quick demo card. They are redirected to the secure login gateway (`/dashboard`).

---

## Step 2: Google Authentication & Identity Check
* **Goal:** Verify the contractor's identity and determine if they are an existing user.
* **Journey Details:**
  * On the login screen, the contractor is presented with a standard **"Sign in with Google"** button.
  * They click the button and authorize their Google account.
  * The application receives the Google identity token and checks the backend server to see if a contractor profile is registered under this Google email address.
  * Since this is a new contractor signing up for the first time, the database lookup fails to find a registered record (returning a 403/404 code).
  * The application automatically hides the login screen and opens the **"Create Your Workspace"** onboarding modal.

---

## Step 3: Mobile Phone Registration & SMS OTP Verification
* **Goal:** Bind the contractor's Google email to a unique phone number and verify ownership of that line.
* **Journey Details:**
  * The contractor is prompted to enter their **Company Name** and their **Mobile Phone Number** (e.g., `(555) 123-4567`).
  * Upon clicking **"Create Workspace"**, the system sanitizes the phone number (stripping formatting to ensure strict standard phone formatting) and checks that no other contractor has registered this number.
  * The server generates a random 6-digit verification passcode and sends it to the contractor's mobile phone via Twilio SMS.
  * The onboarding screen automatically transitions to the **"Verify Your Phone"** screen.
  * The contractor checks their phone, receives the text message, types the 6-digit code into the verification input field, and clicks **"Verify Phone Number"**.
  * The server confirms the code matches and permanently activates the phone number connection in their account.

---

## Step 4: Workspace Profile Configuration
* **Goal:** Configure standard business defaults for estimate branding and calculations.
* **Journey Details:**
  * Upon successful phone verification, the app displays the **"Configure Your Workspace"** setup wizard.
  * The contractor fills out essential business information:
    * **Business Email Address** (for customer communications)
    * **Shop / Field Address** (to display on invoices)
    * **Standard Hourly Labor Rate** (defaults to `$55/hr` but can be customized)
    * **License Number** (optional, for formal branding)
  * The contractor clicks **"Complete Profile & Launch"** to write these settings to their persistent database record.

---

## Step 5: Stripe Paid Subscription Gate
* **Goal:** Gate premium features behind a paid subscription plan.
* **Journey Details:**
  * The system checks the subscription status. Since this is a brand new account and their trial is not active, the interface is blocked by the **"Unlock Premium Estimating"** gate modal.
  * The contractor clicks **"Subscribe Now — $49/month"**.
  * They are redirected to a secure Stripe Checkout webpage where they enter their credit card information and complete the purchase.
  * Once the transaction succeeds, Stripe redirects the contractor back to the dashboard.
  * The dashboard displays an information message stating *"Activating workspace tokens..."* while checking the database in the background. Once the Stripe payment webhook processes, the gateway modal disappears, and the full workspace is unlocked.

---

## Step 6: Creating the First Estimate (Voice & Text Intake)
* **Goal:** Input a job scope and let the AI generate an itemized estimate.
* **Journey Details:**
  * Now inside the main dashboard, the contractor inputs the client's details: **Client Name** (e.g., *"John Doe"*) and **Client Address** (e.g., *"456 Oak Lane"*).
  * The contractor clicks the circular microphone button (`#recordBtn`) to begin recording. The microphone icon turns red and pulses with a halo animation to show it is active.
  * The contractor speaks naturally, dictating the scope of the project:
    * *"Drywall repair in the master bedroom. We need six sheets of half-inch drywall, one bucket of joint compound, and one roll of fiberglass mesh tape. Plus four hours of labor at our standard rate. Exclude painting or sanding."*
  * The contractor taps the button again to stop recording. The audio file is uploaded to the server, where Gemini AI processes the audio, translates the speech into text, extracts the itemized items, scopes the costs, and automatically populates the table.
  * (Alternatively, if they are typing, they can write this description directly into the text area and click **"Scope Job"** to achieve the same result).

---

## Step 7: Reviewing & Editing the Ledger (Price Adjustments)
* **Goal:** Review the AI-generated bid and make corrections.
* **Journey Details:**
  * The contractor reviews the generated ledger divided into **Materials** and **Labor** tables.
  * They notice the AI calculated standard pricing. They decide to tweak a line item.
  * The contractor clicks directly into a cell on the grid—such as the drywall price or the labor hours—and types the new value (fractional quantities/hours are allowed). The active cell glows cool-blue to show it is in edit mode, and on desktop they can drive the grid by keyboard (Enter to advance down / add a row, ↑/↓ to move between rows).
  * The project total, taxes, and subtotals recalculate instantly at the bottom of the ledger.
  * Each line carries a price-source badge reflecting the four-tier waterfall: **Yours** (manual cell override), **Saved** (contractor's price book), **Menards · Xh** (live Menards market price, age in hours shown in green), or **Est.** (AI fallback). This makes it instantly clear where every number came from and whether any price is pulled from a live supplier source. *(The React app does not have a "Contractor vs Average Rates" toggle; pricing comes from the four-tier override → price-book → market → AI waterfall plus the manual rate-override panel.)*
  * Deleting a line requires a two-step confirm, and the scope field autosaves on a debounce. *(The React app does not implement the legacy "Unsaved Changes Interceptor"; that modal exists only in `public/dashboard.html`.)*

---

## Step 8: Uploading a Custom Pricing Spreadsheet & Managing the Price Sheet
* **Goal:** Upload their own catalog of materials to standardize future estimate pricing, and keep those prices current against live market data.
* **Journey Details:**
  * To ensure the AI uses their actual supplier pricing instead of regional estimates, the contractor prepares a CSV file containing columns for item descriptions and unit prices.
  * They scroll to the **"Upload Pricing CSV"** section on the dashboard, click to select their file, and click **"Upload Pricing CSV"**.
  * A progress bar updates from 0% to 100% as the file is parsed and saved to their settings profile.
  * From this point forward, the full four-tier waterfall applies: (1) any manual cell override, (2) the contractor's saved price book, (3) Menards live market prices (weekly-scraped for ~70 common WI construction materials), and finally (4) the AI fallback. The ledger badge on each line makes the source visible.
  * Over time, saved prices can go stale as market rates shift. The contractor opens **Settings → Price Sheet tab** to review a merged table of all their saved entries vs. current Menards market data. Amber rows flag items where the saved price has drifted more than 10% from market. A **"Sync all from Menards"** button updates every matched entry in one click. Individual row sync arrows and a delete button (which drops the item back to market/AI tier) are available for per-item control. Menards catalog items not yet in the price book appear in a second table for easy one-click saving.

---

## Step 9: Creating & Dispatched Change Orders
* **Goal:** Address changes in project scope during construction and obtain written customer approval.
* **Journey Details:**
  * During the construction phase, the client requests an modification (e.g., adding two recessed lights).
  * The contractor opens the dashboard, loads the project, and clicks **"New Change Order"**.
  * Inside the Change Order modal, they click record and dictate: *"Add two recessed LED lights, trim kits, and three hours of electrician labor. Excludes painting the ceiling."*
  * The AI extracts the items, calculates the delta cost (e.g., `$350.00`), and formats the exclusions.
  * The contractor types the client's phone number and clicks **"Send"**. The system sends a text message to the client containing a secure, cryptographic approval link.

---

## Step 10: Client Approval Portal Sign-Off
* **Goal:** The customer reviews and legally approves the contract amendment on their phone.
* **Journey Details:**
  * The homeowner receives the text message on their mobile phone and clicks the link.
  * They are taken to a clean, branded webpage titled **"Change Order Approval"** displaying the exact cost increase (`$350.00`), a summary of what is added, and the specific exclusions.
  * The client clicks the green **"Approve Contract Amendment"** button.
  * The webpage displays a green success banner, and the database status of the Change Order is updated to **"Approved."**
  * The contractor's dashboard immediately shows the Change Order has been signed off, adding the amount to the total project contract.

---

## Step 11: Branded PDF Document Generation & Email Delivery
* **Goal:** Export the completed estimate or invoice as a clean PDF for billing.
* **Journey Details:**
  * The contractor is ready to deliver the final proposal or invoice.
  * They click the **"Publish & Send PDF"** button on their dashboard (after a one-tap confirm summary). *(The legacy `dashboard.html` labels this "Approve & Lock Invoice".)*
  * In the background, the server runs a headless Puppeteer browser that compiles the contractor's business details, uploaded logo, license information, client info, itemized materials/labor grid, approved change orders, and the grand total.
  * The server prints this layout into a pixel-perfect, professional PDF document.
  * The PDF is automatically emailed to the contractor and can be forwarded directly to the client.
