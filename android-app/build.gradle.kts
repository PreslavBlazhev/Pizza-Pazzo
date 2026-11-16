// Root build file — plugin versions only; module config lives in app/build.gradle.kts.
plugins {
    id("com.android.application") version "8.13.2" apply false
    id("org.jetbrains.kotlin.android") version "2.2.21" apply false
    // Reads app/google-services.json (Firebase project "pizza-pazzo").
    id("com.google.gms.google-services") version "4.5.0" apply false
}
