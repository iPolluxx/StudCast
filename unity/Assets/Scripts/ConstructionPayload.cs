using System;

// =============================================================================
//  ConstructionPayload.cs
//  Serializable C# contract classes for the Lone Ranger Supervisor/Builder API.
//
//  These classes mirror the Phase 1 JSON schema emitted by the Express Supervisor
//  at POST /api/estimate/voice-to-json. Unity's JsonUtility.FromJson<T>() requires
//  field names to match the JSON keys exactly (case-sensitive).
//
//  Schema version: 1.0
//  Project type:   wall_frame (Phase 1 only)
//
//  Example payload:
//  {
//    "schemaVersion": "1.0",
//    "projectType": "wall_frame",
//    "dimensions":  { "lengthFt": 20.0, "heightFt": 9.0 },
//    "structural":  { "studSpacingInches": 16, "treatedSolePlate": false, "wallType": "exterior" },
//    "features":    { "doorOpenings": 1, "windowOpenings": 2, "cornerCount": 4 }
//  }
// =============================================================================

namespace StudCast.Construction
{
    /// <summary>
    /// Physical wall dimensions received from the AI Supervisor.
    /// </summary>
    [Serializable]
    public class Dimensions
    {
        /// <summary>Wall run length in feet.</summary>
        public float lengthFt;

        /// <summary>Wall height in feet (floor plate to top plate).</summary>
        public float heightFt;
    }

    /// <summary>
    /// Structural framing parameters. Determines lumber sizing and construction method.
    /// </summary>
    [Serializable]
    public class Structural
    {
        /// <summary>
        /// On-center stud spacing in inches. Sanitized server-side to exactly 16 or 24.
        /// </summary>
        public int studSpacingInches;

        /// <summary>
        /// True when the sole plate is pressure-treated (required over concrete/slab floors).
        /// </summary>
        public bool treatedSolePlate;

        /// <summary>
        /// Wall classification: "exterior" (load-bearing, outer envelope) or
        /// "interior" (partition, non-structural). Affects lumber size and header spec.
        /// </summary>
        public string wallType;
    }

    /// <summary>
    /// Architectural features that interrupt the stud layout and require framed openings.
    /// </summary>
    [Serializable]
    public class Features
    {
        /// <summary>Number of door rough openings in this wall run.</summary>
        public int doorOpenings;

        /// <summary>Number of window rough openings in this wall run.</summary>
        public int windowOpenings;

        /// <summary>
        /// Number of corners or directional turns in the wall layout.
        /// Default 4 = a standard rectangular room. Used to calculate corner assemblies.
        /// </summary>
        public int cornerCount;
    }

    /// <summary>
    /// Root construction intent — the inner payload nested under "intent" in the API response.
    /// Do not deserialize this directly from the raw HTTP response; use SupervisorResponse instead.
    /// </summary>
    [Serializable]
    public class ConstructionPayload
    {
        /// <summary>Schema version string. Currently always "1.0".</summary>
        public string schemaVersion;

        /// <summary>Project type. Currently always "wall_frame" in Phase 1.</summary>
        public string projectType;

        public Dimensions dimensions;
        public Structural  structural;
        public Features    features;
    }

    /// <summary>
    /// Wrapper matching the full HTTP response shape from POST /api/estimate/voice-to-json:
    /// <code>{ "success": true, "intent": { ...ConstructionPayload } }</code>
    /// Pass the raw response body string to JsonUtility.FromJson&lt;SupervisorResponse&gt;(),
    /// then access .intent to get the typed construction payload.
    /// </summary>
    [Serializable]
    public class SupervisorResponse
    {
        /// <summary>True when the Supervisor successfully translated the transcript.</summary>
        public bool success;

        /// <summary>The fully sanitized construction intent payload.</summary>
        public ConstructionPayload intent;
    }
}
