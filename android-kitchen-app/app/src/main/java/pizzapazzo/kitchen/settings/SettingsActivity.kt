package pizzapazzo.kitchen.settings

import android.os.Bundle
import android.webkit.WebStorage
import android.webkit.WebView
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import pizzapazzo.kitchen.BuildConfig
import pizzapazzo.kitchen.KitchenApplication
import pizzapazzo.kitchen.R
import pizzapazzo.kitchen.bluetooth.PrinterConnectionState
import pizzapazzo.kitchen.databinding.ActivitySettingsBinding
import pizzapazzo.kitchen.printer.CyrillicEncodingMode
import pizzapazzo.kitchen.printer.PaperWidth
import pizzapazzo.kitchen.printer.PrintResult

/**
 * Native printer + app settings. Everything is stored in [PrinterPreferences];
 * the print pipeline reads a fresh snapshot per job, so changes apply to the
 * very next print without restarting.
 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding
    private val app get() = application as KitchenApplication
    private val prefs get() = app.preferences

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
            if (grants.values.all { it }) showPrinterPicker()
            else Toast.makeText(this, R.string.settings_bt_permission_needed, Toast.LENGTH_LONG).show()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationIcon(androidx.appcompat.R.drawable.abc_ic_ab_back_material)
        binding.toolbar.setNavigationOnClickListener { finish() }

        binding.encodingSpinner.adapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            CyrillicEncodingMode.entries.map { it.label },
        )

        loadValues()

        binding.selectPrinterButton.setOnClickListener { requestPermissionThenPick() }
        binding.testConnectionButton.setOnClickListener { runPrinterAction { app.printerService.testConnection() } }
        binding.testPrintButton.setOnClickListener { runPrinterAction { app.printerService.printTestPage() } }
        binding.disconnectButton.setOnClickListener {
            lifecycleScope.launch {
                app.printerService.disconnect()
                refreshStatus()
            }
        }
        binding.clearCacheButton.setOnClickListener {
            // Clears page cache + web storage, NOT cookies — logout would be
            // hostile on a shared kitchen tablet.
            WebView(this).clearCache(true)
            WebStorage.getInstance().deleteAllData()
            Toast.makeText(this, R.string.settings_cache_cleared, Toast.LENGTH_SHORT).show()
        }
        binding.reloadPageButton.setOnClickListener {
            saveValues()
            app.pendingWebViewReload = true // MainActivity reloads in onResume
            finish()
        }
        binding.saveButton.setOnClickListener {
            saveValues()
            Toast.makeText(this, R.string.settings_saved, Toast.LENGTH_SHORT).show()
            finish()
        }

        binding.paperWidthGroup.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (isChecked && binding.charsPerLineInput.text.isNullOrBlank()) {
                val width = if (checkedId == binding.paper80Button.id) PaperWidth.MM80 else PaperWidth.MM58
                binding.charsPerLineInput.setText(width.defaultCharsPerLine.toString())
            }
        }
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    // ── Values ↔ views ──────────────────────────────────────────────────────

    private fun loadValues() {
        binding.selectedPrinterText.text =
            prefs.printerName?.let { "$it (${prefs.printerMac})" }
                ?: getString(R.string.settings_no_printer)
        binding.paperWidthGroup.check(
            if (prefs.paperWidth == PaperWidth.MM80) binding.paper80Button.id else binding.paper58Button.id
        )
        binding.encodingSpinner.setSelection(prefs.encoding.ordinal)
        binding.charsPerLineInput.setText(prefs.charsPerLine.toString())
        binding.feedLinesInput.setText(prefs.feedLinesAfter.toString())
        binding.autoConnectSwitch.isChecked = prefs.autoConnect
        binding.autoCutSwitch.isChecked = prefs.autoCut
        binding.kitchenUrlInput.setText(prefs.kitchenUrl)
        binding.versionText.text =
            getString(R.string.settings_version, BuildConfig.VERSION_NAME)
        refreshStatus()
    }

    private fun saveValues() {
        prefs.paperWidth =
            if (binding.paperWidthGroup.checkedButtonId == binding.paper80Button.id) PaperWidth.MM80
            else PaperWidth.MM58
        prefs.encoding = CyrillicEncodingMode.entries[binding.encodingSpinner.selectedItemPosition]
        binding.charsPerLineInput.text?.toString()?.toIntOrNull()?.let { prefs.charsPerLine = it }
        binding.feedLinesInput.text?.toString()?.toIntOrNull()?.let { prefs.feedLinesAfter = it }
        prefs.autoConnect = binding.autoConnectSwitch.isChecked
        prefs.autoCut = binding.autoCutSwitch.isChecked
        prefs.kitchenUrl = binding.kitchenUrlInput.text?.toString() ?: ""
    }

    private fun refreshStatus() {
        val stateLabel = when (app.printerService.state) {
            PrinterConnectionState.DISCONNECTED -> getString(R.string.state_disconnected)
            PrinterConnectionState.CONNECTING -> getString(R.string.state_connecting)
            PrinterConnectionState.CONNECTED -> getString(R.string.state_connected)
            PrinterConnectionState.PRINTING -> getString(R.string.state_printing)
            PrinterConnectionState.ERROR -> getString(R.string.state_error)
        }
        binding.printerStatusText.text = getString(R.string.settings_status_label, stateLabel)
        binding.lastErrorText.text = prefs.lastPrintError
            ?.let { getString(R.string.settings_last_error, it) }
            ?: getString(R.string.settings_last_error_none)
        binding.diagnosticsText.text = buildString {
            append("BT: ")
            append(
                when {
                    !app.printerManager.repository.isBluetoothSupported -> "не се поддържа"
                    !app.printerManager.repository.isBluetoothEnabled -> "изключен"
                    else -> "включен"
                }
            )
            append(" · Кодиране: ").append(prefs.encoding.name)
            append(" · ").append(prefs.paperWidth.mm).append(" mm / ")
            append(prefs.charsPerLine).append(" символа")
        }
    }

    // ── Printer picking ─────────────────────────────────────────────────────

    private fun requestPermissionThenPick() {
        val missing = app.printerManager.repository.requiredPermissions()
            .filter { checkSelfPermission(it) != android.content.pm.PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) {
            permissionLauncher.launch(missing.toTypedArray())
        } else {
            showPrinterPicker()
        }
    }

    private fun showPrinterPicker() {
        val devices = app.printerManager.repository.pairedDevices()
        if (devices.isEmpty()) {
            Toast.makeText(this, R.string.settings_no_paired_devices, Toast.LENGTH_LONG).show()
            return
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.settings_select_printer)
            .setItems(devices.map { "${it.name}\n${it.mac}" }.toTypedArray()) { _, which ->
                val device = devices[which]
                prefs.selectPrinter(device.name, device.mac)
                lifecycleScope.launch { app.printerService.disconnect() }
                loadValues()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun runPrinterAction(action: suspend () -> PrintResult) {
        lifecycleScope.launch {
            val result = action()
            if (result is PrintResult.Failure) prefs.lastPrintError = result.message
            val message = when (result) {
                is PrintResult.Success -> result.message
                is PrintResult.Failure -> result.message
            }
            Toast.makeText(this@SettingsActivity, message, Toast.LENGTH_LONG).show()
            refreshStatus()
        }
    }
}
