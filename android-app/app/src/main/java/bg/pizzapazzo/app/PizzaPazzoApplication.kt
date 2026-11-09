package bg.pizzapazzo.app

import android.app.Application
import android.webkit.WebView
import bg.pizzapazzo.app.bluetooth.BluetoothPrinterManager
import bg.pizzapazzo.app.printer.EscPosPrinterService
import bg.pizzapazzo.app.printer.PaperWidth
import bg.pizzapazzo.app.printer.ReceiptLogo
import java.util.concurrent.ConcurrentHashMap
import bg.pizzapazzo.app.settings.PrinterPreferences

/**
 * Application-scoped wiring: one preferences store, one Bluetooth manager and
 * ONE print service shared by MainActivity (JS bridge) and SettingsActivity —
 * a shared instance is what makes the double-print mutex actually global.
 */
class PizzaPazzoApplication : Application() {

    lateinit var preferences: PrinterPreferences
        private set
    lateinit var printerManager: BluetoothPrinterManager
        private set
    lateinit var printerService: EscPosPrinterService
        private set

    /** Set by SettingsActivity ("reload page"); consumed by MainActivity.onResume. */
    @Volatile
    var pendingWebViewReload: Boolean = false

    override fun onCreate() {
        super.onCreate()

        // Stated outright rather than left to the platform default: this WebView
        // carries a live STAFF/ADMIN session, and remote DevTools inspection of
        // it is a development convenience, never something a shipped build does.
        // BuildConfig.DEBUG is false in every artifact that reaches Play.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        preferences = PrinterPreferences(this)
        printerManager = BluetoothPrinterManager(this)
        printerService = EscPosPrinterService(
            settingsProvider = { preferences.toSettings() },
            transportFactory = { settings -> printerManager.provideTransport(settings) },
            logoProvider = { settings -> receiptLogo(settings.paperWidth) },
        )
    }

    private val logoCache = ConcurrentHashMap<PaperWidth, ReceiptLogo>()

    /**
     * The bundled logo raster for a paper width, read once and cached. Any
     * failure returns null, and the receipt prints the header text instead.
     */
    private fun receiptLogo(paper: PaperWidth): ReceiptLogo? {
        logoCache[paper]?.let { return it }
        val res = when (paper) {
            PaperWidth.MM58 -> R.raw.receipt_logo_288
            PaperWidth.MM80 -> R.raw.receipt_logo_384
        }
        val logo = runCatching {
            resources.openRawResource(res).use { ReceiptLogo.parse(it.readBytes()) }
        }.getOrNull() ?: return null
        logoCache[paper] = logo
        return logo
    }
}
