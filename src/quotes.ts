import {checkPerms, checkSimilarity, createUUID, getRandomInt, getUser, normalizeStr} from "./util";
import {ActionRowBuilder, ButtonStyle} from "discord.js";
import {miesiace} from "./index";
import {saveServerData, servers} from "./serverData";
import {QuoteType, QuoteMaxLength, Replayable, User, Users} from "./types";
import {CreateActionButton, CreateCmdButton} from "./buttons";
import * as Discord from "discord.js";

function checkIndex(message: Replayable, i: number) {
    if (i < 0 || isNaN(i)) {
        message.reply("Index nie moze być <0");
        return false;
    }
    if (i > servers[message.guild.id].quotes.length - 1) {
        message.reply("Index nie moze być > ilosci cytatow");
        return false;
    }
    return true;
}

function checkExists(cytat: QuoteType, message: Replayable) {
    let exists = false
    servers[message.guild.id].quotes.forEach(el => {
        if (el.msg == cytat.msg) {
            exists = true;
            return;
        }
    })
    return exists;
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

function verifyQuote(quote: QuoteType, message?: Replayable, no_similarity = false, edit = false) {
    if (quote.msg.length >= QuoteMaxLength) {
        if (message != undefined)
            message.reply(`Cytat jest za długi (max ${QuoteMaxLength} znakow)`)
        return false;
    }
    if (!quote.msg.includes(" ~ ") || getUser(quote).length < 1) {
        if (message != undefined)
            message.reply("Format cytatu jest nieprawidłowy\nCytat ~ Osoba")
        return false;
    }
    if (quote.msg.includes("\n")) {
        if (message != undefined)
            message.reply("Format cytatu jest nieprawidłowy\nNie może zawierać \\n")
        return false;
    }
    if (quote.msg.split("~").length > 2) {
        if (message != undefined)
            message.reply("Format cytatu jest nieprawidłowy\nCytat ~ Osoba")
        return false;
    }

    if (checkExists(quote, message) && !edit) {
        if (message != undefined)
            message.reply("Cytat już istnieje!");
        return false;
    }

    let verify_output = verifyUser(getUser(quote), message);
    if (!no_similarity) {
        if (verify_output.probability > 0.9) {
            let fix_msg = quote.msg.replace(` ~ ${getUser(quote)}`, ` ~ ${verify_output.username}`);
            const row = new ActionRowBuilder().addComponents(CreateActionButton({cmd: `~add ${fix_msg}`}, "Change to: " + verify_output.username, ButtonStyle.Success));
            if (message != undefined) {
                message.reply({
                    content: `Podana osoba istnieje pod podobna nazwa: ${verify_output.username}`,
                    // @ts-ignore
                    components: [row]
                });
            }
            return false;
        } else if (verify_output.probability >= 0.6) {
            let fix_msg = quote.msg.replace(` ~ ${getUser(quote)}`, ` ~ ${verify_output.username}`);
            const row = new ActionRowBuilder()
                .addComponents(CreateActionButton({cmd: `~add ${fix_msg}`}, "Change to: " + verify_output.username, ButtonStyle.Success))
                .addComponents(CreateActionButton({cmd: `~add-no-similarity ${quote.msg}`}, "Add anyway"))

            if (message != undefined) {
                message.reply({
                    content: `Podana osoba istnieje pod podobna nazwa: ${verify_output.username}`,
                    // @ts-ignore
                    components: [row]
                });
            }
            return false;
        }
    }
    return true;
}

function TransformToUserArrayNormalized(message: Replayable): Users {
    let users: Users = {};
    servers[message.guild.id].quotes.forEach((cytat: QuoteType) => {
        let _user = getUser(cytat);
        let user = normalizeStr(_user);
        if (!users[user] || !users[user].quotes) users[user] = {quotes: []};
        users[user].realname = _user;
        users[user].quotes.push(cytat);
    })
    return users;
}




export async function getQuote(message:Replayable,index?:number){
    if(index === undefined || isNaN(index) || index >= servers[message.guild.id].quotes.length || index < 0){
        index = getRandomInt(0, servers[message.guild.id].quotes.length - 1);
    }

    let quote = servers[message.guild.id].quotes[index];
    const row = new ActionRowBuilder()
        .addComponents(CreateCmdButton("~q", "Następny losowy", ButtonStyle.Success))
        .addComponents(CreateCmdButton("~info " + quote.uuid, "Info"))
        .addComponents(CreateCmdButton("~vote " + quote.uuid, "Vote"))
        .addComponents(CreateCmdButton("~history " + quote.uuid, "History"))

    // @ts-ignore
    await message.reply({
        content: `${index}: ${quote.msg.replace("$PWrzesien;", miesiace[new Date().getMonth()])}`,
        // @ts-ignore
        components: [row]
    });
}

export function showQuotes(message: Replayable, quoteArr: QuoteType[], page: number, txt: string) {
    let msg = "";
    let lista: string[] = [];

    let count = 0;
    let currPage = 0;

    quoteArr.forEach((el: any) => {
        if ((lista[currPage] + el.msg).length < 1800) {

        } else {
            currPage++;
        }
        if (!lista[currPage]) lista[currPage] = "";
        if (currPage == page - 1) count++;
        lista[currPage] += (`${el.info ? "+" : "-"} ${servers[message.guild.id].quotes.indexOf(el)}: ${el.msg}\n`).replace("$PWrzesien;", miesiace[new Date().getMonth()])
    })

    let hasNextPage = lista.length > page;

    msg += lista[page - 1];

    msg = `\`\`\`diff\nPage ${page}/${lista.length} - ${count} z ${servers[message.guild.id].quotes.length} cytatów. ${txt}\n` + msg

    msg += "\n"
    msg += `Length: ${msg.length}\n`
    msg += "```";

    let row: ActionRowBuilder;
    if (page > 1 || hasNextPage) {
        row = new ActionRowBuilder();
        row.addComponents(CreateActionButton({
            action: "pg",
            data: {quoteArr: quoteArr, page: page - 1, txt}
        }, "Poprzednia strona").setDisabled(page <= 1));
        row.addComponents(CreateActionButton({
            action: "pg",
            data: {quoteArr: quoteArr, page: page + 1, txt}
        }, "Nastepna strona").setDisabled(!hasNextPage));
        message.reply({
            content: msg,
            // @ts-ignore
            components: [row]
        });
    } else {
        message.reply({
            content: msg
        });
    }

}

export async function removeQuote(message:Replayable,index:number){
    if (!checkPerms(message, "admin")) return;
    if (!checkIndex(message, index)) return;
    let msg = servers[message.guild.id].quotes[index].msg;
    await saveServerData(message.guild.id, true)
    servers[message.guild.id].quotes.splice(index, 1);
    await saveServerData(message.guild.id);
    await message.reply(`Usunieto ${index}: ${msg}`)
}

export async function transferQuote(message:Replayable,prevName:string,newName:string){
    if (!checkPerms(message, "admin")) return;
    await saveServerData(message.guild.id, true)
    if (!prevName || !newName) {
        await message.reply('Format komendy: ~transfer "name" "newname"');
        return;
    }
    servers[message.guild.id].quotes.forEach((el: any, i: number) => {
        let osoba = getUser(el)
        if (osoba === prevName) {
            servers[message.guild.id].quotes[i].msg = servers[message.guild.id].quotes[i].msg.replace(prevName, newName);
        }
    });
    await saveServerData(message.guild.id);
    await message.reply(`Zamieniono "${prevName}" na ${newName}`);
    return;
}

export async function listQuotes(message:Replayable,user:string,page:number){
    let quoteArr: any = [];
    if (!user) {
        quoteArr = servers[message.guild.id].quotes;
        showQuotes(message, quoteArr, page, "");
    } else {
        servers[message.guild.id].quotes.forEach((el: QuoteType) => {
            if (getUser(el) === user) {
                quoteArr.push(el);
            }
        })
        showQuotes(message, quoteArr, page, `Cytaty użytkownika: ${user}`);
    }
}

export async function addQuote(message:Replayable,content:string,no_similarity:boolean){
    let quote = {
        msg: content,
        original_msg: content,
        info: undefined,
        votes: 0,
        uuid: createUUID(),
        history: {created: +new Date(), created_by: message.member.user.id, edits: []}
    };

    if (!verifyQuote(quote, message, no_similarity)) return;

    servers[message.guild.id].quotes.push(quote);
    await saveServerData(message.guild.id);

    const row = new Discord.ActionRowBuilder().addComponents(CreateActionButton({
        action: "rem-uuid",
        author: message.member.user.id,
        data: quote.uuid,
    }, "Usuń (w celu poprawy błędu)", ButtonStyle.Danger));

    // @ts-ignore
    await message.reply({
        content: `Dodano cytat ${servers[message.guild.id].quotes.length - 1}: \n${quote.msg}`,
        // @ts-ignore
        components: [row]
    });
}

export async function searchQuotes(message:Replayable,searchPhrase:string,page:number){
    if (!searchPhrase) {
        await message.reply("Podaj słowo szukane");
        return;
    }

    let quoteArr: any = [];
    servers[message.guild.id].quotes.forEach((el: { msg: any; }) => {
        if (normalizeStr(el.msg)
            .replace("$PWrzesien;", miesiace[new Date().getMonth()]).includes(normalizeStr(searchPhrase))) {
            quoteArr.push(el);
        }
    })
    showQuotes(message, quoteArr, page, `Cytaty zawierające: ${searchPhrase}`);
}

export async function showTopQuotes(message:Replayable,topVotes:boolean){
    let msg = "```\n";

    let osoby: any = {};
    let osobySorted: any = [];

    if (topVotes) {
        servers[message.guild.id].quotes.forEach((el: any) => {
            if (!el.votes) {
                el.votes = 0;
            }
            osoby[el.msg] = el.votes;
        })
    } else {
        servers[message.guild.id].quotes.forEach((el: any) => {
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

export async function editQuote(message:Replayable,index:number,newContent:string){
    if (!checkPerms(message, "edit")) return;
    if (!checkIndex(message, index)) return;

    let cytat = servers[message.guild.id].quotes[index];
    cytat.msg = newContent;

    if (!verifyQuote(cytat, message, false, true)) return;
    let msg2 = servers[message.guild.id].quotes[index].msg;
    await saveServerData(message.guild.id, true)
    servers[message.guild.id].quotes[index] = cytat;

    if (!servers[message.guild.id].quotes[index].history) servers[message.guild.id].quotes[index].history = {
        created: +new Date(),
        created_by: message.member.user.id,
        edits: []
    };
    if (!servers[message.guild.id].quotes[index].history.edits) servers[message.guild.id].quotes[index].history.edits = [];
    servers[message.guild.id].quotes[index].history.edits.push({
        change: newContent,
        by: message.member.user.id,
        date: +new Date(),
        type: "msg"
    });
    await saveServerData(message.guild.id);

    await message.reply(`Edytowano ${index}: ${msg2} na ${cytat.msg}`);
}

export async function setInfo(message:Replayable,index:number,infoContent:string){
    if (!checkIndex(message, index)) return;
    await saveServerData(message.guild.id, true)
    if (!servers[message.guild.id].quotes[index].history) servers[message.guild.id].quotes[index].history = {
        created: +new Date(),
        created_by: message.member.user.id,
        edits: []
    };
    if (!servers[message.guild.id].quotes[index].history.edits) servers[message.guild.id].quotes[index].history.edits = [];

    servers[message.guild.id].quotes[index].history.edits.push({
        change: infoContent,
        by: message.member.user.id,
        date: +new Date(),
        type: "info"
    });
    servers[message.guild.id].quotes[index].info = infoContent;
    await saveServerData(message.guild.id);
    await message.reply(`Ustawiono informacje o: ${servers[message.guild.id].quotes[index].msg}\n${servers[message.guild.id].quotes[index].info}`)
}

export async function showQuotesWithoutInfo(message:Replayable,page:number){
    if (!page) {
        page = 1;
    }

    let quoteArr: any = [];
    servers[message.guild.id].quotes.forEach((el: any) => {
        if (!el.info) {
            quoteArr.push(el);
        }
    })
    showQuotes(message, quoteArr, page, `Cytaty bez dodanych informacji`);
}

export async function showQuoteInfo(message:Replayable,index:number){
    if (!checkIndex(message, index)) return;

    await message.reply(`Informacje o: ${servers[message.guild.id].quotes[index].msg}\n${servers[message.guild.id].quotes[index].info}`)

}

export async function showQuoteUUID(message:Replayable,index:number){
    if (!checkIndex(message, index)) return;
    await message.reply(`UUID cytatu ${index}: ${servers[message.guild.id].quotes[index].uuid}`)
}

export async function showQuoteHistory(message:Replayable,index:number){
    if (!checkIndex(message, index)) return;

    let txt = "";

    if (!servers[message.guild.id].quotes[index].history) {
        await message.reply(`Brak historii`)
        return;
    }
    txt += `CREATED BY: ${servers[message.guild.id].quotes[index].history.created_by}\nWHEN: ${new Date(servers[message.guild.id].quotes[index].history.created).toLocaleString("PL")}\n`;
    servers[message.guild.id].quotes[index].history.edits.forEach(el => {
        txt += `TYPE: ${el.type} BY: <@${el.by}> CHANGE: ${el.change} WHEN: ${new Date(el.date).toLocaleString("PL")}\n`
    })

    await message.reply(`Historia cytatu: ${servers[message.guild.id].quotes[index].msg}\n\`\`\`\n${txt}\n\`\`\``)
}

export async function setQuoteVotesCount(message:Replayable,index:number,count:number){
    if (!checkIndex(message, index)) return;
    if (!checkPerms(message, "admin")) return;

    if (count < 0 || isNaN(count)) {
        await message.reply("Liczba nie moze być <0");
        return;
    }

    servers[message.guild.id].quotes[index].votes = count;
    await saveServerData(message.guild.id);
    await message.reply(`Ustawiono ilość głosów: ${servers[message.guild.id].quotes[index].msg}\nIlość głosów: ${servers[message.guild.id].quotes[index].votes}`)
    return;
}

export async function voteQuote(message:Replayable,index:number){
    let ts: number = +new Date();

    if (servers[message.guild.id].voted_users[message.member.user.id.toString()] && servers[message.guild.id].voted_users[message.member.user.id.toString()].ts) {
        if (((servers[message.guild.id].voted_users[message.member.user.id.toString()].ts) + (servers[message.guild.id].config.vote_cooldown * 1000)) > ts) {
            let timeLeft = servers[message.guild.id].voted_users[message.member.user.id.toString()].ts + (servers[message.guild.id].config.vote_cooldown * 1000) - ts;
            let minutes = Math.floor(timeLeft / 1000 / 60);
            let hours = Math.floor(minutes / 60);
            await message.reply(`You are still on cooldown: ${hours}h ${minutes % 60}m`)
            return;
        }
    }

    servers[message.guild.id].voted_users[message.member.user.id.toString()] = {ts: ts}

    if (!servers[message.guild.id].quotes[index].votes) servers[message.guild.id].quotes[index].votes = 0;
    servers[message.guild.id].quotes[index].votes += 1;
    await saveServerData(message.guild.id);
    await message.reply(`Zagłosowano na: ${servers[message.guild.id].quotes[index].msg}\nIlość głosów: ${servers[message.guild.id].quotes[index].votes}`)
    return;
}

export async function verifyQuotes(message:Replayable){
    let msg = "```\n";
    let handled = [];
    let buttons = [];
    if (!checkPerms(message, "admin")) return;
    servers[message.guild.id].quotes.forEach(el => {
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
        const row = new ActionRowBuilder()
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