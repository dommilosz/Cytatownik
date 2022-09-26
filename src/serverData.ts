import {createUUID} from "./util";
import {Servers} from "./types";
import {getFirestore} from "firebase-admin/firestore";
import {initializeApp} from "firebase-admin/app";
import admin from "firebase-admin";

let serviceAccount = require("../firebase_secret.json");
let defaultApp = initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const firebase = getFirestore(defaultApp);
firebase.settings({
    ignoreUndefinedProperties: true,
});
export let servers: Servers = {};


export async function loadServerData(server_id: string, force: boolean = false, backup_index: number = -1) {
    try {
        if (backup_index > 0) {
            let server = (await firebase.collection("backups").doc(server_id).collection("backups").doc(`${backup_index}`).get()).data();
            if (!server || !server.config) {
                servers[server_id] = {config: {permissions: {}, vote_cooldown: 86_400}, quotes: [], voted_users: {}};
                await saveServerData(server_id);
                return;
            }
            // @ts-ignore
            servers[server_id] = server;
        } else {
            if (!force) {
                if (servers[server_id]) {
                    return servers[server_id];
                }
            }
            let server = (await firebase.collection("servers").doc(server_id).get()).data();
            if (!server || !server.config) {
                servers[server_id] = {config: {permissions: {}, vote_cooldown: 86_400}, quotes: [], voted_users: {}};
                await saveServerData(server_id);
                return;
            }
            // @ts-ignore
            servers[server_id] = server;
        }

        servers[server_id].quotes.forEach(el => {
            if (!el.uuid) {
                el.uuid = createUUID();
            }
        })

        return servers[server_id];
    } catch {
        servers[server_id] = {config: {permissions: {}, vote_cooldown: 86_400}, quotes: [], voted_users: {}};
    }
}

export async function saveServerData(server_id: string, _backup: boolean = false) {
    if (_backup) {
        await firebase.collection("backups").doc(server_id).collection("backups").doc(`${+new Date()}`).set(servers[server_id])
    } else {
        await firebase.collection("servers").doc(server_id).set(servers[server_id])
    }
}