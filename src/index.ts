import fs from "fs";
import * as Discord from "discord.js";
import {
    ButtonInteraction,
    Intents,
    Message,
    MessageActionRow,
    MessageButtonStyleResolvable,
    Permissions
} from "discord.js";
import {checkSimilarity, createUUID, getFilesizeInBytes, getRandomInt, normalizeStr} from "./util";
import {BtnAction, BtnActions, Cytat_t, miesiace, QuoteMaxLength, Replayable, User, Users} from "./header";

const client = new Discord.Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]});

let config: any = {token: "", voteCooldown: 86400}
let cytaty: Cytat_t[] = []
let button_actions: BtnActions = {};

let votedUsers: any = {};

if (!fs.existsSync("./backup")) {
    fs.mkdirSync("./backup");
}

try {
    config = JSON.parse(fs.readFileSync('./config.json', 'utf8'))
    cytaty = JSON.parse(fs.readFileSync('./cytaty.json', 'utf8'))
    votedUsers = JSON.parse(fs.readFileSync('./votedUsers.json', 'utf8'))
} catch {

}

async function main() {
    cytaty.forEach(el => {
        if (!el.uuid) {
            el.uuid = createUUID();
        }
    })

    console.log("Starting...")
    await client.login(config.token)
    console.log("Ready!");
}

main();


