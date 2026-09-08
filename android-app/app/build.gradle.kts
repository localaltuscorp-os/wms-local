import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

// google-services.json carries the Firebase client config for project
// altuscorp-e7140. The plugin is applied only when the file is present so the
// scaffold syncs and builds before the config file is dropped in — Firebase can
// also be initialised at runtime from BuildConfig.FIREBASE_API_KEY.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

// Defaults point at production. Override per-build via gradle.properties or
// -Paltus.apiBaseUrl=http://10.0.2.2:3000 (local Next.js dev server from an emulator).
// The Supabase anon key and Firebase web API key are public-by-design client
// identifiers (same values the web bundle ships); RLS + Firebase ID-token
// verification are the real gates. The service-role key and DATABASE_URL must
// NEVER appear here.
val apiBaseUrl: String =
    providers.gradleProperty("altus.apiBaseUrl").getOrElse("https://wms.mananvasa.com")
val firebaseApiKey: String =
    providers.gradleProperty("altus.firebaseApiKey").getOrElse("AIzaSyBNQ9eTGVV3SxX-g0BKxwVcLzNsI1fezlM")
// Runtime-Firebase fallback identity (used only when google-services.json is
// absent): email/password auth needs just the API key; the real mobilesdk_app_id
// (required for FCM) arrives with google-services.json or via this property.
val firebaseAppId: String =
    providers.gradleProperty("altus.firebaseAppId").getOrElse("1:96159197030:android:5da0cc6ec88775f12f4aa7")
val firebaseProjectId: String =
    providers.gradleProperty("altus.firebaseProjectId").getOrElse("altuscorp-e7140")
val supabaseUrl: String =
    providers.gradleProperty("altus.supabaseUrl").getOrElse("https://mwaijzxuyicysvimzspx.supabase.co")
val supabaseAnonKey: String =
    providers.gradleProperty("altus.supabaseAnonKey").getOrElse(
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13YWlqenh1eWljeXN2aW16c3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MTgwMzEsImV4cCI6MjA5NTA5NDAzMX0.rBUE5ZPefJJ4qa-KBn6wCVdR3A2lfRhLik0Ypa4COgo",
    )

android {
    namespace = "com.altuscorp.altus"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.altuscorp.altus"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        buildConfigField("String", "FIREBASE_API_KEY", "\"$firebaseApiKey\"")
        buildConfigField("String", "FIREBASE_APP_ID", "\"$firebaseAppId\"")
        buildConfigField("String", "FIREBASE_PROJECT_ID", "\"$firebaseProjectId\"")
        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
    }

    applicationVariants.all {
        outputs.all {
            val output = this as com.android.build.gradle.internal.api.BaseVariantOutputImpl
            output.outputFileName = "Altus Corp WMS.apk"
        }
    }

    buildTypes {
        debug {
            // Keep the applicationId identical to release so one google-services.json
            // entry and one FCM registration cover both build types.
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // Debug-signed so an installable release APK builds out of the box;
            // swap in the real upload keystore before store distribution.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            excludes += "/META-INF/INDEX.LIST"
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
    arg("room.incremental", "true")
}

// The Ktor triangle: supabase-kt 3.6 (built against Ktor 3.1.3), Coil3's ktor3
// network backend, and the OkHttp engine must all resolve to ONE Ktor version.
// A single mismatched transitive Ktor artifact is a classpath-time failure, so
// the whole io.ktor group is force-aligned to the catalog pin.
configurations.all {
    resolutionStrategy {
        eachDependency {
            if (requested.group == "io.ktor") {
                useVersion(libs.versions.ktor.get())
            }
        }
        // firebase-auth (BoM 34) transitively pulls androidx.browser 1.10.0, whose
        // AAR metadata demands compileSdk 36 + AGP 8.9 — beyond this project's
        // pinned compileSdk 35 / AGP 8.7.3. The app never opens Custom Tabs
        // (email/password + biometric auth only), so the last 35-compatible
        // browser artifact is pinned.
        force("androidx.browser:browser:1.8.0")
    }
}

dependencies {
    // Compose (BOM-aligned)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.animation)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    // Core / lifecycle / activity
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    // Navigation (type-safe @Serializable routes)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.hilt.navigation.compose)

    // Hilt DI (+ WorkManager factory)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)

    // Offline-first spine: Room-as-truth + WorkManager outbox + DataStore prefs
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.datastore.preferences)

    // Kotlinx
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services) // Task.await() bridge for Firebase
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.collections.immutable)

    // /api/mobile REST layer
    implementation(libs.retrofit)
    implementation(libs.retrofit2.kotlinx.serialization.converter)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging.interceptor)

    // Supabase Realtime + Storage (+ optional Postgrest) over the shared OkHttp/Ktor stack
    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.realtime.kt)
    implementation(libs.supabase.storage.kt)
    implementation(libs.supabase.postgrest.kt)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.kotlinx.json)

    // Firebase auth + FCM (project altuscorp-e7140)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.messaging)

    // Device capabilities: biometric punch gate + geofence location
    implementation(libs.androidx.biometric.ktx)
    implementation(libs.play.services.location)

    // Celebration — konfetti particle burst when the daily gate completes
    implementation(libs.konfetti.compose)

    // Images / perf / logging
    implementation(libs.coil.compose)
    implementation(libs.coil.network.ktor3)
    implementation(libs.androidx.profileinstaller)
    implementation(libs.timber)

    // Tests
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
}
