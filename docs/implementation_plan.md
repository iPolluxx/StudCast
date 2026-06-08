# Implementation Plan — Client Details & Change Order Integration

This plan outlines the steps to replace simulated mock features in the React frontend dashboard with fully functional backend integrations for **Client Details**, **Change Order Generation**, and **Twilio SMS Dispatch**.

## User Review Required

> [!IMPORTANT]
> **Autosaving Flow**: This implementation uses the debounced autosaving pattern currently applied to the *Scope of Work* field. As the contractor types the client's name, phone, or address, changes will be persisted to Firestore in the background after a 1.2-second pause. No manual "Save Details" button is needed.

## Open Questions

> [!WARNING]
> **Phone Number Formatting**: The backend uses standard E.164 formatting (`+15551234567`) for SMS sends. Should we include automatic formatting helper masks in the UI text boxes (e.g., matching standard US phone numbers `(555) 123-4567` and converting them behind the scenes), or keep it simple with raw text inputs?

---

## Proposed Changes

We will modify two core frontend React files to wire up the inputs and API routes: the main App container and the Ledger Table component.

### Frontend Dashboard Components

#### [MODIFY] [LedgerTable.tsx](file:///home/pollux/.gemini/antigravity/scratch/voice-to-estimate-gemini/ui/src/components/LedgerTable.tsx)
* **API Props Expansion**:
  * Add `clientName`, `clientAddress`, `clientPhone` props.
  * Add an `onClientDetailChange` callback function prop: `(field: string, val: string) => void`.
* **Layout Reshape**:
  * Replace the single-column `Scope of Work` container at the top of the table with a two-column responsive grid layout (`grid grid-cols-1 md:grid-cols-2 gap-4`).
  * **Column 1: Client Metadata Card**:
    * Render three input text boxes inside a card: **Client Name**, **Client Phone Number** (labeled input), and **Client Project Address**.
    * Apply `.frosted-input` classes, custom `text-micro` uppercase labels, and placeholder text.
    * Wire their `value` and `onChange` handlers to trigger `onClientDetailChange`.
  * **Column 2: Scope of Work Card**:
    * Render the existing text-area box inside the right half of the grid, maintaining its full functional bindings.

#### [MODIFY] [App.tsx](file:///home/pollux/.gemini/antigravity/scratch/voice-to-estimate-gemini/ui/src/App.tsx)
* **Client Details State & Debounce**:
  * Pass `client_name`, `client_address`, and `client_phone` from the `activeEstimate` state down to the `<LedgerTable>` component.
  * Implement `onClientDetailChange` to immediately update the local state array.
  * Set up debounced timers to issue `POST /api/estimates/:id/save` requests, saving individual client metadata fields to Firestore automatically.
* **Real Change Order Generation**:
  * Rewrite `handleGenerateChangeOrder` to call `POST /api/change-orders/generate`.
  * Pass `{ parentEstimateId: activeEstimateId, text: changeOrderInput }` in the JSON request body.
  * On success, write the returned change order object into the local state (`setDerivedChangeOrder`).
* **Real SMS Client Dispatch**:
  * Rewrite `handleSendClientSMS` to call `POST /api/change-orders/send`.
  * Add a local state `smsRecipientPhone` which defaults to `activeEstimate.client_phone`.
  * Render an input field inside the **Constructed Addendum** box showing the recipient phone number.
  * Pass `{ changeOrderId: derivedChangeOrder.id, parentEstimateId: activeEstimateId, clientPhone: smsRecipientPhone }` in the JSON request body.
  * Show a loading spinner during the network call, followed by a success toast once dispatched.

---

## Verification Plan

### Automated Tests
* Run `npm run test` (or `npx jest`) to confirm that all 56 offline sanitization and pricing engine tests remain green.

### Manual Verification
1. **Autosave Verification**:
   * Open a project, type `John Doe` into the client name box, wait 2 seconds, and refresh the browser. Verify the name is successfully retrieved from Firestore.
2. **Change Order Integration**:
   * Type *"Add 10 sheets of OSB and 2 hours of labor"* into the Change Order panel. Click "Formulate Change Addendum." Verify it calls the backend, calculates prices based on the price book/waterfall, and displays the exact total.
3. **SMS Dispatch**:
   * Enter your test cell phone number into the recipient box and click "Dispatch Authorization." Confirm that a real SMS is sent to the phone containing the secure approval link.
