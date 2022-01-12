import fs from "fs";
import * as Discord from "discord.js";
import {Intents, Message, MessageActionRow, MessageButtonStyleResolvable, Permissions} from "discord.js";
import {checkSimilarity, createUUID, getFilesizeInBytes, getRandomInt, normalizeStr} from "./util";
import {BtnAction, BtnActions, Cytat_t, miesiace, QuoteMaxLength, Replayable, Servers, User, Users} from "./header";

const client = new Discord.Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]});

let config: { token: string } = {token: ""}
let button_actions: BtnActions = {};

let servers: Servers = {};

try {
    config = JSON.parse(fs.readFileSync('./config.json', 'utf8'))
} catch {

}

function loadServerData(server_id: string, force: boolean = false, backup_index: number = -1) {
    try {
        if (!force) {
            if (servers[server_id]) {
                return servers[server_id];
            }
        }
        if (backup_index > 0) {
            servers[server_id] = JSON.parse(fs.readFileSync(getServerBackupFile(server_id, String(backup_index)), "utf-8"));
        } else {
            if(fs.existsSync(getServerFolder(server_id)+"cytaty.json")){
                servers[server_id] = {config: {permissions: {}, vote_cooldown: 86_400}, cytaty: [], voted_users: {}};
                servers[server_id].cytaty = JSON.parse(fs.readFileSync(getServerFolder(server_id)+"cytaty.json","utf-8"));
                saveServerData(server_id);
                fs.unlinkSync(getServerFolder(server_id)+"cytaty.json");
                return;
            }
            servers[server_id] = JSON.parse(fs.readFileSync(getServerCurrentFile(server_id), "utf-8"));
        }
        servers[server_id].cytaty.forEach(el => {
            if (!el.uuid) {
                el.uuid = createUUID();
            }
        })
        return servers[server_id];
    } catch {
        servers[server_id] = {config: {permissions: {}, vote_cooldown: 86_400}, cytaty: [], voted_users: {}};
    }
}

function saveServerData(server_id: string, _backup: boolean = false) {
    try {
        if (!fs.existsSync("./servers")) {
            fs.mkdirSync("./servers");
        }
        if (!fs.existsSync(getServerFolder(server_id))) {
            fs.mkdirSync(getServerFolder(server_id));
        }
        if (_backup) {
            if (!fs.existsSync(getServerBackupFolder(server_id))) {
                fs.mkdirSync(getServerBackupFolder(server_id));
            }
            fs.writeFileSync(getServerBackupFile(server_id, String(+new Date())), JSON.stringify(servers[server_id]), 'utf8');
            let fileList = fs.readdirSync(getServerBackupFolder(server_id));
            while (fileList.length > 11) {
                let min = -1;
                fileList.forEach(el => {
                    let ts = parseInt(el.split(".json")[0].split("b_")[1]);
                    if (ts < min || min < 0) min = ts;
                })

                fs.unlinkSync(getServerBackupFile(server_id, String(min)));
                fileList = fs.readdirSync(getServerBackupFolder(server_id));
            }
        } else {
            fs.writeFileSync(getServerCurrentFile(server_id), JSON.stringify(servers[server_id]), 'utf8');
        }
        return true;
    } catch {
        return false;
    }
}

async function main() {
    console.log("Starting...")
    await client.login(config.token)
    console.log("Ready!");
}

main();


client.on('messageCreate', async message => {
    if (message.content.startsWith('~')) {
        try {
            await handleCmd(message.content, message)
        } catch (er) {
            await message.reply(`ERROR: ${er}`)
        }
    }
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isButton()) {
            clearTimedOutActions();
            if (await buttonAction(interaction)) {
                let _id = interaction.customId.split(";");
                delete button_actions[Number(_id[0])];
            }
        }
    } catch (ex) {

    }

});

