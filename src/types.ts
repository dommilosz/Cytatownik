import * as Discord from "discord.js";
import {ButtonInteraction} from "discord.js";

export const QuoteMaxLength = 250;

export type QuoteType = {
    votes: number;
    info: string|undefined;
    msg: string;
    original_msg: string;
    uuid: string;
    history: {
        created: number;
        created_by: string;
        edits: { by: string, date: number, change: string, type: string }[]
    }
}

export type User = {
    realname?: string;
    quotes: QuoteType[]
}

export type BtnAction = {
    cmd?: string;
    action?: string;
    author?: string;
    data?: any;
    createdAt?: number;
}

export type Server = {
    quotes: QuoteType[];
    config: {
        permissions: { [key: string]: "edit" | "admin" };
        vote_cooldown: number;
    }

    voted_users: { [key: string]: { ts: number } };
    saveTimestamp?:number
}

export interface Users {
    [key: string]: User
}

export interface BtnActions {
    [key: string]: BtnAction
}

export interface Servers {
    [key: string]: Server
}

export type Replayable = Discord.Message | ButtonInteraction;