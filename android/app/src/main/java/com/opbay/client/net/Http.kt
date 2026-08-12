package com.opbay.client.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

private const val USER_AGENT = "OpbayClient-Android/1.0.0 (+https://github.com/pisanadam/opbay-client-)"

val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
val FORM_MEDIA = "application/x-www-form-urlencoded".toMediaType()

val json: Json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    isLenient = true
}

val http: OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(20, TimeUnit.SECONDS)
    .readTimeout(60, TimeUnit.SECONDS)
    // Large game files stream for a while; a write timeout would cut them off.
    .writeTimeout(60, TimeUnit.SECONDS)
    .retryOnConnectionFailure(true)
    .build()

/** Raised for non-2xx responses so callers can show the server's own wording. */
class HttpException(val code: Int, val bodyText: String, url: String) :
    IOException("İstek başarısız ($code): $url")

/** Bridges OkHttp's callback API into a cancellable coroutine. */
suspend fun OkHttpClient.await(request: Request): Response = suspendCoroutine { continuation ->
    newCall(request).enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) = continuation.resumeWithException(e)
        override fun onResponse(call: Call, response: Response) = continuation.resume(response)
    })
}

fun requestBuilder(url: String): Request.Builder =
    Request.Builder().url(url).header("User-Agent", USER_AGENT).header("Accept", "application/json")

/** Fetches a URL and decodes the body, throwing [HttpException] on failure. */
suspend inline fun <reified T> fetchJson(
    url: String,
    headers: Map<String, String> = emptyMap()
): T = withContext(Dispatchers.IO) {
    val builder = requestBuilder(url)
    headers.forEach { (key, value) -> builder.header(key, value) }

    http.await(builder.build()).use { response ->
        val body = response.body?.string().orEmpty()
        if (!response.isSuccessful) throw HttpException(response.code, body, url)
        json.decodeFromString<T>(body)
    }
}

suspend inline fun <reified T> postJson(
    url: String,
    body: String,
    headers: Map<String, String> = emptyMap()
): T = withContext(Dispatchers.IO) {
    val builder = requestBuilder(url).post(body.toRequestBody(JSON_MEDIA))
    headers.forEach { (key, value) -> builder.header(key, value) }

    http.await(builder.build()).use { response ->
        val text = response.body?.string().orEmpty()
        if (!response.isSuccessful) throw HttpException(response.code, text, url)
        json.decodeFromString<T>(text)
    }
}

suspend inline fun <reified T> postForm(url: String, fields: Map<String, String>): T =
    withContext(Dispatchers.IO) {
        val encoded = fields.entries.joinToString("&") { (key, value) ->
            "${java.net.URLEncoder.encode(key, "UTF-8")}=${java.net.URLEncoder.encode(value, "UTF-8")}"
        }
        val request = requestBuilder(url).post(encoded.toRequestBody(FORM_MEDIA)).build()

        http.await(request).use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw HttpException(response.code, text, url)
            json.decodeFromString<T>(text)
        }
    }
