# Lone Ranger Estimator — Application Features Reference

This document provides a comprehensive, plain-English catalog of every feature available in the Lone Ranger Estimator application. It explains what each feature does, how a contractor interacts with it, and the real-world problem it solves.

> **Implementation status (read first).** This catalogs the full intended product. The **backend (`src/server.js`)
> implements all of these as real routes**, and the **legacy onboarding/dashboard (`public/dashboard.html`,
> `/dashboard-legacy`)** wires most of them end-to-end. The **current React dashboard (`ui/`, served at
> `/dashboard`)** is the primary surface, but a few features there are still **demo simulations** rather than
> live-wired — flagged inline below. Specifically, in the React app: the **voice orb is a scripted demo**
> (plays a sample transcript; the live path is text → `/api/process-text`), **Change Orders + the client
> approval portal are client-side simulations**, and there is **no "Contractor vs Average Rates" toggle and no
> unsaved-changes interceptor** (the interceptor exists only in legacy `dashboard.html`). SMS OTP currently
> routes through the **email fallback** while the Twilio A2P campaign is in review (`SMS_LIVE=false`).

---

## 1. Google Authentication & Multi-Tenant Identity Lock
* **What it does:** Secures the application by restricting access to authorized users. It maps a contractor's Google account email to exactly one tenant workspace (defined by their unique phone number), ensuring data isolation and privacy between different contracting businesses.
* **How a contractor uses it:** When first visiting the dashboard, the contractor clicks "Sign in with Google." If they are a new user, they are automatically routed to the self-registration screen to bind their email to a business phone number. Returning users are logged directly into their private workspace.
* **What problem it solves:** Keeps client data and financial estimates secure, prevents contractors from accessing other businesses' files, and avoids account duplication or mapping conflicts by maintaining a strict one-to-one relationship between a Google account and a registered phone number.

---

