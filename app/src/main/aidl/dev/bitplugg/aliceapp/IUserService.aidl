package dev.bitplugg.aliceapp;

/** Локальная консоль телефона через Shizuku (uid shell). */
interface IUserService {
    String exec(String cmd);
}
