package com.orni.app.ad

/**
 * Structured intent extracted from the continuous voice stream.
 * Mirrors the reference repo's Intent schema (pipeline.py / schemas.py).
 */
data class AdIntent(
    val action: Action = Action.Create,
    val product: String = "",
    val background: String? = null,
    val copyText: String? = null,
    val style: String? = null,
    val motion: String? = null,       // animate action: motion brief + voiceover cue
    val language: String? = null,     // localize action: ISO code e.g. "hi", "kn"
    val aspect: Aspect = Aspect.Vertical,
    val energy: Energy = Energy.Medium,
    val interrupt: Boolean = false,   // user said "wait / no / actually" mid-sentence
    val confidence: Float = 1f,
) {
    enum class Action { Create, Edit, Animate, Localize, Wardrobe, Unknown }
    enum class Aspect(val ratio: String) { Vertical("9:16"), Square("1:1"), Landscape("16:9") }
    enum class Energy { Low, Medium, High }

    /** Merge a newer (possibly partial) intent on top of this one. */
    fun mergeWith(newer: AdIntent): AdIntent = copy(
        action = newer.action,
        product = newer.product.ifBlank { product },
        background = newer.background ?: background,
        copyText = newer.copyText ?: copyText,
        style = newer.style ?: style,
        motion = newer.motion ?: motion,
        language = newer.language ?: language,
        aspect = newer.aspect,
        energy = newer.energy,
        interrupt = newer.interrupt,
    )

    val isActionable: Boolean
        get() = action != Action.Unknown && (
            product.isNotBlank() || language != null || motion != null
        )
}
