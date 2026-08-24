import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing lives outside the repo: android-kitchen-app/keystore.properties
// (gitignored) holds the store path and passwords. Without it the release build
// still assembles — it just comes out unsigned, so a missing file on another
// machine is a clear error at upload time rather than a mystery at build time.
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}
val hasReleaseKeystore = keystoreProperties.getProperty("storeFile") != null

android {
    namespace = "bg.pizzapazzo.app"
    // API 36 (Android 16). Google Play requires new apps and updates to target
    // API 36 from 31 Aug 2026.
    compileSdk = 36

    defaultConfig {
        applicationId = "bg.pizzapazzo.app"
        // Modern kitchen tablets ship with Android 8.0+ (API 26). 26 also means
        // adaptive icons work everywhere, so no legacy PNG icons are needed.
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                // v2 is what Play and every Android 7+ device verify. v1 (JAR
                // signing) is only needed below API 24, and minSdk here is 26 —
                // AGP would drop it anyway.
                enableV2Signing = true
            }
        }
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
            if (hasReleaseKeystore) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    bundle {
        // The UI is Bulgarian-only and lives in the default resource folder, but
        // splitting by language on a tablet whose system language is English has
        // no upside here — ship every string in the base APK.
        language { enableSplit = false }
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }


    testOptions {
        unitTests.isReturnDefaultValues = true
    }

    lint {
        // A release that would crash or get rejected must not build silently.
        abortOnError = true
        warningsAsErrors = false
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("com.google.android.material:material:1.13.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.2")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")

    // Unit tests run on the JVM: android.jar's org.json is a stub there, so the
    // real org.json artifact is pulled in for tests only.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20260814")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
}
