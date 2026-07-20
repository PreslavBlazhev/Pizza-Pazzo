plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "pizzapazzo.kitchen"
    compileSdk = 35

    defaultConfig {
        applicationId = "pizzapazzo.kitchen"
        // Modern kitchen tablets ship with Android 8.0+ (API 26). 26 also means
        // adaptive icons work everywhere, so no legacy PNG icons are needed.
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        debug {
            // Debug builds may talk to a dev server over plain HTTP (localhost /
            // LAN IP). Release builds are HTTPS-only (see network_security_config).
            buildConfigField("boolean", "ALLOW_DEV_ORIGINS", "true")
        }
        release {
            buildConfigField("boolean", "ALLOW_DEV_ORIGINS", "false")
            // Minification is OFF for v1: R8 renaming can silently break the
            // @JavascriptInterface bridge and the WebView JS callbacks. If it is
            // ever enabled, keep rules for the bridge are already in
            // proguard-rules.pro.
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Unit tests run on the JVM: android.jar's org.json is a stub there, so the
    // real org.json artifact is pulled in for tests only.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}