function clearTimedOutActions() {
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

async function buttonAction(message: Discord.ButtonInteraction): Promise<boolean> {
    let _id = message.customId.split(";");
    if (_id[0] == "cmd") {
        await handleCmd(_id[1], message);
        return true;
    }

    let btn_action = button_actions[Number(_id[0])];
    if (!btn_action) {
        if (Math.random() < 0.05) {
            message.reply(`Inwalida prince polo akcja!`);
        } else {
            message.reply(`Invalid button action!`);
        }

        return false;
    }

    if (btn_action.action) {
        if (btn_action.action == "rem-uuid") {
            if (!message.guild.members.cache.get(message.member.user.id).permissions.has([Permissions.FLAGS.MANAGE_GUILD]))
                if (btn_action.author != message.member.user.id) {
                    message.reply(`Only author or admin can do it!`);
                    return false;
                }
            saveServerData(message.guild.id, true)
            let uuid = (btn_action.data);
            let deleted_id = -1;
            let deleted_cytat;
            servers[message.guild.id].cytaty.forEach((el, i) => {
                if (el.uuid == uuid) {
                    deleted_id = i;
                    deleted_cytat = el;
                    servers[message.guild.id].cytaty.splice(i, 1);
                    return;
                }
            })
            saveServerData(message.guild.id);
            if (deleted_id >= 0) {
                await message.reply(`Usunieto ${deleted_id}: ${deleted_cytat.msg}`);
                return true;
            } else {
                message.reply(`Nie znaleziono!`)
                return false;
            }
        }
        if (btn_action.action == "pg") {
            showQuotes(message, btn_action.data.cytatyArr, btn_action.data.page, btn_action.data.txt);
            return true;
        }
        if (btn_action.action == "merge") {
            let _old = btn_action.data.old;
            let _new = btn_action.data.new;
            if (!checkPerms(message, "admin")) return;
            saveServerData(message.guild.id, true)
            servers[message.guild.id].cytaty.forEach((el: any, i: number) => {
                let osoba = getUser(el)
                if (osoba === _old) {
                    servers[message.guild.id].cytaty[i].msg = servers[message.guild.id].cytaty[i].msg.replace(_old, _new);
                }
            });
            saveServerData(message.guild.id);
            await message.reply(`Zamieniono "${_old}" na ${_new}`);
            return true;
        }
    }

    await handleCmd(btn_action.cmd, message);
    return true;
}

async function handleCmd(content: string, message: Replayable) {
    const args = content.replace('~', '').split(' ');
    loadServerData(message.guild.id);

    if (args[0] === "add" || args[0] === "add-no-similarity") {
        let no_similarity = false;
        if (args[0] === "add-no-similarity") no_similarity = true;

        let msg = args.slice(1).join(" ");
        let cytat = {
            msg: msg,
            original_msg: msg,
            info: undefined,
            votes: 0,
            uuid: createUUID(),
            history: {created: +new Date(), created_by: message.member.user.id, edits: []}
        };

        if (!verifyCytat(cytat, message, no_similarity)) return;

        servers[message.guild.id].cytaty.push(cytat);
        saveServerData(message.guild.id);

        const row = new Discord.MessageActionRow().addComponents(CreateActionButton({
            action: "rem-uuid",
            author: message.member.user.id,
            data: cytat.uuid,
        }, "Usuń (w celu poprawy błędu)", "DANGER"));

        await message.reply({
            content: `Dodano cytat ${servers[message.guild.id].cytaty.length - 1}: \n${cytat.msg}`,
            components: [row]
        });
    }
    if (args[0] === "q" || args[0] === "quote") {
        let index = parseUUID(args[1], message);
        let random;
        let cytat;

        if (!isNaN(index) && index >= 0 && index <= servers[message.guild.id].cytaty.length - 1) {
            random = index;
        } else {
            random = getRandomInt(0, servers[message.guild.id].cytaty.length - 1);
        }

        cytat = servers[message.guild.id].cytaty[random];
        if (!cytat) cytat = {username: "null", msg: "null"}
        const row = new Discord.MessageActionRow()
            .addComponents(CreateCmdButton("~q", "Następny losowy", "SUCCESS"))
            .addComponents(CreateCmdButton("~info " + cytat.uuid, "Info"))
            .addComponents(CreateCmdButton("~vote " + cytat.uuid, "Vote"))
            .addComponents(CreateCmdButton("~history " + cytat.uuid, "History"))

        await message.reply({
            content: `${random}: ${cytat.msg.replace("$PWrzesien;", miesiace[new Date().getMonth()])}`,
            components: [row]
        });
    }
    if (args[0] === "list") {
        let page: number = parseInt(args[1]);
        let user = args.slice(2).join(" ");
        if (!page) {
            page = 1;
            user = args.slice(1).join(" ");
        }


        let quoteArr: any = [];
        if (!user) {
            quoteArr = servers[message.guild.id].cytaty;
            showQuotes(message, quoteArr, page, "");
        } else {
            servers[message.guild.id].cytaty.forEach((el: Cytat_t) => {
                if (getUser(el) === user) {
                    quoteArr.push(el);
                }
            })
            showQuotes(message, quoteArr, page, `Cytaty użytkownika: ${user}`);
        }

    }
    if (args[0] === "search") {
        let page: number = parseInt(args[1]);
        let slowo = args.slice(2).join(" ");
        if (!page) {
            page = 1;
            slowo = args.slice(1).join(" ");
        }

        if (!slowo) {
            await message.reply("Podaj słowo szukane");
            return;
        }

        let quoteArr: any = [];
        servers[message.guild.id].cytaty.forEach((el: { msg: any; }) => {
            if (normalizeStr(el.msg)
                .replace("$PWrzesien;", miesiace[new Date().getMonth()]).includes(normalizeStr(slowo))) {
                quoteArr.push(el);
            }
        })
        showQuotes(message, quoteArr, page, `Cytaty zawierające: ${slowo}`);
    }
    if (args[0] === "top") {
        let msg = "```\n";

        let osoby: any = {};
        let osobySorted: any = [];

        if (args[1] === "votes") {
            servers[message.guild.id].cytaty.forEach((el: any, i: any) => {
                if (!el.votes) {
                    el.votes = 0;
                }
                osoby[el.msg] = el.votes;
            })
        } else {
            servers[message.guild.id].cytaty.forEach((el: any, i: any) => {
                let osoba = getUser(el)
                if (!osoby[osoba]) {
                    osoby[osoba] = 0;
                }
                osoby[osoba] += 1;
            })
        }


        for (let osoba in osoby) {
            osobySorted.push([osoba, osoby[osoba]]);
        }

        osobySorted.sort(function (a: number[], b: number[]) {
            return b[1] - a[1];
        });
        osobySorted.forEach((el: string[], i: any) => {
            if (msg.length < 1800) {
                if (i < 15) {
                    msg += `${i + 1}: ${el[0]} (${el[1]})\n`
                } else {
                    if (i == 15) msg += "\n";
                    let addmsg = `${i + 1}: ${el[0]} (${el[1]}), `
                    if ((msg + addmsg).length < 1900) {
                        msg += addmsg.replace("$PWrzesien;", miesiace[new Date().getMonth()]);
                    }
                }

            }
        })

        msg += "\n"
        msg += `Length: ${msg.length}\n`
        msg += "```";
        await message.reply(msg);
    }
    if (args[0] === "transfer") {
        if (!(message instanceof Message)) return;
        if (!checkPerms(message, "admin")) return;
        let prevName = message.content.split('"')[1];
        let newName = message.content.split('"')[3];
        saveServerData(message.guild.id, true)
        if (!prevName || !newName) {
            await message.reply('Format komendy: ~transfer "name" "newname"');
            return;
        }
        servers[message.guild.id].cytaty.forEach((el: any, i: number) => {
            let osoba = getUser(el)
            if (osoba === prevName) {
                servers[message.guild.id].cytaty[i].msg = servers[message.guild.id].cytaty[i].msg.replace(prevName, newName);
            }
        });
        saveServerData(message.guild.id);
        await message.reply(`Zamieniono "${prevName}" na ${newName}`);
        return;
    }
    if (args[0] === "rem" || args[0] === "remove") {
        if (!checkPerms(message, "admin")) return;
        let i = parseUUID(args[1], message);

        if (!checkIndex(message, i)) return;
        let msg = servers[message.guild.id].cytaty[i].msg;
        saveServerData(message.guild.id, true)
        servers[message.guild.id].cytaty.splice(i, 1);
        saveServerData(message.guild.id);
        await message.reply(`Usunieto ${i}: ${msg}`)


    }
    if (args[0] === "edit") {
        if (!checkPerms(message, "edit")) return;

        let i = parseUUID(args[1], message);
        if (!checkIndex(message, i)) return;

        let msg = args.slice(2).join(" ");
        let cytat = servers[message.guild.id].cytaty[i];
        cytat.msg = msg;

        if (!verifyCytat(cytat, message, false, true)) return;
        let msg2 = servers[message.guild.id].cytaty[i].msg;
        saveServerData(message.guild.id, true)
        servers[message.guild.id].cytaty[i] = cytat;

        if (!servers[message.guild.id].cytaty[i].history.edits) servers[message.guild.id].cytaty[i].history.edits = [];
        servers[message.guild.id].cytaty[i].history.edits.push({
            change: msg,
            by: message.member.user.id,
            date: +new Date(),
            type: "msg"
        });
        saveServerData(message.guild.id);

        await message.reply(`Edytowano ${i}: ${msg2} na ${cytat.msg}`);
    }
    if (args[0] === "help") {
        let msg = '```\n';
        msg += "~q[uote]                     - losowy cytat\n"
        msg += "~q[uote] <numer>             - konkretny cytat\n"
        msg += "~add <cytat> ~ <osoba>       - dodaj cytat\n"
        msg += "~list <strona>               - lista wszystkich cytatow\n"
        msg += "~list <strona> <osoba>       - lista wszystkich cytatow danej osoby\n"
        msg += "~info <numer>                - kontekst do cytatu\n"
        msg += "~info set <numer> <kontekst> - ustaw kontekst do cytatu\n"
        msg += "~info rem <numer>            - usun kontekst do cytatu\n"
        msg += "~top                         - lista osob z najwieksza iloscia cytatow\n"
        msg += "~top votes                   - lista cytatów z najwieksza iloscia głosów\n"
        msg += "~vote <numer>                - zagłosuj na cytat\n"
        msg += "~search <strona> <slowo>     - wyszukaj cytatow z danym slowem kluczowym\n"
        msg += "~edit <index>                - edytuj cytat\n"
        msg += "~rem[ove] <index>            - usun cytat\n"
        msg += "~config                      - konfiguracja serwerowa\n"
        msg += "~history <index>             - historia cytatu\n"
        msg += "~reload                      - przeładuj cytaty z pliku\n"
        msg += "~help                        - to info\n"
        msg += "```"

        await message.reply(msg);
    }
    if (args[0] === "reload") {
        if (!checkPerms(message, "admin")) return;

        try {
            loadServerData(message.guild.id, true);
            await message.reply("Reloaded");
        } catch {
            await message.reply("Error when reloading");
        }

    }
    if (args[0] === "info") {
        if (args[1] === "set") {
            let index = parseUUID(args[2], message);
            if (!checkIndex(message, index)) return;
            saveServerData(message.guild.id, true)
            servers[message.guild.id].cytaty[index].history.edits.push({
                change: args.slice(3).join(" "),
                by: message.member.user.id,
                date: +new Date(),
                type: "info"
            });
            servers[message.guild.id].cytaty[index].info = args.slice(3).join(" ");
            saveServerData(message.guild.id);
            await message.reply(`Ustawiono informacje o: ${servers[message.guild.id].cytaty[index].msg}\n${servers[message.guild.id].cytaty[index].info}`)
        } else if (args[1] === "rem") {
            if (!checkPerms(message, "admin")) return;

            let index = parseUUID(args[2], message);
            if (!checkIndex(message, index)) return;
            saveServerData(message.guild.id, true)
            servers[message.guild.id].cytaty[index].info = undefined;
            saveServerData(message.guild.id);
            await message.reply(`Ustawiono informacje o: ${servers[message.guild.id].cytaty[index].msg}\n${servers[message.guild.id].cytaty[index].info}`)
        } else if (args[1] === "lsnull") {
            let page: number = parseInt(args[2]);
            if (!page) {
                page = 1;
            }

            let quoteArr: any = [];
            servers[message.guild.id].cytaty.forEach((el: any) => {
                if (!el.info) {
                    quoteArr.push(el);
                }
            })
            showQuotes(message, quoteArr, page, `Cytaty bez dodanych informacji`);
        } else {
            let index = parseUUID(args[1], message);
            if (!checkIndex(message, index)) return;

            await message.reply(`Informacje o: ${servers[message.guild.id].cytaty[index].msg}\n${servers[message.guild.id].cytaty[index].info}`)
        }
    }
    if (args[0] === "history") {
        let index = parseUUID(args[1], message);
        if (!checkIndex(message, index)) return;

        let txt = "";

        if (!servers[message.guild.id].cytaty[index].history) {
            await message.reply(`Brak historii`)
            return;
        }
        txt += `CREATED BY: ${servers[message.guild.id].cytaty[index].history.created_by}\nWHEN: ${new Date(servers[message.guild.id].cytaty[index].history.created).toLocaleString("PL")}\n`;
        servers[message.guild.id].cytaty[index].history.edits.forEach(el => {
            txt += `TYPE: ${el.type} BY: <@${el.by}> CHANGE: ${el.change} WHEN: ${new Date(el.date).toLocaleString("PL")}\n`
        })

        await message.reply(`Historia cytatu: ${servers[message.guild.id].cytaty[index].msg}\n\`\`\`\n${txt}\n\`\`\``)
    }
    if (args[0] === "file") {
        let sizeBytes = getFilesizeInBytes(getServerCurrentFile(message.guild.id));
        await message.reply(`Informacje o pliku ${getServerCurrentFile(message.guild.id)}:\nRozmiar: ${sizeBytes}B\nIlość cytatów: ${servers[message.guild.id].cytaty.length}\nAby przeładować cytaty z pliku użyj ~reload`);
    }
    if (args[0] === "config") {
        if (!checkPerms(message, "admin")) return;
        if (args[1] === "perms") {
            if (args[2] === "set") {
                if (args[3] === "admin" || args[3] === "edit") {
                    let role = message.guild.roles.cache.get(args[4]);
                    if (!role) {
                        await message.reply("Unknown role: " + args[4]);
                        return;
                    }
                    servers[message.guild.id].config.permissions[role.id] = args[3];
                    await message.reply(`Added role: ${role.name} as ${args[3]}`);
                    saveServerData(message.guild.id);
                    return;
                } else {
                    await message.reply("Unknown permission: " + args[3]);
                    return;
                }

            } else if (args[2] === "list") {
                let msg = "```\n";
                Object.keys(servers[message.guild.id].config.permissions).forEach(key => {
                    let el = servers[message.guild.id].config.permissions[key];
                    let role = message.guild.roles.cache.get(key);
                    if (role) {
                        msg += `${role.name}: ${el}\n`;
                    }
                })
                msg += "\n```";
                await message.reply(msg);
                return;
            } else if (args[2] === "remove") {
                let role: Discord.Role = message.guild.roles.cache.get(args[3]);
                if (!servers[message.guild.id].config.permissions[args[3]]) {
                    await message.reply("Unknown or unset role: " + args[3]);
                    return;
                }
                delete servers[message.guild.id].config.permissions[role.id];
                await message.reply(`Deleted role: ${role.name}`);
                saveServerData(message.guild.id);
                return;
            }
        }
        else if (args[1] === "cooldown") {
            let cooldown = Number(args[2]);
            if(cooldown > 0){
                await message.reply(`changed vote cooldown from: ${servers[message.guild.id].config.vote_cooldown} to: ${cooldown}`);
                servers[message.guild.id].config.vote_cooldown = cooldown;
                saveServerData(message.guild.id);
                return;
            }else{
                await message.reply(`vote cooldown is: ${servers[message.guild.id].config.vote_cooldown}`);

            }

        } else {
            let msg = "Config command syntax: \n```\n";
            msg += `~config perms set|remove admin|edit {role}`
            msg += `~config perms list`
            msg += `~config cooldown`

            msg += "\n```"
            await message.reply(msg);
        }
    }
    if (args[0] === "vote") {
        let i = parseUUID(args[1], message);
        if (!checkIndex(message, i)) return;

        if (args[2] === "set") {
            if (!checkPerms(message, "admin")) return;
            let votes = parseInt(args[3])
            if (votes < 0 || isNaN(votes)) {
                message.reply("Liczba nie moze być <0");
                return;
            }

            servers[message.guild.id].cytaty[i].votes = votes;
            saveServerData(message.guild.id);
            message.reply(`Ustawiono ilość głosów: ${servers[message.guild.id].cytaty[i].msg}\nIlość głosów: ${servers[message.guild.id].cytaty[i].votes}`)
            return;
        }

        let ts: number = +new Date();

        if (servers[message.guild.id].voted_users[message.member.user.id.toString()] && servers[message.guild.id].voted_users[message.member.user.id.toString()].ts) {
            if (((servers[message.guild.id].voted_users[message.member.user.id.toString()].ts) + (servers[message.guild.id].config.vote_cooldown * 1000)) > ts) {
                let timeLeft = servers[message.guild.id].voted_users[message.member.user.id.toString()].ts + (servers[message.guild.id].config.vote_cooldown * 1000) - ts;
                let minutes = Math.floor(timeLeft / 1000 / 60);
                let hours = Math.floor(minutes / 60);
                message.reply(`You are still on cooldown: ${hours}h ${minutes % 60}m`)
                return;
            }
        }

        servers[message.guild.id].voted_users[message.member.user.id.toString()] = {ts: ts}

        if (!servers[message.guild.id].cytaty[i].votes) servers[message.guild.id].cytaty[i].votes = 0;
        servers[message.guild.id].cytaty[i].votes += 1;
        saveServerData(message.guild.id);
        message.reply(`Zagłosowano na: ${servers[message.guild.id].cytaty[i].msg}\nIlość głosów: ${servers[message.guild.id].cytaty[i].votes}`)
        return;
    }
    if (args[0] === "backup") {
        if (!checkPerms(message, "admin")) return;
        if (!fs.existsSync("./servers")) {
            fs.mkdirSync("./servers");
        }
        if (!fs.existsSync(getServerFolder(message.guild.id))) {
            fs.mkdirSync(getServerFolder(message.guild.id));
        }
        if (!fs.existsSync(getServerBackupFolder(message.guild.id))) {
            fs.mkdirSync(getServerBackupFolder(message.guild.id));
        }
        let fileList = fs.readdirSync(getServerBackupFolder(message.guild.id)).reverse();
        if (args[1] === "list") {
            let msg = "```\nBackups:\n";

            fileList.forEach((el, i) => {
                if (i <= 9) {
                    let ilosc = JSON.parse(fs.readFileSync(getServerBackupFile(message.guild.id,el), {encoding: "utf-8"})).cytaty.length;

                    msg += `${i}: ${el} - ${ilosc} cytatow\n`
                }

            })
            msg += "```"
            message.reply(msg);
        } else if (args[1] === "revert") {
            let i = parseUUID(args[2], message);
            if (isNaN(i) || i < 0) {
                message.reply(`Index nie może być < 0`)
                return;
            }
            if (i > fileList.length - 1) {
                message.reply(`Index nie może być > ilosci backupow`)
                return;
            }
            try {
                saveServerData(message.guild.id, true);
                loadServerData(message.guild.id, true, Number(fileList[i]))
                saveServerData(message.guild.id);
                message.reply(`Przywrocono ${fileList[i]}`)
            } catch (e) {
                console.log(e)
            }
        } else if (args[1] === "make") {
            saveServerData(message.guild.id, true);
            message.reply(`Stworzono backup`)
        } else {
            message.reply(`Available commands: make, revert, list`);
        }
    }
    if (args[0] === "verify") {
        let msg = "```\n";
        let handled = [];
        let buttons = [];
        if (!checkPerms(message, "admin")) return;
        servers[message.guild.id].cytaty.forEach(el => {
            let Corrected = verifyUser(getUser(el), message);
            if (Corrected.probability >= 0.6) {
                let actionsig = [getUser(el), Corrected.username];
                if (!handled.includes(JSON.stringify(actionsig))) {
                    handled.push(JSON.stringify(actionsig))
                    handled.push(JSON.stringify([Corrected.username, getUser(el)]))
                    let txt = `Username similarity issue ${Math.round(Corrected.probability * 100) / 100}: ${getUser(el)} <-> ${Corrected.username}\n`;
                    msg += txt;
                    if (buttons.length < 5) {
                        buttons.push({old: getUser(el), new: Corrected.username});
                    }
                }
            }
        })
        msg += "```\n"
        let rows = [];
        buttons.forEach(el => {
            const row = new Discord.MessageActionRow()
                .addComponents(CreateActionButton({
                    action: "merge",
                    data: {new: el.new, old: el.old}
                }, `Merge as: ${el.new}`))
                .addComponents(CreateActionButton({
                    action: "merge",
                    data: {new: el.old, old: el.new}
                }, `Merge as: ${el.old}`))
            rows.push(row);
        })

        if (rows.length > 0) {
            await message.reply({
                content: msg,
                components: rows
            });
        } else {
            await message.reply({
                content: msg,
                components: rows
            });
        }
    }
}

function verifyCytat(cytat: Cytat_t, message?: Replayable, no_similarity = false, edit = false) {
    if (cytat.msg.length >= QuoteMaxLength) {
        if (message != undefined)
            message.reply(`Cytat jest za długi (max ${QuoteMaxLength} znakow)`)
        return false;
    }
    if (!cytat.msg.includes(" ~ ") || getUser(cytat).length < 1) {
        if (message != undefined)
            message.reply("Format cytatu jest nieprawidłowy\nCytat ~ Osoba")
        return false;
    }
    if (cytat.msg.includes("\n")) {
        if (message != undefined)
            message.reply("Format cytatu jest nieprawidłowy\nNie może zawierać \\n")
        return false;
    }
    if (cytat.msg.split("~").length > 2) {
        if (message != undefined)
            message.reply("Format cytatu jest nieprawidłowy\nCytat ~ Osoba")
        return false;
    }

    if (checkExists(cytat, message) && !edit) {
        if (message != undefined)
            message.reply("Cytat już istnieje!");
        return false;
    }

    let verify_output = verifyUser(getUser(cytat), message);
    if (!no_similarity) {
        if (verify_output.probability > 0.9) {
            let fix_msg = cytat.msg.replace(` ~ ${getUser(cytat)}`, ` ~ ${verify_output.username}`);
            const row = new Discord.MessageActionRow().addComponents(CreateActionButton({cmd: `~add ${fix_msg}`}, "Change to: " + verify_output.username, "SUCCESS"));
            if (message != undefined)
                message.reply({
                    content: `Podana osoba istnieje pod podobna nazwa: ${verify_output.username}`,
                    components: [row]
                });
            return false;
        } else if (verify_output.probability >= 0.6) {
            let fix_msg = cytat.msg.replace(` ~ ${getUser(cytat)}`, ` ~ ${verify_output.username}`);
            const row = new Discord.MessageActionRow()
                .addComponents(CreateActionButton({cmd: `~add ${fix_msg}`}, "Change to: " + verify_output.username, "SUCCESS"))
                .addComponents(CreateActionButton({cmd: `~add-no-similarity ${cytat.msg}`}, "Add anyway"))

            if (message != undefined)
                message.reply({
                    content: `Podana osoba istnieje pod podobna nazwa: ${verify_output.username}`,
                    components: [row]
                });
            return false;
        }
    }
    return true;
}

function getUser(cytat: Cytat_t) {
    return cytat.msg.split('~')[cytat.msg.split('~').length - 1].trim();
}

function showQuotes(message: Replayable, cytatyArr: Cytat_t[], page: number, txt: string) {
    let msg = "";
    let lista: string[] = [];

    let count = 0;
    let currPage = 0;

    cytatyArr.forEach((el: any, i: any) => {
        if ((lista[currPage] + el.msg).length < 1800) {

        } else {
            currPage++;
        }
        if (!lista[currPage]) lista[currPage] = "";
        if (currPage == page - 1) count++;
        lista[currPage] += (`${el.info ? "+" : "-"} ${servers[message.guild.id].cytaty.indexOf(el)}: ${el.msg}\n`).replace("$PWrzesien;", miesiace[new Date().getMonth()])
    })

    let hasNextPage = lista.length > page;

    msg += lista[page - 1];

    msg = `\`\`\`diff\nPage ${page}/${lista.length} - ${count} z ${servers[message.guild.id].cytaty.length} cytatów. ${txt}\n` + msg

    msg += "\n"
    msg += `Length: ${msg.length}\n`
    msg += "```";

    let row: MessageActionRow;
    if (page > 1 || hasNextPage) {
        row = new Discord.MessageActionRow();
        if (page > 1) row.addComponents(CreateActionButton({
            action: "pg",
            data: {cytatyArr, page: page - 1, txt}
        }, "Poprzednia strona"));
        if (hasNextPage) row.addComponents(CreateActionButton({
            action: "pg",
            data: {cytatyArr, page: page + 1, txt}
        }, "Nastepna strona"));
        message.reply({
            content: msg,
            components: [row]
        });
    } else {
        message.reply({
            content: msg
        });
    }

}

function checkPerms(message: Replayable, perms: "admin" | "edit") {
    let canDo = false;
    if (message.guild.members.cache.get(message.member.user.id).permissions.has([Permissions.FLAGS.MANAGE_GUILD])) return true;

    if (!servers[message.guild.id].config.permissions) return false;
    message.guild.members.cache.get(message.member.user.id).roles.cache.forEach(role => {
        if (servers[message.guild.id].config.permissions[role.id] === perms || servers[message.guild.id].config.permissions[role.id] === "edit") {
            canDo = true;
            return;
        }
    })
    if (!canDo) {
        message.reply("Nie masz uprawnień");
    }
    return canDo;
}

function checkIndex(message: Replayable, i: number) {
    if (i < 0 || isNaN(i)) {
        message.reply("Index nie moze być <0");
        return false;
    }
    if (i > servers[message.guild.id].cytaty.length - 1) {
        message.reply("Index nie moze być > ilosci cytatow");
        return false;
    }
    return true;
}

function checkExists(cytat: Cytat_t, message: Replayable) {
    let exists = false
    servers[message.guild.id].cytaty.forEach(el => {
        if (el.msg == cytat.msg) {
            exists = true;
            return;
        }
    })
    return exists;
}

function TransformToUserArray(message: Replayable): Users {
    let users: Users = {};
    servers[message.guild.id].cytaty.forEach((cytat: Cytat_t) => {
        let user = getUser(cytat);
        if (!users[user] || !users[user].quotes) users[user] = {quotes: []};
        users[user].quotes.push(cytat);
    })
    return users;
}

function TransformToUserArrayNormalized(message: Replayable): Users {
    let users: Users = {};
    servers[message.guild.id].cytaty.forEach((cytat: Cytat_t) => {
        let _user = getUser(cytat);
        let user = normalizeStr(_user);
        if (!users[user] || !users[user].quotes) users[user] = {quotes: []};
        users[user].realname = _user;
        users[user].quotes.push(cytat);
    })
    return users;
}

function verifyUser(_user: string, message: Replayable): { probability: number, username: string } {
    let UserArr = TransformToUserArrayNormalized(message);
    let normalized = normalizeStr(_user);
    let output = {probability: 0, username: ""};
    Object.keys(UserArr).forEach(key => {
        let user: User = UserArr[key];
        if (normalized == key) {
            if (_user != user.realname) {
                output.username = user.realname;
                output.probability = 1;
                return;
            }
        }
    })
    if (output.probability == 0) {
        Object.keys(UserArr).forEach(key => {
            let user: User = UserArr[key];
            if (_user != user.realname) {
                let probability = checkSimilarity(normalized, key);
                if (probability > output.probability) {
                    output.username = user.realname;
                    output.probability = probability;
                }
            }
        })
    }
    return output;
}

function CreateActionButton(obj: BtnAction, label: string, btn_type: MessageButtonStyleResolvable = "PRIMARY") {
    let token = getRandomInt(0, 9999999);
    button_actions[token] = obj;
    obj.createdAt = +new Date();

    return new Discord.MessageButton()
        .setCustomId(`${token}`)
        .setLabel(label)
        .setStyle(btn_type);
}

function CreateCmdButton(cmd: string, label: string, btn_type: MessageButtonStyleResolvable = "PRIMARY") {
    return new Discord.MessageButton()
        .setCustomId(`cmd;${cmd}`)
        .setLabel(label)
        .setStyle(btn_type);
}

function parseUUID(uuid, message: Replayable) {
    let _i = uuid;
    servers[message.guild.id].cytaty.forEach((el, i) => {
        if (el.uuid == uuid) {
            _i = i;
        }
    })
    return parseInt(_i);
}

function getServerFolder(server_id: string) {
    return `./servers/${server_id}/`;
}

function getServerCurrentFile(server_id: string) {
    return getServerFolder(server_id) + "_current.json";
}

function getServerBackupFolder(server_id: string) {
    return getServerFolder(server_id) + "backup/";
}

function getServerBackupFile(server_id: string, backup_id: string) {
    if(backup_id.includes(".json")){
        backup_id = getBackupId(backup_id);
    }
    return getServerBackupFolder(server_id) + `b_${backup_id}.json`;
}

function getBackupId(filename:string){
    return filename.split(".json")[0].split("b_")[1]
}