package pizzapazzo.kitchen.settings

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import pizzapazzo.kitchen.printer.CyrillicEncodingMode
import pizzapazzo.kitchen.printer.PaperWidth
import pizzapazzo.kitchen.printer.PrinterSettings

/**
 * Persisted app configuration. Only printer/UI preferences live here — never
 * credentials or tokens: the login session is a normal httpOnly cookie inside
 * the WebView's own cookie store.
 */
class PrinterPreferences(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("kitchen_prefs", Context.MODE_PRIVATE)

    init {
        migrateLegacyStartUrl()
    }

    companion object {
        /**
         * The page the app opens: the site's home page.
         *
         * It used to open the live-orders board directly. The owner asked for
         * the home page instead — the tablet is a normal way into the site,
         * and the board is one tap away through the admin menu. Nothing else
         * depends on the landing page: the printer bridge is allowed by HOST,
         * not by path, so printing keeps working wherever the staff navigate.
         */
        const val DEFAULT_KITCHEN_URL = "https://pizza-pazzo.onrender.com/"

        /**
         * Start pages we used to ship as the default. A stored value equal to
         * one of these was never a choice anybody made — it is what Settings
         * saved back after the user pressed Save with the field pre-filled —
         * so the migration below clears it once, and once only. Typing the
         * board's address by hand afterwards keeps working.
         */
        private val LEGACY_DEFAULT_KITCHEN_URLS = setOf(
            "https://pizza-pazzo.onrender.com/admin/orders/live",
        )

        private const val KEY_PRINTER_NAME = "printer_name"
        private const val KEY_PRINTER_MAC = "printer_mac"
        private const val KEY_PAPER_MM = "paper_mm"
        private const val KEY_CHARS_PER_LINE = "chars_per_line"
        private const val KEY_ENCODING = "encoding"
        private const val KEY_CODE_PAGE = "code_page"
        private const val KEY_AUTO_CONNECT = "auto_connect"
        private const val KEY_AUTO_CUT = "auto_cut"
        private const val KEY_FEED_LINES = "feed_lines"
        private const val KEY_KITCHEN_URL = "kitchen_url"
        private const val KEY_LAST_PRINT_ERROR = "last_print_error"

        /** Bumped whenever a stored value has to be fixed up on upgrade. */
        private const val KEY_PREFS_VERSION = "prefs_version"
        private const val CURRENT_PREFS_VERSION = 1
    }

    /**
     * One-time fix-up so an already-installed tablet actually gets the new
     * start page. Runs once per device (guarded by the version key), never
     * touching a URL the user typed themselves.
     */
    private fun migrateLegacyStartUrl() {
        if (prefs.getInt(KEY_PREFS_VERSION, 0) >= CURRENT_PREFS_VERSION) return

        val stored = prefs.getString(KEY_KITCHEN_URL, null)
        prefs.edit {
            if (stored != null && stored in LEGACY_DEFAULT_KITCHEN_URLS) {
                remove(KEY_KITCHEN_URL)
            }
            putInt(KEY_PREFS_VERSION, CURRENT_PREFS_VERSION)
        }
    }

    var printerName: String?
        get() = prefs.getString(KEY_PRINTER_NAME, null)
        set(value) = prefs.edit { putString(KEY_PRINTER_NAME, value) }

    var printerMac: String?
        get() = prefs.getString(KEY_PRINTER_MAC, null)
        set(value) = prefs.edit { putString(KEY_PRINTER_MAC, value) }

    var paperWidth: PaperWidth
        get() = PaperWidth.fromMm(prefs.getInt(KEY_PAPER_MM, PaperWidth.MM80.mm))
        set(value) = prefs.edit { putInt(KEY_PAPER_MM, value.mm) }

    var charsPerLine: Int
        get() = prefs.getInt(KEY_CHARS_PER_LINE, paperWidth.defaultCharsPerLine)
        set(value) = prefs.edit { putInt(KEY_CHARS_PER_LINE, value.coerceIn(20, 64)) }

    var encoding: CyrillicEncodingMode
        get() = CyrillicEncodingMode.fromName(prefs.getString(KEY_ENCODING, null))
        set(value) = prefs.edit { putString(KEY_ENCODING, value.name) }

    /** -1 = use the encoding mode's default ESC t argument. */
    var codePageOverride: Int
        get() = prefs.getInt(KEY_CODE_PAGE, -2)
        set(value) = prefs.edit { putInt(KEY_CODE_PAGE, value) }

    var autoConnect: Boolean
        get() = prefs.getBoolean(KEY_AUTO_CONNECT, true)
        set(value) = prefs.edit { putBoolean(KEY_AUTO_CONNECT, value) }

    var autoCut: Boolean
        get() = prefs.getBoolean(KEY_AUTO_CUT, true)
        set(value) = prefs.edit { putBoolean(KEY_AUTO_CUT, value) }

    var feedLinesAfter: Int
        get() = prefs.getInt(KEY_FEED_LINES, 4)
        set(value) = prefs.edit { putInt(KEY_FEED_LINES, value.coerceIn(0, 12)) }

    /** The page the app opens on launch. Blank resets it to the home page. */
    var kitchenUrl: String
        get() = prefs.getString(KEY_KITCHEN_URL, DEFAULT_KITCHEN_URL) ?: DEFAULT_KITCHEN_URL
        set(value) = prefs.edit { putString(KEY_KITCHEN_URL, value.trim().ifBlank { DEFAULT_KITCHEN_URL }) }

    var lastPrintError: String?
        get() = prefs.getString(KEY_LAST_PRINT_ERROR, null)
        set(value) = prefs.edit { putString(KEY_LAST_PRINT_ERROR, value) }

    fun selectPrinter(name: String, mac: String) {
        prefs.edit {
            putString(KEY_PRINTER_NAME, name)
            putString(KEY_PRINTER_MAC, mac)
        }
    }

    /** Snapshot used by the print pipeline. */
    fun toSettings(): PrinterSettings {
        val enc = encoding
        val override = codePageOverride
        return PrinterSettings(
            printerName = printerName,
            printerMac = printerMac,
            paperWidth = paperWidth,
            charsPerLine = charsPerLine,
            encoding = enc,
            codePage = if (override >= -1) override else enc.defaultCodePage,
            autoConnect = autoConnect,
            autoCut = autoCut,
            feedLinesAfter = feedLinesAfter,
        )
    }
}
