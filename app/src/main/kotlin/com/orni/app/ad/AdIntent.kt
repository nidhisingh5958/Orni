package com.orni.app.ad

/**
 * Structured intent extracted from the continuous voice stream.
 *
 * Fields are nullable so partial intent can be accumulated incrementally —
 * generation is triggered once [product] is non-null and at least one visual
 * attribute ([background], [copyText], or [style]) is present.
 */
data class AdIntent(
    val product: String,
    val background: String? = null,
    val copyText: String? = null,
    val style: String? = null,
) {
    /** Merge a newer (possibly partial) intent on top of this one. */
    fun mergeWith(newer: AdIntent): AdIntent = AdIntent(
        product = newer.product.ifBlank { product },
        background = newer.background ?: background,
        copyText = newer.copyText ?: copyText,
        style = newer.style ?: style,
    )

    val isActionable: Boolean
        get() = product.isNotBlank() && (background != null || copyText != null || style != null)
}
