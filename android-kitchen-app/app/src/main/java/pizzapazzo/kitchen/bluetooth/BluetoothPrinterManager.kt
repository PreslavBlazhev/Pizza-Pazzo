package pizzapazzo.kitchen.bluetooth

import android.content.Context
import pizzapazzo.kitchen.printer.EscPosPrinterService
import pizzapazzo.kitchen.printer.PrintResult
import pizzapazzo.kitchen.printer.PrinterSettings

/**
 * Glues the Android Bluetooth stack to the transport-agnostic print service:
 * decides, per print job, whether a real RFCOMM transport can be built for the
 * configured printer, and if not — exactly why (so the web UI can show a
 * useful message instead of a generic failure).
 */
class BluetoothPrinterManager(context: Context) {

    val repository = BluetoothDeviceRepository(context.applicationContext)

    fun provideTransport(settings: PrinterSettings): EscPosPrinterService.TransportProvision {
        val mac = settings.printerMac
        if (mac.isNullOrBlank()) {
            return EscPosPrinterService.TransportProvision.Unavailable(
                PrintResult.Reason.NO_PRINTER_SELECTED,
                "Няма избран принтер. Изберете принтер от настройките.",
            )
        }
        val adapter = repository.adapter
            ?: return EscPosPrinterService.TransportProvision.Unavailable(
                PrintResult.Reason.BLUETOOTH_UNAVAILABLE,
                "Устройството няма Bluetooth.",
            )
        if (!repository.isBluetoothEnabled) {
            return EscPosPrinterService.TransportProvision.Unavailable(
                PrintResult.Reason.BLUETOOTH_UNAVAILABLE,
                "Bluetooth е изключен. Включете го от настройките на таблета.",
            )
        }
        if (!repository.hasConnectPermission()) {
            return EscPosPrinterService.TransportProvision.Unavailable(
                PrintResult.Reason.PERMISSION_DENIED,
                "Липсва разрешение за Bluetooth. Отворете настройките на приложението.",
            )
        }
        return EscPosPrinterService.TransportProvision.Ready(
            BluetoothSocketTransport(adapter, mac)
        )
    }
}
