package pizzapazzo.kitchen.bluetooth

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothSocket
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import pizzapazzo.kitchen.printer.PrinterTransport
import java.io.IOException
import java.io.OutputStream
import java.util.UUID

/**
 * Bluetooth Classic SPP/RFCOMM link to a *paired* thermal printer.
 *
 * All I/O runs on Dispatchers.IO — BluetoothSocket.connect() and stream writes
 * are blocking calls and must never touch the main thread. `connect()` is
 * additionally wrapped in a timeout because a powered-off printer otherwise
 * blocks for a very long OS-level timeout.
 *
 * Callers guarantee BLUETOOTH_CONNECT permission before constructing this
 * (checked in BluetoothDeviceRepository / EscPosPrinterService), hence the
 * @SuppressLint("MissingPermission").
 */
@SuppressLint("MissingPermission")
class BluetoothSocketTransport(
    private val adapter: BluetoothAdapter,
    private val mac: String,
) : PrinterTransport {

    companion object {
        /** Standard Serial Port Profile UUID — what ESC/POS printers expose. */
        val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    }

    private var socket: BluetoothSocket? = null
    private var output: OutputStream? = null

    override val isConnected: Boolean
        get() = socket?.isConnected == true && output != null

    override suspend fun connect(timeoutMs: Long) = withContext(Dispatchers.IO) {
        close()
        val device = adapter.getRemoteDevice(mac)
        // Ongoing discovery slows RFCOMM connects dramatically; we never start
        // discovery ourselves, but another app might have.
        try {
            adapter.cancelDiscovery()
        } catch (_: SecurityException) {
            // No SCAN permission — fine, we didn't start discovery either.
        }
        val s = device.createRfcommSocketToServiceRecord(SPP_UUID)
        try {
            withTimeout(timeoutMs) {
                // connect() is blocking; withTimeout + IO dispatcher lets the
                // caller give up while the OS call finishes in the background.
                s.connect()
            }
            socket = s
            output = s.outputStream
        } catch (e: Exception) {
            try {
                s.close()
            } catch (_: IOException) {
            }
            throw if (e is IOException) e else IOException("Connect failed: ${e.message}", e)
        }
    }

    override suspend fun write(bytes: ByteArray) = withContext(Dispatchers.IO) {
        val out = output ?: throw IOException("Not connected")
        out.write(bytes)
        out.flush()
    }

    override suspend fun close() = withContext(Dispatchers.IO) {
        try {
            output?.close()
        } catch (_: IOException) {
        }
        try {
            socket?.close()
        } catch (_: IOException) {
        }
        output = null
        socket = null
    }
}
