# ---------------------------------------------------------------------------
# Altus app R8 rules.
# Firebase, OkHttp, Coil, Room, Hilt and WorkManager ship their own consumer
# rules; the rules below cover the stacks that don't (kotlinx.serialization
# generics, Retrofit's reflective service interface, Ktor/supabase-kt).
# ---------------------------------------------------------------------------

# --- kotlinx.serialization -------------------------------------------------
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions
-dontnote kotlinx.serialization.**

# Serializers for our own DTOs, routes and models.
-keep,includedescriptorclasses class com.altuscorp.altus.**$$serializer { *; }
-keepclassmembers class com.altuscorp.altus.** {
    *** Companion;
}
-keepclasseswithmembers class com.altuscorp.altus.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# --- Retrofit (official rules) ----------------------------------------------
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement
-dontwarn javax.annotation.**
-dontwarn kotlin.Unit
-dontwarn retrofit2.KotlinExtensions
-dontwarn retrofit2.KotlinExtensions$*
-if interface * { @retrofit2.http.* <methods>; }
-keep,allowobfuscation interface <1>
-if interface * { @retrofit2.http.* <methods>; }
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-keep,allowobfuscation,allowshrinking class retrofit2.Response

# --- OkHttp / Okio ----------------------------------------------------------
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# --- Ktor / supabase-kt -----------------------------------------------------
-dontwarn io.ktor.**
-dontwarn org.slf4j.**
# kotlinx-atomicfu volatile fields used by Ktor internals.
-keepclassmembers class io.ktor.** {
    volatile <fields>;
}
-keep class io.ktor.client.engine.okhttp.OkHttpEngineContainer { *; }
-keep class io.github.jan.supabase.** { *; }

# --- Firebase ---------------------------------------------------------------
# Covered by bundled consumer rules; keep Messaging service entry point explicit.
-keep class com.altuscorp.altus.core.firebase.AltusMessagingService { *; }

# --- Compose / coroutines debug metadata ------------------------------------
-dontwarn kotlinx.coroutines.debug.**
