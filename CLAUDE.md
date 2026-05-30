# StudCast — Claude Handoff

## Project Overview

**StudCast** is an AI-powered construction estimator for contractors. It has two distinct layers:

- **Backend (Express/Node.js):** `src/server.js` — AI Supervisor using Gemini. Handles voice transcripts, material extraction, PDF estimates, Stripe subscriptions, Twilio SMS, Firestore persistence.
- **Unity 6 3D Builder:** `unity/Assets/Scripts/` — Consumes JSON packets from the Supervisor to render deterministic 3D wall framing scenes.

The project is hosted on Google Cloud Run. Auth is Google OAuth ID tokens. Multi-tenant by E.164 phone number.

---

## Unity C# Layer — Status as of commit `e68a0bd`

### Files
- `unity/Assets/Scripts/ConstructionManager.cs` — MonoBehaviour entry point
- `unity/Assets/Scripts/ConstructionPayload.cs` — Serializable data contract classes

### What was audited (GCP VM session, 2026-05-30)
A full compilation audit was performed against Unity 6 and cross-referenced against the live backend schema. **Both scripts compile clean — no changes were required.** The previous version had likely failed due to missing `[Serializable]` attributes, absent `SupervisorResponse` wrapper, or missing `using System;`.

### Architecture
The Supervisor endpoint `POST /api/estimate/voice-to-json` returns:
```json
{
  "success": true,
  "intent": {
    "schemaVersion": "1.0",
    "projectType": "wall_frame",
    "dimensions":  { "lengthFt": 20.0, "heightFt": 9.0 },
    "structural":  { "studSpacingInches": 16, "treatedSolePlate": false, "wallType": "exterior" },
    "features":    { "doorOpenings": 1, "windowOpenings": 2, "cornerCount": 4 }
  }
}
```

The C# classes mirror this 1:1:
- `SupervisorResponse` → envelope (`success` + `intent`)
- `ConstructionPayload` → root intent object
- `Dimensions`, `Structural`, `Features` → nested sub-objects

All classes carry `[System.Serializable]` for `JsonUtility.FromJson<T>()`.

### Framing logic (ConstructionManager.cs)
- **Stud height** = `(wallHeightFt × 12) − (1.5" × 2)` — subtracts sole + top plate
- **Opening deduct** = `(doorOpenings × 38") + (windowOpenings × 38")`
- **Field studs** = `floor(netFramingLength / studSpacingInches) + 1`
- **King studs** = `(doorOpenings + windowOpenings) × 2`

### Phase 2 (not yet implemented)
The following stub methods exist and are syntactically valid — wire up once prefabs are assigned in the Inspector:
- `InstantiatePlates(payload, wallLengthIn)`
- `InstantiateFieldStuds(payload, count, studHeightIn)`
- `InstantiateOpenings(payload, totalOpenings, studHeightIn)`
- `InstantiateCorners(payload, cornerCount)`

Uncomment the call block inside `BuildWallFromJSON()` to activate.

---

## Backend Key Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/estimate/voice-to-json` | Transcript → deterministic JSON for Unity Builder |
| POST | `/api/process` | Audio upload → material extraction → Firestore |
| POST | `/api/process-text` | Text input → material extraction → Firestore |
| POST | `/api/generate-pdf` | Estimate → PDF → email via Nodemailer |
| POST | `/api/webhook` | Twilio SMS bridge |
| POST | `/api/webhooks/stripe` | Stripe subscription lifecycle |

Auth: `requireAuth` middleware verifies Google OAuth Bearer token, resolves E.164 phone from email.

---

## Namespace
All Unity data classes live in `LoneRanger.Construction`. `ConstructionManager` is in the global namespace with `using LoneRanger.Construction;` at the top.

---

## Repo
`https://github.com/iPolluxx/StudCast`  
Main branch: `main`  
Last known good commit: `e68a0bd`  
Handoff commit (this file): `9b0f2bd`
