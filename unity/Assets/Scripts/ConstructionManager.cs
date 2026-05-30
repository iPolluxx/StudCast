using UnityEngine;
using LoneRanger.Construction;

// =============================================================================
//  ConstructionManager.cs
//  MonoBehaviour entry point for the Lone Ranger 3D Builder.
//
//  Responsibilities:
//    1. Receive a JSON payload string from the Supervisor API.
//    2. Deserialize it into a ConstructionPayload.
//    3. Derive framing geometry (stud count, plate lengths, opening offsets).
//    4. Drive the procedural prefab instantiation loop (Phase 2).
//
//  Wire-up:
//    Attach this component to a persistent GameObject (e.g. "ConstructionManager")
//    in your scene. Call BuildWallFromJSON() from your API bridge script after
//    receiving the HTTP response from POST /api/estimate/voice-to-json.
// =============================================================================

public class ConstructionManager : MonoBehaviour
{
    // ── Inspector-configurable prefabs (assign in Unity Editor) ──────────────
    [Header("Framing Prefabs")]
    [Tooltip("Standard stud prefab (2x4 or 2x6 depending on wallType).")]
    public GameObject studPrefab;

    [Tooltip("Sole / top plate prefab.")]
    public GameObject platePrefab;

    [Tooltip("King stud prefab used to frame door and window openings.")]
    public GameObject kingStudPrefab;

    [Tooltip("Header prefab placed above door and window rough openings.")]
    public GameObject headerPrefab;

    [Tooltip("Corner assembly prefab (3-stud or California corner).")]
    public GameObject cornerPrefab;

    // ── Framing constants ────────────────────────────────────────────────────
    private const float INCHES_PER_FOOT   = 12f;
    private const float PLATE_THICKNESS_IN = 1.5f;  // nominal 2x lumber actual thickness

    // Standard rough opening widths (inches) — adjust per code or project spec
    private const float DOOR_RO_WIDTH_IN   = 38f;   // 36" door + 2" clearance
    private const float WINDOW_RO_WIDTH_IN = 38f;   // typical 36" window rough opening

    // ── Public API ───────────────────────────────────────────────────────────

