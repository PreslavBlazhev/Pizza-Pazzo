# Minification is disabled for v1 (see app/build.gradle.kts). These rules exist
# so that turning R8 on later does not break the WebView JavaScript bridge:
# methods called from JavaScript must keep their exact names.
-keepclassmembers class pizzapazzo.kitchen.webview.JavascriptBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
