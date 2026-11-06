import fs from "fs";
import path from "path";
import ws from "ws";
import {createClient} from "@supabase/supabase-js";
import {createUUID} from "./util";
import {Server, Servers} from "./types";

type AppConfig = {
    token: string;
    clientId: string;
    supabaseUrl: string;
    supabaseKey: string;
};

const config = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "config.json"), "utf8")
) as AppConfig;

const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    db: {schema: "public_cytatownik"},
    auth: {persistSession: false, autoRefreshToken: false},
    // Native WebSocket exists only on Node 22+; polyfill so systemd/Node 18 also works.
    realtime: {transport: ws as unknown as typeof WebSocket},
});

export let servers: Servers = {};

function emptyServer(): Server {
    return {config: {permissions: {}, vote_cooldown: 86_400}, quotes: [], voted_users: {}};
}

function hydrateServer(server_id: string, server: Server) {
    if (!server?.config) {
        servers[server_id] = emptyServer();
        return;
    }

    servers[server_id] = server;
    servers[server_id].quotes.forEach((el, i) => {
        if (!el.uuid) {
            el.uuid = createUUID();
        }
        if (!el.history) {
            el.history = {created: i, created_by: "unknown", edits: []};
        }
    });

    servers[server_id].quotes = servers[server_id].quotes.sort((q1, q2) => {
        if (q1.history.created < q2.history.created) return -1;
        if (q1.history.created > q2.history.created) return 1;
        return 0;
    });
}

export async function loadServerData(server_id: string, force: boolean = false, backup_index: number = -1) {
    try {
        if (backup_index > 0) {
            const {data, error} = await supabase
                .from("backups")
                .select("data, ts")
                .eq("server_id", server_id)
                .eq("ts", backup_index)
                .maybeSingle();
            if (error) throw error;
            if (!data?.data) {
                servers[server_id] = emptyServer();
                return servers[server_id];
            }
            hydrateServer(server_id, data.data as Server);
            if (!servers[server_id].saveTimestamp) {
                servers[server_id].saveTimestamp = Number(data.ts);
            }
            return servers[server_id];
        }

        if (!force && servers[server_id]) {
            return servers[server_id];
        }

        const {data, error} = await supabase
            .from("servers")
            .select("data")
            .eq("server_id", server_id)
            .maybeSingle();
        if (error) throw error;

        if (!data?.data) {
            servers[server_id] = emptyServer();
            await saveServerData(server_id);
            return servers[server_id];
        }

        hydrateServer(server_id, data.data as Server);
        if (!servers[server_id]?.config) {
            servers[server_id] = emptyServer();
            await saveServerData(server_id);
        }
    } catch {
        servers[server_id] = emptyServer();
    }

    return servers[server_id];
}

export async function saveServerData(server_id: string, _backup: boolean = false) {
    const serverData = servers[server_id];
    serverData.saveTimestamp = +new Date();

    if (_backup) {
        const {error} = await supabase.from("backups").upsert({
            server_id,
            ts: serverData.saveTimestamp,
            data: serverData,
        }, {onConflict: "server_id,ts"});
        if (error) throw error;
        return serverData.saveTimestamp;
    }

    const {error} = await supabase.from("servers").upsert({
        server_id,
        data: serverData,
        save_timestamp: serverData.saveTimestamp,
        updated_at: new Date().toISOString(),
    }, {onConflict: "server_id"});
    if (error) throw error;
}

export async function listBackups(server_id: string, count: number) {
    const {data, error} = await supabase
        .from("backups")
        .select("data, ts")
        .eq("server_id", server_id)
        .order("ts", {ascending: false})
        .limit(count);
    if (error) throw error;

    return (data ?? []).map((backup) => {
        const parsed = backup.data as Server;
        if (!parsed.saveTimestamp) parsed.saveTimestamp = Number(backup.ts);
        return parsed;
    });
}