    /// <summary>
    /// Parses the raw HTTP response body from POST /api/estimate/voice-to-json and drives
    /// the 3D wall build sequence. Expects the full response envelope:
    /// <code>{ "success": true, "intent": { ...ConstructionPayload } }</code>
    /// </summary>
    /// <param name="jsonPayloadString">Raw JSON response body string from the Supervisor API.</param>
    public void BuildWallFromJSON(string jsonPayloadString)
    {
        // ── Step 1: Deserialize ──────────────────────────────────────────────
        // Unwrap the SupervisorResponse envelope first, then extract .intent.
        // The API returns { "success": true, "intent": { schema fields } } —
        // deserializing directly to ConstructionPayload would silently produce null sub-objects.
        SupervisorResponse response = JsonUtility.FromJson<SupervisorResponse>(jsonPayloadString);

        if (response == null || !response.success || response.intent == null)
        {
            Debug.LogError("[ConstructionManager] Failed to parse Supervisor response or success=false. Aborting build.");
            return;
        }

        ConstructionPayload payload = response.intent;

        Debug.Log($"[ConstructionManager] ── Payload Received ──────────────────────────────");
        Debug.Log($"[ConstructionManager]  Schema  : {payload.schemaVersion}  |  Type: {payload.projectType}");
        Debug.Log($"[ConstructionManager]  Dims    : {payload.dimensions.lengthFt} ft long  x  {payload.dimensions.heightFt} ft tall");
        Debug.Log($"[ConstructionManager]  Spacing : {payload.structural.studSpacingInches}\" OC");
        Debug.Log($"[ConstructionManager]  Plates  : {(payload.structural.treatedSolePlate ? "Pressure-Treated sole plate" : "Standard sole plate")}");
        Debug.Log($"[ConstructionManager]  WallType: {payload.structural.wallType}");
        Debug.Log($"[ConstructionManager]  Doors   : {payload.features.doorOpenings}  |  Windows: {payload.features.windowOpenings}  |  Corners: {payload.features.cornerCount}");
        Debug.Log($"[ConstructionManager] ─────────────────────────────────────────────────");

        // ── Step 2: Derive framing geometry ─────────────────────────────────
        float wallLengthIn  = payload.dimensions.lengthFt * INCHES_PER_FOOT;
        float wallHeightIn  = payload.dimensions.heightFt * INCHES_PER_FOOT;
        float studHeightIn  = wallHeightIn - (PLATE_THICKNESS_IN * 2f); // subtract sole + top plate

        // Total linear inches consumed by door and window rough openings
        float openingDeductIn = (payload.features.doorOpenings   * DOOR_RO_WIDTH_IN)
                              + (payload.features.windowOpenings * WINDOW_RO_WIDTH_IN);

        float netFramingLengthIn = Mathf.Max(0f, wallLengthIn - openingDeductIn);

        // Field stud count across the net framing length (excludes king/trimmer studs at openings)
        int fieldStudCount = Mathf.FloorToInt(netFramingLengthIn / payload.structural.studSpacingInches) + 1;

        // King studs: 2 per opening (door or window)
        int totalOpenings   = payload.features.doorOpenings + payload.features.windowOpenings;
        int kingStudCount   = totalOpenings * 2;
        int totalStudCount  = fieldStudCount + kingStudCount;

        // Corner assemblies
        int cornerCount = payload.features.cornerCount;

        Debug.Log($"[ConstructionManager]  Wall length    : {wallLengthIn:F1}\"  ({payload.dimensions.lengthFt} ft)");
        Debug.Log($"[ConstructionManager]  Stud height    : {studHeightIn:F1}\"  (wall minus 2 plates)");
        Debug.Log($"[ConstructionManager]  Opening deduct : {openingDeductIn:F1}\"  ({totalOpenings} opening(s))");
        Debug.Log($"[ConstructionManager]  Field studs    : {fieldStudCount}");
        Debug.Log($"[ConstructionManager]  King studs     : {kingStudCount}  ({totalOpenings} opening(s) x 2)");
        Debug.Log($"[ConstructionManager]  TOTAL studs    : {totalStudCount}");
        Debug.Log($"[ConstructionManager]  Corner assemblies: {cornerCount}");

        // ── Step 3: Instantiation loop (Phase 2 — prefabs required) ─────────
        //
        //  TODO: Uncomment and implement once prefabs are assigned in the Inspector.
        //
        //  InstantiatePlates(payload, wallLengthIn);
        //  InstantiateFieldStuds(payload, fieldStudCount, studHeightIn);
        //  InstantiateOpenings(payload, totalOpenings, studHeightIn);
        //  InstantiateCorners(payload, cornerCount);
        //
        Debug.Log("[ConstructionManager]  Prefab instantiation loop ready — assign prefabs in Inspector to activate.");
    }

    // ── Private helpers (stubs — implement in Phase 2) ───────────────────────

    private void InstantiatePlates(ConstructionPayload payload, float wallLengthIn)
    {
        // Sole plate + top plate spanning the full wall length.
        // treatedSolePlate flag should swap the sole plate prefab material to PT lumber.
        Debug.Log($"[ConstructionManager]  [STUB] InstantiatePlates — length {wallLengthIn:F1}\" | treated: {payload.structural.treatedSolePlate}");
    }

    private void InstantiateFieldStuds(ConstructionPayload payload, int count, float studHeightIn)
    {
        // Place `count` studs at studSpacingInches intervals along the wall run.
        // Exterior walls: use 2x6 prefab. Interior walls: use 2x4 prefab.
        Debug.Log($"[ConstructionManager]  [STUB] InstantiateFieldStuds — {count} studs @ {payload.structural.studSpacingInches}\" OC | height {studHeightIn:F1}\" | {payload.structural.wallType}");
    }

    private void InstantiateOpenings(ConstructionPayload payload, int totalOpenings, float studHeightIn)
    {
        // For each opening: place king studs, trimmer studs, header, and cripple studs.
        // Door openings run floor-to-header. Window openings include a rough sill.
        Debug.Log($"[ConstructionManager]  [STUB] InstantiateOpenings — {payload.features.doorOpenings} door(s), {payload.features.windowOpenings} window(s)");
    }

    private void InstantiateCorners(ConstructionPayload payload, int cornerCount)
    {
        // Corner assemblies connect intersecting wall runs.
        // Standard 3-stud corner for exterior; California corner for interior partitions.
        Debug.Log($"[ConstructionManager]  [STUB] InstantiateCorners — {cornerCount} corner(s) | {payload.structural.wallType}");
    }
}