client.on('messageCreate', async message => {
    if (message.content.startsWith('~')) {
        try {
            await handleCmd(message.content, message)
        } catch {
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
    } catch(ex) {

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

async function buttonAction(interaction): Promise<boolean> {
    let _id = interaction.customId.split(";");
    if (_id[0] == "cmd") {
        await handleCmd(_id[1], interaction);
        return true;
    }

    let btn_action = button_actions[Number(_id[0])];
    if (!btn_action) {
        interaction.reply(`Invalid button action!`);
        return false;
    }

    if (btn_action.action) {
        if (btn_action.action == "rem-uuid") {
            if (!interaction.guild.members.cache.get(interaction.member.user.id).permissions.has([Permissions.FLAGS.MANAGE_GUILD]))
                if (btn_action.author != interaction.member.user.id) {
                    interaction.reply(`Only author or admin can do it!`);
                    return false;
                }
            backup()
            let uuid = (btn_action.data);
            let deleted_id = -1;
            let deleted_cytat;
            cytaty.forEach((el, i) => {
                if (el.uuid == uuid) {
                    deleted_id = i;
                    deleted_cytat = el;
                    cytaty.splice(i, 1);
                    return;
                }
            })
            saveQuotes();
            if (deleted_id >= 0) {
                await interaction.reply(`Usunieto ${deleted_id}: ${deleted_cytat.msg}`);
                return true;
            } else {
                interaction.reply(`Nie znaleziono!`)
                return false;
            }
        }
        if (btn_action.action == "pg") {
            showQuotes(interaction, btn_action.data.cytatyArr, btn_action.data.page, btn_action.data.txt);
            return true;
        }
        if (btn_action.action == "merge") {
            let _old = btn_action.data.old;
            let _new = btn_action.data.new;
            if (!checkPerms(interaction, [Permissions.FLAGS.MANAGE_GUILD])) return;
            backup()
            cytaty.forEach((el: any, i: number) => {
                let osoba = getUser(el)
                if (osoba === _old) {
                    cytaty[i].msg = cytaty[i].msg.replace(_old, _new);
                }
            });
            saveQuotes()
            await interaction.reply(`Zamieniono "${_old}" na ${_new}`);
            return true;
        }
    }

    await handleCmd(btn_action.cmd, interaction);
    return true;
}

async function handleCmd(content: string, message: Replayable) {
    const args = content.replace('~', '').split(' ');

    if (args[0] === "add" || args[0] === "add-no-similarity") {
        let no_similarity = false;
        if (args[0] === "add-no-similarity") no_similarity = true;

        let msg = args.slice(1).join(" ");
        let cytat = {msg: msg, info: undefined, votes: 0, uuid: createUUID()};

        if (!verifyCytat(cytat, message, no_similarity)) return;

        cytaty.push(cytat);
        saveQuotes();

        const row = new Discord.MessageActionRow().addComponents(CreateActionButton({
            action: "rem-uuid",
            author: message.member.user.id,
            data: cytat.uuid,
        }, "Usuń (w celu poprawy błędu)", "DANGER"));

        await message.reply({
            content: `Dodano cytat ${cytaty.length - 1}: \n${cytat.msg}`,
            components: [row]
        });
    }
    if (args[0] === "q" || args[0] === "quote") {
        let index = parseUUID(args[1]);
        let random;
        let cytat;

        if (!isNaN(index) && index >= 0 && index <= cytaty.length - 1) {
            random = index;
        } else {
            random = getRandomInt(0, cytaty.length - 1);
        }

        cytat = cytaty[random];
        if (!cytat) cytat = {username: "null", msg: "null"}
        const row = new Discord.MessageActionRow()
            .addComponents(CreateCmdButton("~q", "Następny losowy", "SUCCESS"))
            .addComponents(CreateCmdButton("~info " + cytat.uuid, "Info"))
            .addComponents(CreateCmdButton("~vote " + cytat.uuid, "Vote"))

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
            quoteArr = cytaty;
            showQuotes(message, quoteArr, page, "");
        } else {
            cytaty.forEach((el: Cytat_t) => {
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
        cytaty.forEach((el: { msg: any; }) => {
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
            cytaty.forEach((el: any, i: any) => {
                if (!el.votes) {
                    el.votes = 0;
                }
                osoby[el.msg] = el.votes;
            })
        } else {
            cytaty.forEach((el: any, i: any) => {
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
        if (!checkPerms(message, [Permissions.FLAGS.MANAGE_GUILD])) return;
        let prevName = message.content.split('"')[1];
        let newName = message.content.split('"')[3];
        backup()
        if (!prevName || !newName) {
            await message.reply('Format komendy: ~transfer "name" "newname"');
            return;
        }
        cytaty.forEach((el: any, i: number) => {
            let osoba = getUser(el)
            if (osoba === prevName) {
                cytaty[i].msg = cytaty[i].msg.replace(prevName, newName);
            }
        });
        saveQuotes()
        await message.reply(`Zamieniono "${prevName}" na ${newName}`);
        return;
    }
    if (args[0] === "rem" || args[0] === "remove") {
        if (!checkPerms(message, [Permissions.FLAGS.MANAGE_GUILD])) return;
        let i = parseUUID(args[1]);

        if (!checkIndex(message, i)) return;
        let msg = cytaty[i].msg;
        backup()
        cytaty.splice(i, 1);
        saveQuotes()
        await message.reply(`Usunieto ${i}: ${msg}`)


    }
    if (args[0] === "edit") {
        if (!checkPerms(message, [Permissions.FLAGS.MANAGE_GUILD])) return;

        let i = parseUUID(args[1]);
        if (!checkIndex(message, i)) return;

        let msg = args.slice(2).join(" ");
        let cytat = cytaty[i];
        cytat.msg = msg;

        if (!verifyCytat(cytat, message)) return;
        let msg2 = cytaty[i].msg;
        backup()
        cytaty[i] = cytat;
        saveQuotes();
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
        msg += "~reload                      - przeładuj cytaty z pliku\n"
        msg += "~help                        - to info\n"
        msg += "```"

        await message.reply(msg);
    }
    if (args[0] === "reload") {
        if (!checkPerms(message, [Permissions.FLAGS.MANAGE_GUILD])) return;

        try {
            cytaty = JSON.parse(fs.readFileSync('./cytaty.json', 'utf8'))
            votedUsers = JSON.parse(fs.readFileSync('./votedUsers.json', 'utf8'))
            await message.reply("Reloaded");
        } catch {
            await message.reply("Error when reloading");
        }

    }
    if (args[0] === "info") {
        if (args[1] === "set") {
            let index = parseUUID(args[2]);
            if (!checkIndex(message, index)) return;
            backup()
            cytaty[index].info = args.slice(3).join(" ");
            saveQuotes()
            await message.reply(`Ustawiono informacje o: ${cytaty[index].msg}\n${cytaty[index].info}`)
        } else if (args[1] === "rem") {
            if (!checkPerms(message, [Permissions.FLAGS.MANAGE_GUILD])) return;

            let index = parseUUID(args[2]);
            if (!checkIndex(message, index)) return;
            backup()
            cytaty[index].info = undefined;
            saveQuotes()
            await message.reply(`Ustawiono informacje o: ${cytaty[index].msg}\n${cytaty[index].info}`)
        } else if (args[1] === "lsnull") {
            let page: number = parseInt(args[2]);
            if (!page) {
                page = 1;
            }

            let quoteArr: any = [];
            cytaty.forEach((el: any) => {
                if (!el.info) {
                    quoteArr.push(el);
                }
            })
            showQuotes(message, quoteArr, page, `Cytaty bez dodanych informacji`);
        } else {
            let index = parseUUID(args[1]);
            if (!checkIndex(message, index)) return;

            await message.reply(`Informacje o: ${cytaty[index].msg}\n${cytaty[index].info}`)
        }
    }
    if (args[0] === "file") {
        let sizeBytes = getFilesizeInBytes('./cytaty.json');
        await message.reply(`Informacje o pliku ./cytaty.json:\nRozmiar: ${sizeBytes}B\nIlość cytatów: ${cytaty.length}\nAby przeładować cytaty z pliku użyj ~reload`);
    }
    if (args[0] === "vote") {
        let i = parseUUID(args[1]);
        if (!checkIndex(message, i)) return;

        if (args[2] === "set") {
            if (!checkPerms(message, [Permissions.FLAGS.MANAGE_GUILD])) return;
            let votes = parseInt(args[3])
            if (votes < 0 || isNaN(votes)) {
                message.reply("Liczba nie moze być <0");
                return;
            }

            cytaty[i].votes = votes;
            saveQuotes();
            message.reply(`Ustawiono ilość głosów: ${cytaty[i].msg}\nIlość głosów: ${cytaty[i].votes}`)
            return;
        }

        let ts: number = +new Date();

        if (votedUsers[message.member.user.id.toString()] && votedUsers[message.member.user.id.toString()].ts) {
            if (((votedUsers[message.member.user.id.toString()].ts) + (config.voteCooldown * 1000)) > ts) {
                let timeLeft = votedUsers[message.member.user.id.toString()].ts + (config.voteCooldown * 1000) - ts;
                let minutes = Math.floor(timeLeft / 1000 / 60);
                let hours = Math.floor(minutes / 60);
                message.reply(`You are still on cooldown: ${hours}h ${minutes % 60}m`)
                return;
            }
        }

        votedUsers[message.member.user.id.toString()] = {ts: ts}

        if (!cytaty[i].votes) cytaty[i].votes = 0;
        cytaty[i].votes += 1;
        saveQuotes();
        message.reply(`Zagłosowano na: ${cytaty[i].msg}\nIlość głosów: ${cytaty[i].votes}`)
        return;
    }
    if (args[0] === "backup") {
        if (!checkPerms(message, [Permissions.FLAGS.MANAGE_GUILD])) return;
        let fileList = fs.readdirSync("./backup").reverse();
        if (args[1] === "list") {
            let msg = "```\nBackups:\n";

            fileList.forEach((el, i) => {
                if (i <= 9) {
                    let ilosc = JSON.parse(fs.readFileSync("./backup/" + el, {encoding: "utf-8"})).length;

                    msg += `${i}: ${el} - ${ilosc} cytatow\n`
                }

            })
            msg += "```"
            message.reply(msg);
        } else if (args[1] === "revert") {
            let i = parseUUID(args[2]);
            if (isNaN(i) || i < 0) {
                message.reply(`Index nie może być < 0`)
                return;
            }
            if (i > fileList.length - 1) {
                message.reply(`Index nie może być > ilosci backupow`)
                return;
            }
            try {
                backup();
                cytaty = JSON.parse(fs.readFileSync("./backup/" + fileList[i], {encoding: "utf-8"}));
                saveQuotes();
                message.reply(`Przywrocono ${fileList[i]}`)
            } catch (e) {
                console.log(e)
            }
        } else {
            backup();
            message.reply(`Stworzono backup`)
        }
    }
    if (args[0] === "verify") {
        let msg = "```\n";
        let handled = [];
        let buttons = [];
        if (!checkPerms(message, [Permissions.FLAGS.MANAGE_GUILD])) return;
        cytaty.forEach(el => {
            let Corrected = verifyUser(getUser(el));
            if (Corrected.probability >= 0.6) {
                let actionsig = [getUser(el),Corrected.username];
                if(!handled.includes(JSON.stringify(actionsig))) {
                    handled.push(JSON.stringify(actionsig))
                    handled.push(JSON.stringify([Corrected.username, getUser(el)]))
                    let txt = `Username similarity issue ${Math.round(Corrected.probability*100)/100}: ${getUser(el)} <-> ${Corrected.username}\n`;
                    msg += txt;
                    if(buttons.length<5){
                        buttons.push({old:getUser(el),new:Corrected.username});
                    }
                }
            }
        })
        msg += "```\n"
        let rows = [];
        buttons.forEach(el=>{
            const row = new Discord.MessageActionRow()
                .addComponents(CreateActionButton({action:"merge",data:{new:el.new,old:el.old}}, `Merge as: ${el.new}`))
                .addComponents(CreateActionButton({action:"merge",data:{new:el.old,old:el.new}}, `Merge as: ${el.old}`))
            rows.push(row);
        })

        if(rows.length>0){
            await message.reply({
                content: msg,
                components: rows
            });
        }else{
            await message.reply({
                content: msg,
                components: rows
            });
        }
    }
}

function verifyCytat(cytat: Cytat_t, message?: Replayable, no_similarity = false) {
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

    if (checkExists(cytat)) {
        if (message != undefined)
            message.reply("Cytat już istnieje!");
        return false;
    }

    let verify_output = verifyUser(getUser(cytat));
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
        lista[currPage] += (`${el.info ? "+" : "-"} ${cytaty.indexOf(el)}: ${el.msg}\n`).replace("$PWrzesien;", miesiace[new Date().getMonth()])
    })

    let hasNextPage = lista.length > page;

    msg += lista[page - 1];

    msg = `\`\`\`diff\nPage ${page}/${lista.length} - ${count} z ${cytaty.length} cytatów. ${txt}\n` + msg

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

function checkPerms(message: Replayable, perms: bigint[]) {
    if (!message.guild.members.cache.get(message.member.user.id).permissions.has(perms)) {
        message.reply("Nie masz uprawnień");
        return false;
    }
    return true;
}

function checkIndex(message: Replayable, i: number) {
    if (i < 0 || isNaN(i)) {
        message.reply("Index nie moze być <0");
        return false;
    }
    if (i > cytaty.length - 1) {
        message.reply("Index nie moze być > ilosci cytatow");
        return false;
    }
    return true;
}

function checkExists(cytat: Cytat_t) {
    let exists = false
    cytaty.forEach(el => {
        if (el.msg == cytat.msg) {
            exists = true;
            return;
        }
    })
    return exists;
}

function saveQuotes() {
    fs.writeFileSync('./cytaty.json', JSON.stringify(cytaty), 'utf8')
    fs.writeFileSync('./votedUsers.json', JSON.stringify(votedUsers), 'utf8')
}

function backup() {
    try {
        fs.writeFileSync(`./backup/${(+new Date())}.backup.json`, JSON.stringify(cytaty));
    } catch {
    }
    let fileList = fs.readdirSync("./backup");
    while (fileList.length > 11) {
        let min = -1;
        fileList.forEach(el => {
            let ts = parseInt(el.split(".backup.json")[0]);
            if (ts < min || min < 0) min = ts;
        })
        fileList.forEach(el => {
            let ts = parseInt(el.split(".backup.json")[0]);
            if (!ts || (el.split(".backup.json")[1] && el.split(".backup.json")[1].length > 0)) {
                fs.unlinkSync("./backup/" + el);
            }
        })
        fs.unlinkSync("./backup/" + min.toString() + ".backup.json");
        fileList = fs.readdirSync("./backup");
    }
}

function TransformToUserArray(): Users {
    let users: Users = {};
    cytaty.forEach((cytat: Cytat_t) => {
        let user = getUser(cytat);
        if (!users[user] || !users[user].quotes) users[user] = {quotes: []};
        users[user].quotes.push(cytat);
    })
    return users;
}

function TransformToUserArrayNormalized(): Users {
    let users: Users = {};
    cytaty.forEach((cytat: Cytat_t) => {
        let _user = getUser(cytat);
        let user = normalizeStr(_user);
        if (!users[user] || !users[user].quotes) users[user] = {quotes: []};
        users[user].realname = _user;
        users[user].quotes.push(cytat);
    })
    return users;
}

function verifyUser(_user: string): { probability: number, username: string } {
    let UserArr = TransformToUserArrayNormalized();
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

function parseUUID(uuid) {
    let _i = uuid;
    cytaty.forEach((el, i) => {
        if (el.uuid == uuid) {
            _i = i;
        }
    })
    return parseInt(_i);
}