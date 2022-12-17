import fs from "fs";
import * as Discord from "discord.js";
import {
    Message,
    Permissions,
    Routes,
    SlashCommandBuilder,
    GatewayIntentBits,
    PermissionsBitField,
    ButtonStyle,
    ChatInputCommandInteraction
} from "discord.js";

import {Replayable} from "./types";
import admin from "firebase-admin";
import {REST} from "@discordjs/rest";
import {loadServerData, saveServerData, servers} from "./serverData";
import {button_actions, clearTimedOutActions} from "./buttons";
import {
    addQuote,
    editQuote,
    getQuote,
    listQuotes,
    removeQuote,
    searchQuotes,
    setInfo, setQuoteVotesCount, showQuoteHistory, showQuoteInfo,
    showQuotes, showQuotesWithoutInfo, showQuoteUUID,
    showTopQuotes,
    transferQuote, verifyQuotes,
    voteQuote
} from "./quotes";
import {checkPerms, getUser, parseUUID} from "./util";
import {handleAutocomplete, handleCommand} from "./interactions";

export const miesiace = ["Pani Styczeń", "Pani Luteń", "Pani Marzeń", "Pani Kwiecień", "Pani Majeń", "Pani Czerwień", "Pani Lipień", "Pani Sierpień", "Pani Wrzesień", "Pani Pazdziernień", "Pani Listopień", "Pani Grudzień"]

const client = new Discord.Client({intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]});

let config: { token: string, clientId:string } = {token: "",clientId:""}

try {
    config = JSON.parse(fs.readFileSync('./config.json', 'utf8'))
} catch {

}

const rest = new REST({version: '10'}).setToken(config.token);
const clientId = config.clientId;

async function main() {
    console.log("Starting...")
    await client.login(config.token)
    console.log("Ready!");

    const commands = [
        new SlashCommandBuilder().setName('quote')
            .addNumberOption(option => option.setName("index").setDescription("Quote uuid or index"))
            .setDescription('Replies with a random or specified quote.'),
        new SlashCommandBuilder().setName('add')
            .addStringOption(option => option.setName("content").setDescription("Quote content in format: content ~ person").setRequired(true))
            .setDescription('Adds new quote to list.'),
        new SlashCommandBuilder().setName('edit')
            .addNumberOption(option => option.setName("index").setDescription("Quote uuid or index to edit").setRequired(true))
            .addStringOption(option => option.setName("content").setDescription("Quote content in format: content ~ person").setRequired(true))
            .setDescription('Edits a quote.'),
        new SlashCommandBuilder().setName('remove')
            .addNumberOption(option => option.setName("index").setDescription("Quote uuid or index to edit").setRequired(true))
            .setDescription('Removes a quote.'),
        new SlashCommandBuilder().setName('list')
            .addNumberOption(option => option.setName("page").setDescription("List page to show"))
            .addStringOption(option => option.setName("person").setDescription("Show only quotes for specific person").setAutocomplete(true))
            .setDescription('Shows list of quotes'),
        new SlashCommandBuilder().setName('info')
            .addSubcommand(subcommand => subcommand.setName("get").setDescription("Get quote info").addNumberOption(option => option.setName("index").setDescription("Quote index or uuid").setRequired(true)))
            .addSubcommand(subcommand => subcommand.setName("set").setDescription("Set quote info").addNumberOption(option => option.setName("index").setDescription("Quote index or uuid").setRequired(true)).addStringOption(option => option.setName("info").setDescription("Quote info").setRequired(true)))
            .addSubcommand(subcommand => subcommand.setName("remove").setDescription("Remove quote info").addNumberOption(option => option.setName("index").setDescription("Quote index or uuid").setRequired(true)))
            .addSubcommand(subcommand => subcommand.setName("without").setDescription("Show quotes without info").addNumberOption(option => option.setName("page").setDescription("List page to show")))
            .setDescription('Manage info of quotes'),
        new SlashCommandBuilder().setName('top')
            .addSubcommand(subcommand => subcommand.setName("amount").setDescription("Show users with the most amount of quotes"))
            .addSubcommand(subcommand => subcommand.setName("votes").setDescription("Show the most voted quotes"))
            .setDescription('Show top of quotes'),
        new SlashCommandBuilder().setName('vote')
            .addNumberOption(option => option.setName("index").setDescription("Quote uuid or index").setRequired(true))
            .setDescription('Vote on quote'),
        new SlashCommandBuilder().setName('search')
            .addStringOption(option => option.setName("search_phrase").setDescription("Phrase to search").setRequired(true))
            .addNumberOption(option => option.setName("page").setDescription("List page to show"))
            .setDescription('Search quotes'),
        new SlashCommandBuilder().setName('reload')
            .setDescription('Reloads server file'),


    ].map(command => command.toJSON());

    await rest.put(
        Routes.applicationCommands(clientId),
        {body: commands},
    );

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
        await loadServerData(interaction.guild.id);
        if (interaction.isButton()) {
            clearTimedOutActions();
            if (await buttonAction(interaction)) {
                let _id = interaction.customId.split(";");
                delete button_actions[Number(_id[0])];
            }
        } else if (interaction.isCommand() && interaction instanceof ChatInputCommandInteraction) {
            await handleCommand(interaction)

        } else if (interaction.isAutocomplete()) {
            await handleAutocomplete(interaction)
        }
    } catch (ex) {
        if (interaction.isButton() || interaction.isCommand()) {
            await interaction.reply(`ERROR: ${ex}`)
        }
    }
});

