import * as Discord from "discord.js";
import {ButtonInteraction} from "discord.js";

export const QuoteMaxLength = 250;
export const miesiace = ["Pani Styczeń", "Pani Luteń", "Pani Marzeń", "Pani Kwiecień", "Pani Majeń", "Pani Czerwień", "Pani Lipień", "Pani Sierpień", "Pani Wrzesień", "Pani Pazdziernień", "Pani Listopień", "Pani Grudzień"]

export type Cytat_t = {
    votes: number;
    info: string;
    msg: string;
    original_msg: string;
    uuid:string;
    history:{
        created:number;
        created_by:string;
        edits:{by:string,date:number,change:string,type:string}[]
    }
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

export type Server = {
    cytaty: Cytat_t[];
    config:{
        permissions: {[key:string]:"edit"|"admin"};
        vote_cooldown: number;
    }

    voted_users: {[key:string]:{ts:number}};
}

export interface Users {[key:string]:User}

export interface BtnActions {[key:number]:BtnAction}

export interface Servers {[key:string]:Server}

export type Replayable = Discord.Message|ButtonInteraction;