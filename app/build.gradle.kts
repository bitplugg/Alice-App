plugins {
  alias(libs.plugins.android.app)
  alias(libs.plugins.kotlin.android)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.kotlin.serialization)
}

val projectSecrets: Map<String, String> = run {
  val f = rootProject.file(".env")
  if (!f.exists()) emptyMap()
  else f.readLines()
    .map { it.trim() }
    .filter { it.isNotEmpty() && !it.startsWith("#") && '=' in it }
    .associate { l -> l.substring(0, l.indexOf('=')).trim() to l.substring(l.indexOf('=') + 1).trim() }
}
fun secret(name: String): String? =
  System.getenv(name)?.takeIf { it.isNotBlank() } ?: projectSecrets[name]?.takeIf { it.isNotBlank() }

android {
  namespace = "dev.bitplugg.aliceapp2"
  compileSdk = 36

  defaultConfig {
    applicationId = "dev.bitplugg.aliceapp.v2"
    minSdk = 29
    targetSdk = 36
    versionCode = 204
    versionName = "2.0.4"
    vectorDrawables.useSupportLibrary = true
  }

  signingConfigs {
    create("alice") {
      val ks = rootProject.file("keystore/alice2.jks")
      val pwd = secret("ALICE2_KS_PASSWORD")
      if (ks.exists() && pwd != null) {
        storeFile = ks
        storePassword = pwd
        keyAlias = secret("ALICE2_KS_ALIAS") ?: "alice2"
        keyPassword = secret("ALICE2_KS_KEY_PASSWORD") ?: pwd
      }
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      val sc = signingConfigs.getByName("alice")
      if (sc.storeFile?.exists() == true) signingConfig = sc
    }
    debug { applicationIdSuffix = ".debug" }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlin {
    compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17 }
  }

  buildFeatures { compose = true }

  androidResources { localeFilters += listOf("ru", "en") }

  packaging {
    resources.excludes += setOf(
      "/META-INF/{AL2.0,LGPL2.1}",
      "/META-INF/versions/9/OSGI-INF/MANIFEST.MF",
    )
  }
}

dependencies {
  implementation(project(":core:api"))
  implementation(project(":core:design"))
  implementation(project(":widget"))
  val bom = platform(libs.compose.bom)
  implementation(bom)
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.activity.compose)
  implementation(libs.androidx.lifecycle.runtime)
  implementation(libs.androidx.lifecycle.viewmodel)
  implementation(libs.compose.material3)
  implementation(libs.compose.material.icons)
  implementation(libs.compose.ui)
  implementation(libs.datastore.prefs)
  implementation(libs.work.runtime)
  implementation(libs.kotlinx.serialization.json)
  implementation(libs.shizuku.api)
  implementation(libs.shizuku.provider)
  testImplementation(libs.junit)
}
