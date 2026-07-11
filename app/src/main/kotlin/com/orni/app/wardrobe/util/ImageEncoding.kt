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

fun String.base64ToByteArray(): ByteArray = Base64.decode(this, Base64.NO_WRAP)

fun String.base64ToBitmap(): Bitmap {
    val bytes = base64ToByteArray()
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
}
