package dev.bitplugg.aliceapp

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.ServiceConnection
import android.os.Bundle
import android.os.IBinder
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import rikka.shizuku.Shizuku

/**
 * Alice-App — WebView-оболочка над веб-панелью колонки.
 *  • панель лежит в assets/web и отдаётся из file://
 *  • API колонки открывается по http://<ip>:8080 (CORS: *, см. speaker/api.sh)
 *  • Shizuku даёт запасной канал: локальная консоль телефона (uid shell)
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    @Volatile private var service: IUserService? = null

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            service = IUserService.Stub.asInterface(binder)
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            service = null
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_NO_CACHE
            setSupportZoom(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = true
        }
        web.webViewClient = WebViewClient()
        web.addJavascriptInterface(Bridge(), "Android")
        // deep-link: am start ... --es url "http://<ip>:8080/?t=<token>&page=p-led"
        val url = intent.getStringExtra("url")
        web.loadUrl(if (url.isNullOrBlank()) DEFAULT_URL else url)

        initShizuku()
    }

    private fun initShizuku() {
        try {
            if (!Shizuku.pingBinder()) return
            if (Shizuku.checkSelfPermission() != 0) {
                Shizuku.requestPermission(REQ_PERMISSION)
            } else {
                bindUserService()
            }
            Shizuku.addRequestPermissionResultListener { _, grantResult ->
                if (grantResult == 0) bindUserService()
            }
        } catch (t: Throwable) {
            // Shizuku не установлен / не запущен — панель работает и без него
        }
    }

    private fun bindUserService() {
        try {
            val args = Shizuku.UserServiceArgs(ComponentName(this, UserService::class.java))
                .daemon(false)
                .processNameSuffix("alice")
                .debuggable(false)
                .version(1)
            Shizuku.bindUserService(args, connection)
        } catch (t: Throwable) {
            service = null
        }
    }

    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    /** Мост для веб-панели: window.Android.* */
    inner class Bridge {
        @JavascriptInterface
        fun shizukuReady(): Boolean =
            service != null && try {
                Shizuku.pingBinder() && Shizuku.checkSelfPermission() == 0
            } catch (t: Throwable) {
                false
            }

        @JavascriptInterface
        fun exec(cmd: String): String {
            val s = service ?: return "[shizuku] не подключён (откройте приложение ещё раз)"
            return try {
                s.exec(cmd) ?: ""
            } catch (t: Throwable) {
                "[err] $t"
            }
        }
    }

    companion object {
        private const val REQ_PERMISSION = 1001
        private const val DEFAULT_URL = "file:///android_asset/web/index.html"
    }
}
