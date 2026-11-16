package bg.pizzapazzo.app.analytics

import android.content.Context
import android.os.Bundle
import android.util.Log
import androidx.core.content.edit
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.FirebaseAnalytics.ConsentStatus
import com.google.firebase.analytics.FirebaseAnalytics.ConsentType
import bg.pizzapazzo.app.BuildConfig

/**
 * Google Analytics 4 (through Firebase) for the app — and the consent that
 * gates it.
 *
 * Nothing is collected until the user says yes:
 *  - the manifest starts Firebase with collection OFF and every Consent Mode
 *    signal DENIED, so not even `first_open` leaves the device before a
 *    decision;
 *  - [setConsent] (the first-run dialog, or the "statistics" button on the
 *    site's app-privacy page) is the only thing that turns it on;
 *  - saying no — or withdrawing a yes — turns collection off and wipes the
 *    app-instance id and anything not yet uploaded ([FirebaseAnalytics.resetAnalyticsData]).
 *
 * Only analytics storage is ever granted. Advertising storage, ad user data
 * and ad personalisation stay denied, the advertising id is not collected
 * (and its permission is removed in the manifest), and no user id or user
 * property is ever set. What is reported is listed in [AnalyticsEventSanitizer]
 * and [ScreenNames].
 *
 * Every Firebase call is wrapped: analytics must never be the reason the app
 * fails to open or an order fails to go through.
 */
class AppAnalytics(context: Context) {

    enum class Consent { UNKNOWN, GRANTED, DENIED }

    private val prefs =
        context.applicationContext.getSharedPreferences("analytics_prefs", Context.MODE_PRIVATE)

    private val firebase: FirebaseAnalytics? =
        if (BuildConfig.ANALYTICS_ENABLED) {
            try {
                FirebaseAnalytics.getInstance(context.applicationContext)
            } catch (e: Exception) {
                Log.w(TAG, "Firebase Analytics unavailable", e)
                null
            }
        } else {
            null
        }

    private val purchases = ReportedTransactions(
        load = { prefs.getString(KEY_PURCHASES, null) },
        save = { prefs.edit { putString(KEY_PURCHASES, it) } },
    )

    /** False in the staging build, or if Firebase failed to start. */
    val isSupported: Boolean get() = firebase != null

    val consent: Consent
        get() = when (prefs.getString(KEY_CONSENT, null)) {
            Consent.GRANTED.name -> Consent.GRANTED
            Consent.DENIED.name -> Consent.DENIED
            else -> Consent.UNKNOWN
        }

    /** Events go out only when this is true. */
    val isCollecting: Boolean get() = isSupported && consent == Consent.GRANTED

    /** Re-applies the stored decision; called once at app start. */
    fun start() {
        applyToFirebase(consent == Consent.GRANTED, wipe = false)
    }

    /** The user's decision — from the first-run dialog or a later change. */
    fun setConsent(granted: Boolean) {
        val wasGranted = consent == Consent.GRANTED
        prefs.edit {
            putString(KEY_CONSENT, if (granted) Consent.GRANTED.name else Consent.DENIED.name)
            putLong(KEY_DECIDED_AT, System.currentTimeMillis())
        }
        applyToFirebase(granted, wipe = !granted && wasGranted)
    }

    private fun applyToFirebase(granted: Boolean, wipe: Boolean) {
        val fa = firebase ?: return
        safely {
            fa.setConsent(
                mapOf(
                    ConsentType.ANALYTICS_STORAGE to
                        if (granted) ConsentStatus.GRANTED else ConsentStatus.DENIED,
                    ConsentType.AD_STORAGE to ConsentStatus.DENIED,
                    ConsentType.AD_USER_DATA to ConsentStatus.DENIED,
                    ConsentType.AD_PERSONALIZATION to ConsentStatus.DENIED,
                )
            )
            fa.setAnalyticsCollectionEnabled(granted)
            if (wipe) fa.resetAnalyticsData()
        }
    }

    /** One page of the site, already reduced to its route by [ScreenNames]. */
    fun logScreen(screen: ScreenNames.Screen) {
        if (!isCollecting) return
        val fa = firebase ?: return
        safely {
            fa.logEvent(
                FirebaseAnalytics.Event.SCREEN_VIEW,
                Bundle().apply {
                    putString(FirebaseAnalytics.Param.SCREEN_NAME, screen.name)
                    putString(FirebaseAnalytics.Param.SCREEN_CLASS, SCREEN_CLASS)
                },
            )
        }
    }

    /**
     * An event sent by the site. Returns true only if it was logged —
     * false when there is no consent, the event did not pass the
     * [AnalyticsEventSanitizer], or it is a purchase already reported.
     */
    fun logWebEvent(name: String?, json: String?): Boolean {
        if (!isCollecting) return false
        val fa = firebase ?: return false
        val event = AnalyticsEventSanitizer.sanitize(name, json) ?: return false
        event.transactionId?.let { if (!purchases.recordIfNew(it)) return false }
        return safely {
            fa.logEvent(event.name, toBundle(event))
            true
        } ?: false
    }

    private fun toBundle(event: AnalyticsEventSanitizer.Event): Bundle {
        val bundle = Bundle()
        event.params.forEach { (k, v) -> bundle.putValue(k, v) }
        if (event.items.isNotEmpty()) {
            val items = event.items.map { item ->
                Bundle().apply { item.forEach { (k, v) -> putValue(k, v) } }
            }
            bundle.putParcelableArray(FirebaseAnalytics.Param.ITEMS, items.toTypedArray())
        }
        return bundle
    }

    private fun Bundle.putValue(key: String, value: Any) {
        when (value) {
            is String -> putString(key, value)
            is Long -> putLong(key, value)
            is Double -> putDouble(key, value)
        }
    }

    private inline fun <T> safely(block: () -> T): T? =
        try {
            block()
        } catch (e: Exception) {
            Log.w(TAG, "analytics call failed", e)
            null
        }

    companion object {
        private const val TAG = "AppAnalytics"
        private const val KEY_CONSENT = "consent"
        private const val KEY_DECIDED_AT = "consent_decided_at"
        private const val KEY_PURCHASES = "reported_purchases"

        /** Every page lives in the one WebView. */
        private const val SCREEN_CLASS = "WebView"
    }
}
