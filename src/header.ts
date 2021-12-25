import * as Discord from "discord.js";
import {ButtonInteraction} from "discord.js";

export const QuoteMaxLength = 250;
export const miesiace = ["Pani Styczeń", "Pani Luteń", "Pani Marzeń", "Pani Kwiecień", "Pani Majeń", "Pani Czerwień", "Pani Lipień", "Pani Sierpień", "Pani Wrzesień", "Pani Pazdziernień", "Pani Listopień", "Pani Grudzień"]

export type Cytat_t = {
    votes: number;
    info: string;
    msg: string;
    uuid:string;
}

export type User = {
    realname?: string;
    quotes: Cytat_t[]
}

export type BtnAction = {
    cmd?: string;
    action?:string;
    author?:string;
    data?:any;
    createdAt?:number;
}

export interface Users {[key:string]:User}

export interface BtnActions {[key:number]:BtnAction}

export type Replayable = Discord.Message|ButtonInteraction;