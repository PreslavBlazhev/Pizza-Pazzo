package pizzapazzo.kitchen

import android.app.Application
import pizzapazzo.kitchen.bluetooth.BluetoothPrinterManager
import pizzapazzo.kitchen.printer.EscPosPrinterService
import pizzapazzo.kitchen.settings.PrinterPreferences

/**
 * Application-scoped wiring: one preferences store, one Bluetooth manager and
 * ONE print service shared by MainActivity (JS bridge) and SettingsActivity —
 * a shared instance is what makes the double-print mutex actually global.
 */
class KitchenApplication : Application() {

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
        preferences = PrinterPreferences(this)
        printerManager = BluetoothPrinterManager(this)
        printerService = EscPosPrinterService(
            settingsProvider = { preferences.toSettings() },
            transportFactory = { settings -> printerManager.provideTransport(settings) },
        )
    }
}
