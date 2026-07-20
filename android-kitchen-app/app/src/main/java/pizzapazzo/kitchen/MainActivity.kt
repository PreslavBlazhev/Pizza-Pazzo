package pizzapazzo.kitchen

import android.annotation.SuppressLint
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import pizzapazzo.kitchen.databinding.ActivityMainBinding
import pizzapazzo.kitchen.settings.SettingsActivity
import pizzapazzo.kitchen.webview.JavascriptBridge
import pizzapazzo.kitchen.webview.KitchenWebViewClient

/**
 * The kitchen tablet screen: a fullscreen WebView locked to the Pizza Pazzo
 * live-orders board, with the AndroidPrinter JS bridge attached. No address
 * bar, no external navigation, screen always on.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var webViewClient: KitchenWebViewClient
    private var fileChooserCallback: ValueCallback<Array<android.net.Uri>>? = null
    private var pendingRestore: Bundle? = null

    private val app get() = application as KitchenApplication

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            fileChooserCallback?.onReceiveValue(uris)
            fileChooserCallback = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Kitchen kiosk: never let the tablet sleep while the board is up.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        enterImmersiveMode()

        setUpWebView()
        binding.retryButton.setOnClickListener { loadKitchen() }
        binding.settingsButton.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webView.canGoBack()) {
                    binding.webView.goBack()
                } else {
                    // Kiosk app: back on the root page just backgrounds the app
                    // instead of destroying the logged-in WebView.
                    moveTaskToBack(true)
                }
            }
        })

        watchConnectivity()

        if (savedInstanceState != null) {
            // Restores history + scroll; the session survives anyway because it
            // lives in the cookie store, not in the WebView instance.
            binding.webView.restoreState(savedInstanceState)
            if (binding.webView.url == null) loadKitchen()
        } else {
            loadKitchen()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setUpWebView() {
        val webView = binding.webView

        webView.settings.apply {
            // The admin board is a Next.js app — it needs the full modern set.
            javaScriptEnabled = true
            domStorageEnabled = true // localStorage + sessionStorage
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false // alarm keeps ringing after resume
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false) // no popups/new windows
        }

        // Login session = httpOnly cookie (pp_session). Persist it.
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, false)
        }

        webViewClient = KitchenWebViewClient(
            onBlockedNavigation = {
                Toast.makeText(this, R.string.blocked_external_url, Toast.LENGTH_SHORT).show()
            },
            onPageStarted = {
                binding.progressBar.visibility = View.VISIBLE
            },
            onPageFinished = {
                binding.progressBar.visibility = View.GONE
                binding.errorView.visibility = View.GONE
            },
            onLoadError = { showErrorScreen() },
        )
        webView.webViewClient = webViewClient

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                binding.progressBar.progress = newProgress
                binding.progressBar.visibility = if (newProgress < 100) View.VISIBLE else View.GONE
            }

            // The admin has no uploads today, but the gallery admin (V2) will.
            override fun onShowFileChooser(
                view: WebView,
                filePathCallback: ValueCallback<Array<android.net.Uri>>,
                fileChooserParams: FileChooserParams,
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback
                return try {
                    fileChooserLauncher.launch(fileChooserParams.createIntent())
                    true
                } catch (_: Exception) {
                    fileChooserCallback = null
                    false
                }
            }
        }

        // The bridge object named window.AndroidPrinter. Sensitive calls
        // re-verify the committed origin — see JavascriptBridge.
        webView.addJavascriptInterface(
            JavascriptBridge(
                webView = webView,
                webViewClient = webViewClient,
                printerService = app.printerService,
                preferences = app.preferences,
                scope = lifecycleScope,
                openSettings = { startActivity(Intent(this, SettingsActivity::class.java)) },
            ),
            JavascriptBridge.JS_NAME,
        )
    }

    private fun loadKitchen() {
        if (!isOnline()) {
            showErrorScreen()
            return
        }
        binding.errorView.visibility = View.GONE
        binding.webView.loadUrl(app.preferences.kitchenUrl)
    }

    private fun showErrorScreen() {
        binding.progressBar.visibility = View.GONE
        binding.errorView.visibility = View.VISIBLE
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(ConnectivityManager::class.java)
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    /** Reload automatically when connectivity returns while the error is up. */
    private fun watchConnectivity() {
        val cm = getSystemService(ConnectivityManager::class.java)
        cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                runOnUiThread {
                    if (binding.errorView.visibility == View.VISIBLE) loadKitchen()
                }
            }
        })
    }

    private fun enterImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, binding.root).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersiveMode()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        binding.webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        // Never paused (see onPause), but resuming is harmless and covers the
        // case where the OS paused timers on its own.
        binding.webView.resumeTimers()
        if (app.pendingWebViewReload) {
            app.pendingWebViewReload = false
            loadKitchen()
        }
    }

    override fun onPause() {
        // webView.onPause()/pauseTimers() are deliberately NOT called: the
        // board's 8-second poll and the new-order alarm must keep running while
        // the settings screen (or a system dialog) covers the activity.
        // Cookies are flushed so the login survives a force-stop or crash.
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        binding.webView.destroy()
        super.onDestroy()
    }
}