async function buttonAction(message: Discord.ButtonInteraction): Promise<boolean> {
    let _id = message.customId.split(";");
    if (_id[0] == "cmd") {
        await handleCmd(_id[1], message);
        return true;
    }

    let btn_action = button_actions[Number(_id[0])];
    if (!btn_action) {
        if (Math.random() < 0.05) {
            await message.reply(`Inwalida prince polo akcja!`);
        } else {
            await message.reply(`Invalid button action!`);
        }

        return false;
    }

    if (btn_action.action) {
        if (btn_action.action == "rem-uuid") {
            if (!message.guild.members.cache.get(message.member.user.id).permissions.has([PermissionsBitField.Flags.ManageGuild]))
                if (btn_action.author != message.member.user.id) {
                    await message.reply(`Only author or admin can do it!`);
                    return false;
                }
            await saveServerData(message.guild.id, true)
            let uuid = (btn_action.data);
            let deleted_id = -1;
            let deleted_cytat;
            servers[message.guild.id].quotes.forEach((el, i) => {
                if (el.uuid == uuid) {
                    deleted_id = i;
                    deleted_cytat = el;
                    servers[message.guild.id].quotes.splice(i, 1);
                    return;
                }
            })
            await saveServerData(message.guild.id);
            if (deleted_id >= 0) {
                await message.reply(`Usunieto ${deleted_id}: ${deleted_cytat.msg}`);
                return true;
            } else {
                await message.reply(`Nie znaleziono!`)
                return false;
            }
        }
        if (btn_action.action == "pg") {
            showQuotes(message, btn_action.data.quoteArr, btn_action.data.page, btn_action.data.txt);
            return true;
        }
        if (btn_action.action == "merge") {
            let _old = btn_action.data.old;
            let _new = btn_action.data.new;
            if (!checkPerms(message, "admin")) return;
            await saveServerData(message.guild.id, true)
            servers[message.guild.id].quotes.forEach((el: any, i: number) => {
                let osoba = getUser(el)
                if (osoba === _old) {
                    servers[message.guild.id].quotes[i].msg = servers[message.guild.id].quotes[i].msg.replace(_old, _new);
                }
            });
            await saveServerData(message.guild.id);
            await message.reply(`Zamieniono "${_old}" na ${_new}`);
            return true;
        }
    }

    await handleCmd(btn_action.cmd, message);
    return true;
}

