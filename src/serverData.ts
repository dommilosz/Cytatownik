import {createUUID} from "./util";
import {Server, Servers} from "./types";
import {getFirestore} from "firebase-admin/firestore";
import {initializeApp} from "firebase-admin/app";
import admin from "firebase-admin";
import * as zlib from "zlib";

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
        let serverData;
        if (backup_index > 0) {
            serverData = (await firebase.collection("backups").doc(server_id).collection("backups").doc(`${backup_index}`).get()).data();
        } else {
            if (!force) {
                if (servers[server_id]) {
                    return servers[server_id];
                }
            }
            serverData = (await firebase.collection("servers").doc(server_id).get()).data();
        }

        serverData = Buffer.from(serverData?.data, "base64");
        serverData = zlib.gunzipSync(serverData).toString();
        let server = JSON.parse(serverData);

        if (!server || !server.config) {
            servers[server_id] = {config: {permissions: {}, vote_cooldown: 86_400}, quotes: [], voted_users: {}};
            await saveServerData(server_id);
            return;
        }
        // @ts-ignore
        servers[server_id] = server;

        servers[server_id].quotes.forEach((el, i) => {
            if (!el.uuid) {
                el.uuid = createUUID();
            }
            if (!el.history) {
                el.history = {created: i, created_by: "unknown", edits: []}
            }
        })
    } catch {
        servers[server_id] = {config: {permissions: {}, vote_cooldown: 86_400}, quotes: [], voted_users: {}};
    }
    servers[server_id].quotes = servers[server_id].quotes.sort((q1, q2) => {
        if (q1.history.created < q2.history.created) {
            return -1;
        }
        if (q1.history.created > q2.history.created) {
            return 1;
        }
        return 0;
    })
    return servers[server_id];
}

export async function saveServerData(server_id: string, _backup: boolean = false) {
    let serverData = servers[server_id];
    serverData.saveTimestamp = +new Date();
    let buf = zlib.gzipSync(Buffer.from(JSON.stringify(serverData)));
    let base64 = buf.toString("base64");

    if (_backup) {
        await firebase.collection("backups").doc(server_id).collection("backups").doc(`${serverData.saveTimestamp}`).set({
            data: base64,
            ts: serverData.saveTimestamp
        })
        return serverData.saveTimestamp;
    } else {
        await firebase.collection("servers").doc(server_id).set({data: base64})
    }
}

export async function listBackups(server_id: string, count: number) {
    let backupSnapshot = await firebase.collection("backups").doc(server_id).collection("backups").orderBy("ts", "desc").limit(count).get();
    return backupSnapshot.docs.map(backup => {
        let gzipData: string = backup.data().data;
        let data: Server = JSON.parse(zlib.gunzipSync(Buffer.from(gzipData, "base64")).toString());
        if (!data.saveTimestamp) data.saveTimestamp = Number(backup.id);
        return data;
    });
}