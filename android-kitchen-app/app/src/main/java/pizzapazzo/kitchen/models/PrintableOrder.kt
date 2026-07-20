package pizzapazzo.kitchen.models

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * The order shape the receipt printer works with.
 *
 * The web side (lib/android-printer.ts in the Next.js project) adapts its real
 * `OrderWithItems` model into this JSON before calling
 * `AndroidPrinter.printOrder(json)`. Parsing here is deliberately defensive:
 * every field except the order number and the item list may be missing or null,
 * unknown fields are ignored, and oversized payloads are rejected outright —
 * the bridge is an attack surface, not a trusted caller.
 */
data class PrintableOrder(
    val orderId: String,
    val orderNumber: String,
    val createdAt: String?,
    val acceptedAt: String?,
    val estimatedMinutes: Int?,
    val customer: Customer,
    val delivery: Delivery,
    val items: List<Item>,
    val paymentMethod: String?,
    val customerNote: String?,
    val subtotal: Double?,
    val deliveryFee: Double?,
    val discount: Double?,
    val total: Double?,
    val currency: String,
    /** Secondary-currency total (BGN on the Pizza Pazzo site), if provided. */
    val totalSecondary: Double?,
    val secondaryCurrency: String?,
    /** True when the staff explicitly asked for a re-print; marked on paper. */
    val isReprint: Boolean,
) {
    data class Customer(
        val name: String?,
        val phone: String?,
        val email: String?,
    )

    data class Delivery(
        /** "DELIVERY" or "PICKUP"; anything else is printed as-is. */
        val type: String,
        val address: String?,
        val city: String?,
        val entrance: String?,
        val floor: String?,
        val apartment: String?,
    )

    data class Item(
        val name: String,
        val quantity: Int,
        val size: String?,
        val unitPrice: Double?,
        val totalPrice: Double?,
        val extras: List<Extra>,
        val removedIngredients: List<String>,
        val note: String?,
    )

    data class Extra(
        val name: String,
        val quantity: Int,
        val price: Double?,
    )

    companion object {
        /** Hard cap on the JSON the bridge accepts (bytes of UTF-8). */
        const val MAX_JSON_BYTES: Int = 100_000

        /**
         * Parses and validates order JSON coming over the JavaScript bridge.
         * Returns a failed [Result] (never throws) with a human-readable
         * Bulgarian message — it travels back to the web UI.
         */
        fun fromJson(json: String): Result<PrintableOrder> {
            if (json.isBlank()) {
                return Result.failure(IllegalArgumentException("Празни данни за поръчката."))
            }
            if (json.toByteArray(Charsets.UTF_8).size > MAX_JSON_BYTES) {
                return Result.failure(IllegalArgumentException("Данните за поръчката са твърде големи."))
            }

            val root = try {
                JSONObject(json)
            } catch (e: JSONException) {
                return Result.failure(IllegalArgumentException("Невалиден JSON за поръчка.", e))
            }

            return try {
                val order = parse(root)
                validate(order)?.let { return Result.failure(IllegalArgumentException(it)) }
                Result.success(order)
            } catch (e: Exception) {
                Result.failure(IllegalArgumentException("Невалидни данни за поръчка.", e))
            }
        }

        private fun parse(root: JSONObject): PrintableOrder {
            val customerObj = root.optJSONObject("customer") ?: JSONObject()
            val deliveryObj = root.optJSONObject("delivery") ?: JSONObject()

            val items = mutableListOf<Item>()
            val itemsArr = root.optJSONArray("items") ?: JSONArray()
            for (i in 0 until itemsArr.length()) {
                val it = itemsArr.optJSONObject(i) ?: continue
                items += Item(
                    name = it.optStringOrNull("name") ?: "",
                    quantity = it.optInt("quantity", 1).coerceAtLeast(1),
                    size = it.optStringOrNull("size"),
                    unitPrice = it.optDoubleOrNull("unitPrice"),
                    totalPrice = it.optDoubleOrNull("totalPrice"),
                    extras = parseExtras(it.optJSONArray("extras")),
                    removedIngredients = parseStringList(it.optJSONArray("removedIngredients")),
                    note = it.optStringOrNull("note"),
                )
            }

            val orderId = root.optStringOrNull("orderId") ?: ""
            val orderNumber = root.optStringOrNull("orderNumber") ?: orderId

            return PrintableOrder(
                orderId = orderId.ifBlank { orderNumber },
                orderNumber = orderNumber,
                createdAt = root.optStringOrNull("createdAt"),
                acceptedAt = root.optStringOrNull("acceptedAt"),
                estimatedMinutes = if (root.has("estimatedMinutes")) root.optInt("estimatedMinutes").takeIf { it > 0 } else null,
                customer = Customer(
                    name = customerObj.optStringOrNull("name"),
                    phone = customerObj.optStringOrNull("phone"),
                    email = customerObj.optStringOrNull("email"),
                ),
                delivery = Delivery(
                    type = deliveryObj.optStringOrNull("type") ?: "DELIVERY",
                    address = deliveryObj.optStringOrNull("address"),
                    city = deliveryObj.optStringOrNull("city"),
                    entrance = deliveryObj.optStringOrNull("entrance"),
                    floor = deliveryObj.optStringOrNull("floor"),
                    apartment = deliveryObj.optStringOrNull("apartment"),
                ),
                items = items,
                paymentMethod = root.optStringOrNull("paymentMethod"),
                customerNote = root.optStringOrNull("customerNote"),
                subtotal = root.optDoubleOrNull("subtotal"),
                deliveryFee = root.optDoubleOrNull("deliveryFee"),
                discount = root.optDoubleOrNull("discount"),
                total = root.optDoubleOrNull("total"),
                currency = root.optStringOrNull("currency") ?: "EUR",
                totalSecondary = root.optDoubleOrNull("totalSecondary"),
                secondaryCurrency = root.optStringOrNull("secondaryCurrency"),
                isReprint = root.optBoolean("isReprint", false),
            )
        }

        private fun parseExtras(arr: JSONArray?): List<Extra> {
            if (arr == null) return emptyList()
            val out = mutableListOf<Extra>()
            for (i in 0 until arr.length()) {
                val e = arr.optJSONObject(i) ?: continue
                val name = e.optStringOrNull("name") ?: continue
                out += Extra(
                    name = name,
                    quantity = e.optInt("quantity", 1).coerceAtLeast(1),
                    price = e.optDoubleOrNull("price"),
                )
            }
            return out
        }

        private fun parseStringList(arr: JSONArray?): List<String> {
            if (arr == null) return emptyList()
            val out = mutableListOf<String>()
            for (i in 0 until arr.length()) {
                val s = arr.optString(i, "")
                if (s.isNotBlank()) out += s
            }
            return out
        }

        /** Returns an error message, or null when the order is printable. */
        private fun validate(order: PrintableOrder): String? = when {
            order.orderNumber.isBlank() -> "Липсва номер на поръчката."
            order.items.isEmpty() -> "Поръчката няма продукти."
            order.items.any { it.name.isBlank() } -> "Продукт без име в поръчката."
            else -> null
        }

        // org.json returns the literal string "null" and sentinel NaN for
        // missing values depending on the getter — these helpers normalize that.
        private fun JSONObject.optStringOrNull(key: String): String? {
            if (!has(key) || isNull(key)) return null
            val v = optString(key, "")
            return v.trim().ifBlank { null }
        }

        private fun JSONObject.optDoubleOrNull(key: String): Double? {
            if (!has(key) || isNull(key)) return null
            val v = optDouble(key)
            return if (v.isNaN()) null else v
        }
    }
}
