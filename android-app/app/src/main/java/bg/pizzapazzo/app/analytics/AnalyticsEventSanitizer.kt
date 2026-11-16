package bg.pizzapazzo.app.analytics

import org.json.JSONArray
import org.json.JSONObject

/**
 * The gate every event from the website passes before it reaches Google
 * Analytics.
 *
 * The site talks to the app through `window.AndroidAnalytics.logEvent(name,
 * json)` (see [bg.pizzapazzo.app.webview.AnalyticsBridge]). Whatever arrives
 * there is treated as untrusted input and rebuilt from an ALLOWLIST: known
 * event names, known parameters, known item fields, each type- and
 * size-checked. Anything else is dropped — so a bug on the site, or a
 * compromised page, cannot push a customer's name, e-mail, phone or address
 * into GA4 by inventing a parameter for it.
 *
 * Pure Kotlin on org.json, so it is covered by JVM unit tests. Never throws:
 * input it cannot make sense of returns null and nothing is logged.
 */
object AnalyticsEventSanitizer {

    /** GA4 recommended events the site may send. */
    private val ECOMMERCE_EVENTS = setOf("view_item", "add_to_cart", "begin_checkout", "purchase")
    private val AUTH_EVENTS = setOf("login", "sign_up")

    /** The only currency the restaurant sells in. */
    const val CURRENCY = "EUR"

    const val MAX_ITEMS = 50
    private const val MAX_TEXT = 100
    private const val MAX_VALUE = 100_000.0
    private const val MAX_QUANTITY = 999

    private val TRANSACTION_ID = Regex("^\\d{1,9}$")
    private val ITEM_ID = Regex("^[A-Za-z0-9_-]{1,64}$")
    private val METHOD = Regex("^[a-z_]{1,20}$")
    private val CATEGORY = Regex("^[a-z0-9_-]{1,40}$")

    /**
     * Text that looks like personal data rather than a product name: an
     * e-mail address, or a run of digits long enough to be a phone number.
     */
    private val LOOKS_PERSONAL = Regex("@|\\d[\\d\\s-]{5,}\\d")

    data class Event(
        val name: String,
        /** String, Double or Long values only. */
        val params: Map<String, Any>,
        /** Each item: String, Double or Long values only. Empty for non-ecommerce. */
        val items: List<Map<String, Any>>,
    ) {
        val transactionId: String? get() = params["transaction_id"] as? String
    }

    fun sanitize(name: String?, json: String?): Event? {
        if (name == null) return null
        val root = try {
            if (json.isNullOrBlank()) JSONObject() else JSONObject(json)
        } catch (_: Exception) {
            return null
        }
        return when (name) {
            in ECOMMERCE_EVENTS -> ecommerce(name, root)
            in AUTH_EVENTS -> auth(name, root)
            else -> null
        }
    }

    private fun auth(name: String, root: JSONObject): Event {
        val params = buildMap<String, Any> {
            val method = root.optString("method", "")
            if (METHOD.matches(method)) put("method", method)
        }
        return Event(name, params, emptyList())
    }

    private fun ecommerce(name: String, root: JSONObject): Event? {
        // Anything other than EUR is a bug upstream, not a number to report.
        val currency = root.optString("currency", CURRENCY)
        if (currency != CURRENCY) return null

        val items = items(root.optJSONArray("items")) ?: return null
        if (items.isEmpty()) return null

        val value = money(root.opt("value")) ?: return null

        val params = mutableMapOf<String, Any>("currency" to CURRENCY, "value" to value)

        if (name == "purchase") {
            // A purchase without its order number could never be de-duplicated
            // — better not reported at all.
            val id = root.opt("transaction_id")?.toString() ?: return null
            if (!TRANSACTION_ID.matches(id)) return null
            params["transaction_id"] = id
            money(root.opt("shipping"))?.let { params["shipping"] = it }
        }
        return Event(name, params, items)
    }

    private fun items(array: JSONArray?): List<Map<String, Any>>? {
        if (array == null || array.length() > MAX_ITEMS) return null
        val out = ArrayList<Map<String, Any>>(array.length())
        for (i in 0 until array.length()) {
            val raw = array.optJSONObject(i) ?: return null
            out += item(raw) ?: return null
        }
        return out
    }

    private fun item(raw: JSONObject): Map<String, Any>? {
        val id = raw.opt("item_id")?.toString() ?: return null
        if (!ITEM_ID.matches(id)) return null
        val name = text(raw.opt("item_name")) ?: return null
        val quantity = (raw.opt("quantity") as? Number)?.toDouble()
            ?.takeIf { it % 1.0 == 0.0 && it in 1.0..MAX_QUANTITY.toDouble() }
            ?.toLong()
            ?: return null
        val price = money(raw.opt("price")) ?: return null

        return buildMap {
            put("item_id", id)
            put("item_name", name)
            put("price", price)
            put("quantity", quantity)
            text(raw.opt("item_variant"))?.let { put("item_variant", it) }
            raw.opt("item_category")?.toString()
                ?.takeIf { CATEGORY.matches(it) }
                ?.let { put("item_category", it) }
        }
    }

    /** A product-ish string: present, short, and not shaped like contact data. */
    private fun text(value: Any?): String? {
        val s = (value as? String)?.trim() ?: return null
        if (s.isEmpty() || s.length > MAX_TEXT) return null
        if (LOOKS_PERSONAL.containsMatchIn(s)) return null
        return s
    }

    /** A sum in EUR, rounded to cents; null for anything that is not one. */
    private fun money(value: Any?): Double? {
        val d = (value as? Number)?.toDouble() ?: return null
        if (d.isNaN() || d.isInfinite() || d < 0.0 || d > MAX_VALUE) return null
        return Math.round(d * 100.0) / 100.0
    }
}
