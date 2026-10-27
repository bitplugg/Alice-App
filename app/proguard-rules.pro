# Alice-App v2 · R8
# JSON-модели сериализуются рефлексией
-keepclassmembers class dev.bitplugg.aliceapp2.** {
  *** Companion;
}
-keepclasseswithmembers class dev.bitplugg.aliceapp2.** {
  kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class dev.bitplugg.aliceapp2.**$$serializer { *; }
-keepclassmembers class dev.bitplugg.aliceapp2.** {
  *** Companion;
}
# Shizuku UserService (binder транзакции по имени метода)
-keep class dev.bitplugg.aliceapp2.shizuku.** { *; }
# Glance
-keep class androidx.glance.** { *; }
# сохраняем контекст WebView не нужен (натив)
