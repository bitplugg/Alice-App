plugins {
  alias(libs.plugins.android.lib)
  alias(libs.plugins.kotlin.android)
  alias(libs.plugins.kotlin.compose)
}

android {
  namespace = "dev.bitplugg.aliceapp2.design"
  compileSdk = 36

  defaultConfig { minSdk = 29 }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlin {
    compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17 }
  }
}

dependencies {
  val bom = platform(libs.compose.bom)
  implementation(bom)
  api(libs.compose.material3)
  api(libs.compose.material.icons)
  api(libs.compose.ui)
  api(libs.compose.ui.tooling.preview)
  debugApi(libs.compose.ui.tooling)
}
