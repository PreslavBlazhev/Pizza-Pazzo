package bg.pizzapazzo.app

import android.app.Application
import android.webkit.WebView
import bg.pizzapazzo.app.bluetooth.BluetoothPrinterManager
import bg.pizzapazzo.app.printer.EscPosPrinterService
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
        )
    }
}