## 2. SMS Passcode Verification (Twilio OTP)
* **What it does:** Verifies that the phone number provided by the contractor during registration is active and belongs to them. The system sends a secure, one-time passcode (OTP) which must be successfully entered to complete registration. *(Current state: SMS is gated behind the `SMS_LIVE` flag; while the Twilio A2P 10DLC campaign is in review, the OTP is delivered via the **Gmail email fallback** to the contractor's Google account — the registration UI adapts its wording to the channel used.)*
* **How a contractor uses it:** During the registration step, the contractor inputs their business phone number and clicks "Create Workspace." They receive a 6-digit text message code on their mobile phone, which they type into a pop-up verification form to unlock their account.
* **What problem it solves:** Prevents spam accounts, ensures that the system is associated with a real phone line (crucial for sending client notifications later), and adds an extra layer of authentication security to prevent unauthorized access.

---

## 3. AI-Powered Voice Dictation & Text-to-Estimate Parser
* **What it does:** Transcribes and parses spoken voice notes or typed job scopes using Gemini AI. It automatically identifies the homeowner's name, project address, and compiles a structured list of required materials and labor tasks, applying estimated pricing.
* **How a contractor uses it:** While sitting in their truck or walking a job site, the contractor taps a microphone button on the dashboard, speaks naturally (e.g., *"Framing a new closet. Need twelve 2x4 studs, three sheets of drywall, and about four hours of labor. This is for John Doe at 555 Maple Street"*), and stops recording. Within seconds, a completed, categorized bid sheet appears. They can also type or paste raw text notes to get the same result. *(Current state: the **text path is live** in the React app via `POST /api/process-text`. The **voice orb is a scripted demo** — tapping it plays a sample transcript rather than capturing live audio — although the backend audio-extraction route `POST /api/process` exists. Real mic capture in the React UI is a pending wiring task.)*
* **What problem it solves:** Eliminates the grueling chore of manual data entry after a long day of physical work. Instead of spending hours translating handwritten notes into spreadsheets, contractors can generate complete professional bids in under a minute directly from their truck.

---

## 4. Custom Pricing Database Integration (CSV Catalog Upload)
* **What it does:** Allows contractors to upload their own pricing catalog as a CSV spreadsheet. When parsing a voice or text scope, the AI engine references this custom catalog to retrieve exact rates for materials and labor, only falling back to regional market averages for items not found in the custom list.
* **How a contractor uses it:** The contractor prepares a spreadsheet with their standard materials, labor descriptions, and prices, and uploads it via the "Upload Pricing CSV" box on the dashboard. A progress bar tracks the upload until it is saved to their private settings profile.
* **What problem it solves:** General AI-estimated costs are often inaccurate or differ from a contractor's specific rates. Integrating a custom pricing spreadsheet ensures that every generated estimate reflects the company's real cost structures, eliminating pricing errors.

---

## 5. Dynamic Interactive Ledger Editor
* **What it does:** Renders the generated estimate in an interactive, editable table grid divided into "Materials" and "Labor". It automatically recalculates line totals, labor subtotals, materials subtotals, taxes, and the project grand total in real-time as edits are made.
* **How a contractor uses it:** After the AI generates the initial draft, the contractor can click directly into any text or number cell (description, quantity, price, hours) to modify it inline — including fractional quantities/hours. They can add rows, delete with a two-step confirm, and (on desktop) drive the grid by keyboard (Enter advances down / adds a row, ↑/↓ move between rows). Each line shows a price-source badge — **Est.** (AI), **Yours** (manual override), **Saved** (from price book). *(Note: the React app has no "Contractor vs Average Rates" toggle; per-item pricing comes from the override/price-book/AI waterfall and the manual rate-override panel.)*
* **What problem it solves:** AI drafts are rarely 100% perfect. This editor allows contractors to review, correct, and fine-tune itemized details on-the-fly, ensuring complete accuracy before presenting the document to a customer.

---

## 6. Workspace Profile & Business Settings Panel
* **What it does:** Stores a contractor's persistent business profile—including contact email, shop or field address, license numbers, default tax rates, and default hourly labor rates—and overlays this information on all outgoing customer documentation.
* **How a contractor uses it:** The contractor opens the Settings panel (gear icon) to input or update their credentials, set their default state tax percentage, and establish their baseline hourly labor charge.
* **What problem it solves:** Saves the contractor from having to repeatedly type their business credentials, license numbers, or tax information for every new job. It ensures consistent, legally compliant company branding across all client-facing files.

---

## 7. Company Logo Branding
* **What it does:** Allows contractors to upload their business logo, storing it in their workspace profile and rendering it at the top of all client-facing documents.
* **How a contractor uses it:** Under the Settings panel, the contractor clicks "Upload Logo," chooses an image file from their device, and saves.
* **What problem it solves:** Elevates a contractor's professional image by removing generic document formats and replacing them with premium, branded paperwork, helping them stand out from competitors and win more bids.

---

## 8. AI-Powered Change Order Delta Engine
* **What it does:** Generates delta-based contract amendments (Change Orders) for existing estimates. The AI compares new voice or text scope instructions with the active project budget, calculates the price differences, compiles new materials and labor additions, and notes any project exclusions.
* **How a contractor uses it:** The contractor selects an active project, clicks "New Change Order," dictates or types what changed (e.g., *"Client requested to switch to solid oak trim instead of pine, adding 80 linear feet and 3 hours of trim labor"*), and clicks generate. The system creates a separate, mini-bill reflecting only the cost of that change.
* **What problem it solves:** Scope creep is a major profit killer in construction. Contractors often perform extra work based on verbal agreements, only to face payment disputes later. This feature documents and prices changes instantly on the job site. *(Current state: fully wired on the backend — `POST /api/change-orders/generate` + `/send`. In the React app, the Change Order panel and the client-approval portal are **client-side simulations** for demo; the legacy `dashboard.html` uses the real endpoints.)*

---

## 9. SMS Client Dispatch & Digital Approval Portal
* **What it does:** Sends generated Change Orders directly to the client's phone via SMS containing a secure, cryptographically-protected link. The client can open the link on their mobile device to review the changes, read a PDF copy, and click an "Approve Contract Amendment" button to legally sign off.
* **How a contractor uses it:** After creating a Change Order, the contractor enters the customer's cell phone number and clicks "Send." The client receives a text message, opens the link on their phone, reviews the price adjustments, and taps "Approve." The contractor's dashboard immediately updates to show the amendment has been approved.
* **What problem it solves:** Speeds up approvals from days to minutes. Contractors no longer have to track down homeowners for physical signatures or wait to order materials, keeping projects moving forward smoothly.

---

## 10. Unsaved Changes Protection (Dirty Form Interceptor) — *legacy `dashboard.html` only*
* **What it does:** Monitors whether a contractor has unsaved edits in their current active project ledger. If they attempt to switch to a different estimate, log out, or refresh the page, the application halts the action and prompts them to decide how to handle the changes. *(This `dirtyConfirmModal` exists only in the legacy `public/dashboard.html`; the current React dashboard does not implement it — the scope field autosaves on a debounce instead.)*
* **How a contractor uses it:** If the contractor edits a cell in the ledger and accidentally clicks the "New Project" button or tries to open a different estimate from the dropdown list, a pop-up modal blocks the screen, asking if they want to "Save Now", "Discard Changes", or "Cancel" to return to editing.
* **What problem it solves:** Prevents accidental loss of complex bid revisions, saving contractors from frustrating rework due to misclicks or browser refreshes.

---

## 11. Multi-Project Historical Ledger
* **What it does:** Serves as a digital filing cabinet, storing all past estimates and change orders. It allows the contractor to search, select, reload, review, or delete historical client records.
* **How a contractor uses it:** The contractor opens a dropdown list at the top of the ledger panel to browse active estimates, showing the client names and total project costs. Selecting an entry instantly populates the active workspace with that project's complete historical details.
* **What problem it solves:** Eliminates lost paperwork and cluttered email threads. Contractors have a single, unified database of all past customer interactions, bids, and change histories accessible from anywhere.

---

## 12. Paid Subscription Gatekeeper (Stripe SaaS Integration)
* **What it does:** Automatically locks access to premium estimating tools and PDF generation to access premium features. It redirects unpaid or expired accounts to a secure Stripe Billing portal to activate a $49/month subscription.
* **How a contractor uses it:** If a contractor's account is inactive or unpaid, a subscription barrier modal locks the interface. Clicking "Subscribe Now" takes them to Stripe to securely input payment details. Upon completion, they are automatically returned to their fully unlocked dashboard.
* **What problem it solves:** Secures recurring revenue for the application software as a service (SaaS), protecting expensive backend artificial intelligence processing tokens from abuse, while giving the contractor a self-service way to manage their subscription.
