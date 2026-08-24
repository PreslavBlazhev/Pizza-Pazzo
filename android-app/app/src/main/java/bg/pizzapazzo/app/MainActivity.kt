package bg.pizzapazzo.app

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
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import bg.pizzapazzo.app.databinding.ActivityMainBinding
import bg.pizzapazzo.app.settings.SettingsActivity
import bg.pizzapazzo.app.webview.JavascriptBridge
import bg.pizzapazzo.app.webview.SiteWebViewClient
import bg.pizzapazzo.app.webview.StaffRoutes

/**
 * The whole app: one WebView onto the Pizza Pazzo site, with the AndroidPrinter
 * JS bridge attached.
 *
 * It serves two people out of the same screen. A customer gets an ordinary
 * Android app — edge-to-edge, system bars where they belong, back that walks
 * the history and then leaves. Staff who navigate into /admin get the kitchen
 * terminal on top of that: screen kept awake, system bars out of the way. The
 * switch is [applyScreenModeFor], driven by the URL, and it is cosmetic — who
 * may actually reach /admin is the server's decision, not this class's.
 *
 * Constant either way: no address bar, and no navigation off the allowlist.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var webViewClient: SiteWebViewClient
    private var fileChooserCallback: ValueCallback<Array<android.net.Uri>>? = null
    private var pendingRestore: Bundle? = null

    /** Set when a renderer crash already destroyed the WebView — see onDestroy. */
    private var webViewDestroyed = false

    /** True while the current page is the staff area (see [StaffRoutes]). */
    private var staffMode = false

    /**
     * Enabled only while the WebView has somewhere to go back to. Disabled, the
     * dispatcher falls through to the platform default, which finishes the
     * activity — ordinary Android behaviour.
     */
    private val backCallback = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            if (binding.webView.canGoBack()) binding.webView.goBack()
        }
    }

    private val app get() = application as PizzaPazzoApplication

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

        // Edge-to-edge, the way every modern Android app draws. NOT immersive:
        // hiding the system bars is a kitchen-terminal behaviour and is applied
        // per page in applyScreenModeFor(), never to a customer browsing pizzas.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        applyWindowInsets()

        setUpWebView()
        binding.retryButton.setOnClickListener { loadStartPage() }
        binding.settingsButton.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        // Back walks the WebView's history; on the first page the callback
        // switches itself off so the system's own back runs. That is what makes
        // the app behave like an Android app rather than a kiosk you cannot
        // leave — and it is what lets Android 16 play its predictive-back
        // animation, because it can see in advance that nobody will intercept.
        onBackPressedDispatcher.addCallback(this, backCallback)

        watchConnectivity()

        if (savedInstanceState != null) {
            // Restores history + scroll; the session survives anyway because it
            // lives in the cookie store, not in the WebView instance.
            binding.webView.restoreState(savedInstanceState)
            if (binding.webView.url == null) loadStartPage()
        } else {
            loadStartPage()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setUpWebView() {
        val webView = binding.webView

        webView.settings.apply {
            // The admin board is a Next.js app — it needs the full modern set.
            javaScriptEnabled = true
            domStorageEnabled = true // localStorage + sessionStorage
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

        webViewClient = SiteWebViewClient(
            onBlockedNavigation = {
                Toast.makeText(this, R.string.blocked_external_url, Toast.LENGTH_SHORT).show()
            },
            onExternalUri = ::openOutsideTheApp,
            onPageStarted = {
                binding.progressBar.visibility = View.VISIBLE
            },
            onPageFinished = {
                binding.progressBar.visibility = View.GONE
                binding.errorView.visibility = View.GONE
            },
            onLoadError = { showErrorScreen() },
            onRendererGone = { rebuildAfterRendererCrash() },
            onNavigated = { url -> onNavigated(url) },
        )
        webView.webViewClient = webViewClient

        // A download would otherwise hit a dead end inside the WebView. The
        // site has none today; this is the safety net for the day it does.
        webView.setDownloadListener { url, _, _, _, _ ->
            if (!openOutsideTheApp(android.net.Uri.parse(url))) {
                Toast.makeText(this, R.string.blocked_external_url, Toast.LENGTH_SHORT).show()
            }
        }

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

    /**
     * Hands a URI the WebView refuses to load to whatever app owns it — the
     * dialer for `tel:`, the mail client for `mailto:`, the browser for an
     * off-site link. Returns false when no app can take it, so the caller can
     * fall back to the "external sites don't open here" toast.
     *
     * FLAG_ACTIVITY_NEW_TASK keeps the other app in its own task: pressing
     * back from the dialer returns to the board, not to a half-dead WebView.
     */
    private fun openOutsideTheApp(uri: android.net.Uri): Boolean {
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            startActivity(intent)
            true
        } catch (_: android.content.ActivityNotFoundException) {
            false
        } catch (_: SecurityException) {
            false
        }
    }

    /**
     * The WebView's renderer process died. The dead view can never render
     * again, so it is detached and destroyed and the activity is rebuilt from
     * scratch. The login survives regardless — it lives in the cookie store,
     * not in the WebView.
     */
    private fun rebuildAfterRendererCrash(): Boolean {
        val dead = binding.webView
        (dead.parent as? android.view.ViewGroup)?.removeView(dead)
        dead.destroy()
        webViewDestroyed = true
        recreate()
        return true
    }

    private fun loadStartPage() {
        if (!isOnline()) {
            showErrorScreen()
            return
        }
        binding.errorView.visibility = View.GONE
        binding.webView.loadUrl(app.preferences.startUrl)
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
                    if (binding.errorView.visibility == View.VISIBLE) loadStartPage()
                }
            }
        })
    }

    /**
     * Called on every committed navigation, including the site's client-side
     * route changes.
     *
     * Two things depend on where we are. Back must know whether the WebView has
     * history left, and the screen must know whether it is a phone in someone's
     * hand or a terminal on the kitchen counter.
     */
    private fun onNavigated(url: String?) {
        backCallback.isEnabled = binding.webView.canGoBack()
        applyScreenModeFor(url)
    }

    /**
     * The one place where the app behaves differently for staff.
     *
     * On the orders board the screen stays awake and the system bars get out of
     * the way — a cook with full hands cannot keep tapping to wake a tablet.
     * Everywhere else those are exactly the wrong things to do to somebody's
     * phone, so they are switched back off the moment the page leaves /admin.
     */
    private fun applyScreenModeFor(url: String?) {
        val staff = StaffRoutes.isStaffArea(url)
        if (staff == staffMode) return
        staffMode = staff

        val controller = WindowInsetsControllerCompat(window, binding.root)
        if (staff) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    /**
     * Edge-to-edge means the window now reaches under the status and navigation
     * bars, so the content has to be padded away from them by hand. Without
     * this the top of the page sits behind the clock and the bottom behind the
     * gesture handle.
     */
    private fun applyWindowInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            // In staff mode the bars are hidden and the insets come back as
            // zero, so the board still gets the whole screen.
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Only the staff terminal re-hides the bars after a system dialog.
        if (hasFocus && staffMode) {
            WindowInsetsControllerCompat(window, binding.root)
                .hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        // recreate() after a renderer crash saves state on the way out, and a
        // destroyed WebView has nothing left to save.
        if (!webViewDestroyed) binding.webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        // Never paused (see onPause), but resuming is harmless and covers the
        // case where the OS paused timers on its own.
        binding.webView.resumeTimers()
        if (app.pendingWebViewReload) {
            app.pendingWebViewReload = false
            loadStartPage()
        }
    }

    override fun onPause() {
        // Nothing is paused here on purpose. onPause also fires when the
        // settings screen or a system dialog merely covers the activity, and
        // the orders board's poll and alarm must survive that.
        // Cookies are flushed so the login survives a force-stop or crash.
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onStop() {
        // Genuinely in the background now, not just covered.
        //
        // For a customer this is a phone in a pocket: leaving JavaScript timers
        // running there costs battery for a page nobody is looking at, so the
        // WebView is put to sleep.
        //
        // For the staff terminal it is the opposite — the board polls every
        // eight seconds and rings an alarm on a new order, and a cook who
        // switched apps for a moment still needs to hear it. So staff mode is
        // left running.
        if (!staffMode && !webViewDestroyed) {
            binding.webView.onPause()
            binding.webView.pauseTimers()
        }
        super.onStop()
    }

    override fun onStart() {
        super.onStart()
        if (!webViewDestroyed) {
            binding.webView.onResume()
            binding.webView.resumeTimers()
        }
    }

    override fun onDestroy() {
        if (!webViewDestroyed) binding.webView.destroy()
        super.onDestroy()
    }
}
