package com.orni.app.wardrobe.util

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64

fun Uri.readBytes(contentResolver: ContentResolver): ByteArray =
    contentResolver.openInputStream(this)?.use { it.readBytes() }
        ?: error("Unable to open photo at $this")

fun ByteArray.toBase64(): String = Base64.encodeToString(this, Base64.NO_WRAP)

fun String.base64ToByteArray(): ByteArray {
    val payload = trim().substringAfter("base64,", trim())
    return Base64.decode(payload, Base64.DEFAULT)
}

fun String.base64ToBitmapOrNull(): Bitmap? {
    val bytes = runCatching { base64ToByteArray() }.getOrNull() ?: return null
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
}

fun String.base64ToBitmap(): Bitmap {
    return base64ToBitmapOrNull() ?: error("Unable to decode base64 image")
}