async function handleCmd(content: string, message: Replayable) {
    const args = content.replace('~', '').split(' ');
    await loadServerData(message.guild.id);

    if (args[0] === "add" || args[0] === "add-no-similarity") {
        let no_similarity = false;
        if (args[0] === "add-no-similarity") no_similarity = true;

        let msg = args.slice(1).join(" ");
        return await addQuote(message, msg, no_similarity);
    }
    if (args[0] === "q" || args[0] === "quote") {
        let index = parseUUID(args[1], message);
        return await getQuote(message, index)
    }
    if (args[0] === "list") {
        let page: number = parseInt(args[1]);
        let user = args.slice(2).join(" ");
        if (!page) {
            page = 1;
            user = args.slice(1).join(" ");
        }
        return await listQuotes(message, user, page)
    }
    if (args[0] === "search") {
        let page: number = parseInt(args[1]);
        let searchPhrase = args.slice(2).join(" ");
        if (!page) {
            page = 1;
            searchPhrase = args.slice(1).join(" ");
        }

        return await searchQuotes(message, searchPhrase, page)
    }
    if (args[0] === "top") {
        return await showTopQuotes(message, args[1] === "votes");
    }
    if (args[0] === "transfer") {
        if (!(message instanceof Message)) return;
        let prevName = message.content.split('"')[1];
        let newName = message.content.split('"')[3];
        return await transferQuote(message, prevName, newName);
    }
    if (args[0] === "rem" || args[0] === "remove") {
        let i = parseUUID(args[1], message);
        return await removeQuote(message, i);
    }
    if (args[0] === "edit") {
        let i = parseUUID(args[1], message);
        let msg = args.slice(2).join(" ");

        return await editQuote(message, i, msg);
    }
    if (args[0] === "write") {
        if (!checkPerms(message, "admin")) return;
        await saveServerData(message.guild.id);
        await message.reply("Written config");
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
        msg += "~write                       - zapisz cytaty\n"
        msg += "~help                        - to info\n"
        msg += "```"

        await message.reply(msg);
    }
    if (args[0] === "reload") {
        if (!checkPerms(message, "admin")) return;

        await loadServerData(message.guild.id, true);
        await message.reply("Reloaded");
    }
    if (args[0] === "dump") {
        if (!checkPerms(message, "root")) return;
        let filename = "./dump_" + message.guild.id + ".json"
        fs.writeFileSync(filename, JSON.stringify(servers[message.guild.id]), {encoding: "utf8"});
        await message.reply(`dumped to ${filename}`);
    } else if (args[0] === "uuid") {
        let index = parseUUID(args[1], message);
        return await showQuoteUUID(message, index)
    }
    if (args[0] === "info") {
        if (args[1] === "set") {
            let index = parseUUID(args[2], message);
            let infoContent = args.slice(3).join(" ");
            return await setInfo(message, index, infoContent);
        } else if (args[1] === "rem") {
            let index = parseUUID(args[2], message);
            return await setInfo(message, index, "");
        } else if (args[1] === "lsnull") {
            let page: number = parseInt(args[2]);
            return await showQuotesWithoutInfo(message, page);
        } else {
            let index = parseUUID(args[1], message);
            return await showQuoteInfo(message, index);
        }
    }
    if (args[0] === "history") {
        let index = parseUUID(args[1], message);
        return await showQuoteHistory(message, index)
    }
    if (args[0] === "file") {
        await loadServerData(message.guild.id);
        await message.reply(`Informacje o pliku serwera ${message.guild.id}:\nIlość cytatów: ${servers[message.guild.id].quotes.length}\nAby przeładować cytaty z pliku użyj ~reload`);
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
                    await saveServerData(message.guild.id);
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
                await saveServerData(message.guild.id);
                return;
            }
        } else if (args[1] === "cooldown") {
            let cooldown = Number(args[2]);
            if (cooldown > 0) {
                await message.reply(`changed vote cooldown from: ${servers[message.guild.id].config.vote_cooldown} to: ${cooldown}`);
                servers[message.guild.id].config.vote_cooldown = cooldown;
                await saveServerData(message.guild.id);
                return;
            } else {
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

        if (args[2] === "set") {
            let votes = parseInt(args[3])
            return await setQuoteVotesCount(message, i, votes);
        }

        return await voteQuote(message, i);
    }
    if (args[0] === "backup") {
        if (!checkPerms(message, "admin")) return;
        if (args[1] === "revert") {
            let i = parseUUID(args[2], message);
            if (isNaN(i) || i < 0) {
                await message.reply(`Index nie może być < 0`)
                return;
            }
            await saveServerData(message.guild.id, true);
            await loadServerData(message.guild.id, true, i)
            await saveServerData(message.guild.id);
            await message.reply(`Przywrocono ${i}`)
        } else if (args[1] === "make") {
            await saveServerData(message.guild.id, true);
            await message.reply(`Stworzono backup`)
        } else {
            await message.reply(`Available commands: make, revert, list`);
        }
    }
    if (args[0] === "verify") {
        return await verifyQuotes(message);
    }
}
