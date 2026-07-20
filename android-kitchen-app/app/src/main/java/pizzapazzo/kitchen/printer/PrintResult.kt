package pizzapazzo.kitchen.printer

/** Outcome of one print attempt, reported back to the WebView. */
sealed class PrintResult {
    data class Success(val message: String = "Принтирането е успешно") : PrintResult()

    data class Failure(
        val reason: Reason,
        val message: String,
    ) : PrintResult()

    enum class Reason {
        INVALID_ORDER,
        NO_PRINTER_SELECTED,
        BLUETOOTH_UNAVAILABLE,
        PERMISSION_DENIED,
        CONNECTION_FAILED,
        WRITE_FAILED,
        ALREADY_PRINTING,
    }

    val isSuccess: Boolean get() = this is Success
}
