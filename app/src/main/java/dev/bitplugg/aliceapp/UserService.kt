package dev.bitplugg.aliceapp

/**
 * Пользовательский сервис Shizuku: выполняет команды от имени uid shell.
 * Запускается процессом Shizuku, поэтому класс должен быть public с конструктором без аргументов.
 */
class UserService : IUserService.Stub() {

    override fun exec(cmd: String): String = try {
        val process = ProcessBuilder("/system/bin/sh", "-c", cmd)
            .redirectErrorStream(true)
            .start()
        val out = process.inputStream.bufferedReader().use { it.readText() }
        process.waitFor()
        out
    } catch (t: Throwable) {
        "[err] $t"
    }
}
