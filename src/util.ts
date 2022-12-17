import fs from "fs";
import stringSimilarity from "string-similarity";
import {QuoteType, Replayable} from "./types";
import {PermissionsBitField} from "discord.js";
import {servers} from "./serverData";

export function normalizeStr(str:string):string{
    str = str.toLowerCase();
    str = str.replace("ę", "e");
    str = str.replace("ó", "o");
    str = str.replace("ą", "a");
    str = str.replace("ś", "s");
    str = str.replace("ł", "l");
    str = str.replace("ż", "z");
    str = str.replace("ź", "z");
    str = str.replace("ć", "c");
    str = str.replace("ń", "n");

    return str;
}

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getFilesizeInBytes(filename: fs.PathLike) {
    const stats = fs.statSync(filename);
    return stats.size;
}

export function checkSimilarity(a:string, b:string){
    return stringSimilarity.compareTwoStrings(a, b);
}

export function createUUID(){
    let random = getRandomInt(0,999999999999);
    return `u${random}`;
}

export function checkPerms(message: Replayable, perms: "admin" | "edit" | "root") {
    if (perms === "root") {
        return Number(message.member!.user.id) == 410416517860032523;
    }
    let canDo = false;
    if (message.guild!.members.cache.get(message.member!.user.id)?.permissions?.has([PermissionsBitField.Flags.ManageGuild])) return true;

    if (!servers[message.guild!.id].config.permissions) return false;
    message.guild!.members.cache.get(message.member!.user.id)?.roles.cache.forEach(role => {
        if (servers[message.guild!.id].config.permissions[role.id] === perms || servers[message.guild!.id].config.permissions[role.id] === "admin") {
            canDo = true;
            return;
        }
    })
    if (!canDo) {
        message.reply("Nie masz uprawnień");
    }
    return canDo;
}

export function getUser(cytat: QuoteType) {
    return cytat.msg.split('~')[cytat.msg.split('~').length - 1].trim();
}

export function parseUUID(uuid: string | number, message: Replayable) {
    let _i = uuid;
    servers[message.guild!.id].quotes.forEach((el, i) => {
        if (el.uuid == uuid) {
            _i = i;
        }
    })
    return parseInt(String(_i));
}
