package pizzapazzo.kitchen.bluetooth

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

/** A paired device as shown in the printer picker. */
data class PairedDevice(val name: String, val mac: String)

/**
 * Read-only access to already-paired (bonded) Bluetooth devices. The app never
 * scans/discovers — the printer is paired once through Android's own Bluetooth
 * settings, which avoids both the discovery permissions and battery drain.
 */
class BluetoothDeviceRepository(private val context: Context) {

    val adapter: BluetoothAdapter?
        get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    val isBluetoothSupported: Boolean get() = adapter != null
    val isBluetoothEnabled: Boolean get() = adapter?.isEnabled == true

    /**
     * Android 12+ gates bonded-device access behind the runtime permission
     * BLUETOOTH_CONNECT; older versions only need the manifest permissions.
     */
    fun hasConnectPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED

    fun requiredPermissions(): Array<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            emptyArray()
        }

    /** Bonded devices, printer-friendliest first (empty without permission). */
    fun pairedDevices(): List<PairedDevice> {
        if (!hasConnectPermission()) return emptyList()
        val bonded = try {
            adapter?.bondedDevices ?: emptySet()
        } catch (_: SecurityException) {
            emptySet()
        }
        return bonded
            .map { PairedDevice(it.name ?: it.address, it.address) }
            .sortedBy { it.name.lowercase() }
    }
}
