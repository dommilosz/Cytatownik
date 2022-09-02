import {BtnAction, BtnActions} from "./types";
import {ButtonBuilder, ButtonStyle} from "discord.js";
import {getRandomInt} from "./util";

export let button_actions: BtnActions = {};

export function CreateActionButton(obj: BtnAction, label: string, btn_type: ButtonStyle = ButtonStyle.Primary) {
    let token = getRandomInt(0, 9999999);
    button_actions[token] = obj;
    obj.createdAt = +new Date();

    return new ButtonBuilder()
        .setCustomId(`${token}`)
        .setLabel(label)
        .setStyle(btn_type);
}

export function CreateCmdButton(cmd: string, label: string, btn_type: ButtonStyle = ButtonStyle.Primary) {
    return new ButtonBuilder()
        .setCustomId(`cmd;${cmd}`)
        .setLabel(label)
        .setStyle(btn_type);
}

export function clearTimedOutActions() {
    let ts = +new Date();
    Object.keys(button_actions).forEach(key => {
        let action: BtnAction = button_actions[key];
        if (!action.createdAt) {
            delete button_actions[key];
        } else {
            if ((ts - (180 * 1000)) > action.createdAt) {
                delete button_actions[key];
            }
        }

    })
}