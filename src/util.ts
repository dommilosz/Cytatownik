import fs from "fs";
import stringSimilarity from "string-similarity";

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

export function checkSimilarity(a, b){
    let similarity = stringSimilarity.compareTwoStrings(a,b);
    return similarity;
}

export function createUUID(){
    let random = getRandomInt(0,999999999999);
    return `u${random}`;
}