plugins {
  alias(libs.plugins.android.lib)
  alias(libs.plugins.kotlin.android)
  alias(libs.plugins.kotlin.compose)
}

android {
  namespace = "dev.bitplugg.aliceapp2.widget"
  compileSdk = 36

  defaultConfig { minSdk = 29 }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlin {
    compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17 }
  }
  buildFeatures { compose = true }
}

dependencies {
  implementation(project(":core:api"))
  implementation(project(":core:design"))
  val bom = platform(libs.compose.bom)
  implementation(bom)
  implementation(libs.compose.ui)
  implementation(libs.glance)
  implementation(libs.glance.appwidget)
  implementation(libs.glance.material3)
  implementation(libs.work.runtime)
  implementation(libs.kotlinx.serialization.json)
}
