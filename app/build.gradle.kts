import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/* ─── секреты: сначала переменная окружения, потом корневой .env ───
   .env в .gitignore и в репозиторий не попадает (см. .env.example). */
val projectSecrets: Map<String, String> = run {
    val f = rootProject.file(".env")
    if (!f.exists()) emptyMap()
    else f.readLines()
        .map { it.trim() }
        .filter { it.isNotEmpty() && !it.startsWith("#") && '=' in it }
        .associate { line ->
            val i = line.indexOf('=')
            line.substring(0, i).trim() to line.substring(i + 1).trim()
        }
}
fun secret(name: String): String? =
    System.getenv(name)?.takeIf { it.isNotBlank() } ?: projectSecrets[name]?.takeIf { it.isNotBlank() }

android {
    namespace = "dev.bitplugg.aliceapp"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.bitplugg.aliceapp"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        create("alice") {
            val ks = rootProject.file("keystore/alice.jks")
            val storePwd = secret("ALICE_KS_PASSWORD")
            if (ks.exists() && storePwd != null) {
                storeFile = ks
                storePassword = storePwd
                keyAlias = secret("ALICE_KS_ALIAS") ?: "alice"
                keyPassword = secret("ALICE_KS_KEY_PASSWORD") ?: storePwd
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            val sc = signingConfigs.getByName("alice")
            if (sc.storeFile?.exists() == true) signingConfig = sc
        }
    }

    buildFeatures {
        aidl = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += setOf(
            "/META-INF/{AL2.0,LGPL2.1}",
            "/META-INF/versions/9/OSGI-INF/MANIFEST.MF",
        )
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

/* ─── web/ (интерфейс панели) → app/src/main/assets/web ───
   assets генерируется при сборке и в git не идёт: источник истины — корневая папка web/.
   Sync сам удаляет то, чего больше нет в web/. */
tasks.register<Sync>("syncWebAssets") {
    group = "build"
    description = "Копирует web/ в app/src/main/assets/web"
    from(rootProject.file("web"))
    into(layout.projectDirectory.dir("src/main/assets/web"))
}
tasks.named("preBuild") { dependsOn("syncWebAssets") }

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("dev.rikka.shizuku:api:13.1.5")
    implementation("dev.rikka.shizuku:provider:13.1.5")
}
