package com.orni.app.wardrobe

/**
 * Structured wardrobe intent extracted from the continuous voice stream.
 *
 * [action] drives the correction logic:
 *   - replace  → swap the whole garment ("put him in a suit instead")
 *   - add      → layer something new ("now add sunglasses")
 *   - modify   → change an attribute of the current garment ("make it brown")
 *
 * Fields are nullable so partial intent accumulates incrementally across turns.
 * Generation fires once [garmentType] is non-null.
 */
data class WardrobeIntent(
    val action: Action = Action.Replace,
    val garmentType: String,
    val color: String? = null,
    val material: String? = null,
    val targetArea: String? = null,
) {
    enum class Action { Replace, Add, Modify }

    /** Merge a newer (possibly partial) intent on top of this one. */
    fun mergeWith(newer: WardrobeIntent): WardrobeIntent = WardrobeIntent(
        action = newer.action,
        garmentType = newer.garmentType.ifBlank { garmentType },
        color = newer.color ?: color,
        material = newer.material ?: material,
        targetArea = newer.targetArea ?: targetArea,
    )

    /** Human-readable description forwarded to NB2 Lite / Omni Flash. */
    fun toDescription(): String = buildString {
        append(garmentType)
        color?.let { append(", $it") }
        material?.let { append(", $it") }
    }
}
