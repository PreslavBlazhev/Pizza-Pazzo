package bg.pizzapazzo.app.analytics

import android.app.Activity
import androidx.appcompat.app.AlertDialog
import bg.pizzapazzo.app.R

/**
 * The "usage statistics" question — the one place consent is given or
 * withdrawn. Shown on the first start (not dismissable until answered: until
 * then nothing is collected), and again on demand from the site's
 * app-privacy page or the settings screen, where it shows the current choice
 * and may simply be closed.
 *
 * "Allow" and "Don't allow" are equal buttons, one tap each.
 */
object ConsentDialog {

    fun show(
        activity: Activity,
        analytics: AppAnalytics,
        onDecided: (granted: Boolean) -> Unit = {},
    ): AlertDialog {
        val current = analytics.consent
        val message = activity.getString(R.string.analytics_consent_message) +
            when (current) {
                AppAnalytics.Consent.GRANTED ->
                    "\n\n" + activity.getString(R.string.analytics_consent_current_granted)
                AppAnalytics.Consent.DENIED ->
                    "\n\n" + activity.getString(R.string.analytics_consent_current_denied)
                AppAnalytics.Consent.UNKNOWN -> ""
            }
        return AlertDialog.Builder(activity)
            .setTitle(R.string.analytics_consent_title)
            .setMessage(message)
            .setCancelable(current != AppAnalytics.Consent.UNKNOWN)
            .setPositiveButton(R.string.analytics_consent_allow) { _, _ ->
                analytics.setConsent(true)
                onDecided(true)
            }
            .setNegativeButton(R.string.analytics_consent_deny) { _, _ ->
                analytics.setConsent(false)
                onDecided(false)
            }
            .show()
    }
}
