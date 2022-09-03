import {AutocompleteInteraction, ChatInputCommandInteraction} from "discord.js";
import {QuoteType, Replayable} from "./types";
import {
    addQuote,
    editQuote,
    getQuote,
    listQuotes,
    removeQuote, searchQuotes,
    setInfo,
    showQuoteInfo,
    showQuotesWithoutInfo, showTopQuotes, voteQuote
} from "./quotes";
import {checkPerms, checkSimilarity, getUser, normalizeStr, parseUUID} from "./util";
import {loadServerData, servers} from "./serverData";

export async function handleCommand(interaction: ChatInputCommandInteraction){
    let replayable = interaction as unknown as Replayable;

    switch (interaction.commandName) {
        case "quote": {
            let index = parseUUID(interaction.options.getNumber('index'), replayable);
            return await getQuote(replayable, index);
        }
        case "add": {
            let content = interaction.options.getString('content');
            return await addQuote(replayable, content, false);
        }
        case "edit": {
            let content = interaction.options.getString('content');
            let index = interaction.options.getNumber('index');
            return await editQuote(replayable, index, content);
        }
        case "remove": {
            let index = interaction.options.getNumber('index');
            return await removeQuote(replayable, index);
        }
        case "list": {
            let page = interaction.options.getNumber('page') || 1;
            let person = interaction.options.getString('person');
            return await listQuotes(replayable, person, page);
        }
        case "info":{
            let subcommand = interaction.options.getSubcommand();
            if(subcommand === "get"){
                let index = interaction.options.getNumber('index');
                return await showQuoteInfo(replayable,index)
            }
            if(subcommand === "set"){
                let index = interaction.options.getNumber('index');
                let info = interaction.options.getString('info');
                return await setInfo(replayable,index,info);
            }
            if(subcommand === "remove"){
                let index = interaction.options.getNumber('index');
                return await setInfo(replayable,index,"");
            }
            if(subcommand === "without"){
                let page = interaction.options.getNumber('page') || 1;
                return await showQuotesWithoutInfo(replayable,page);
            }
            return;
        }
        case "top":{
            let subcommand = interaction.options.getSubcommand();
            if(subcommand === "votes"){
                return await showTopQuotes(replayable,true)
            }
            if(subcommand === "amount"){
                return await showTopQuotes(replayable,false)
            }
            return;
        }
        case "vote":{
            let index = interaction.options.getNumber('index');
            return await voteQuote(replayable, index);
        }
        case "reload":{
            if (!checkPerms(replayable, "admin")) return;

            await loadServerData(interaction.guild.id, true);
            return await interaction.reply("Reloaded");
        }
        case "search":{
            let page = interaction.options.getNumber('page') || 1;
            let searchPhrase = interaction.options.getString("search_phrase");
            return await searchQuotes(replayable,searchPhrase,page);
        }
    }
}

export async function handleAutocomplete(interaction: AutocompleteInteraction){
    switch (interaction.commandName) {
        case "list": {
            const focusedOption = interaction.options.getFocused(true);
            if (focusedOption.name === 'person') {
                let typedPerson = normalizeStr(focusedOption.value);
                let quotes = servers[interaction.guild.id].quotes.sort((quote1: QuoteType, quote2: QuoteType) => {
                    let person1 = normalizeStr(getUser(quote1));
                    let person2 = normalizeStr(getUser(quote2));

                    let similarity1 = checkSimilarity(person1, typedPerson);
                    let similarity2 = checkSimilarity(person2, typedPerson);

                    if (similarity1 > similarity2) {
                        return -1;
                    }
                    if (similarity1 < similarity2) {
                        return 1;
                    }
                    return 0;
                })
                let persons = [];
                quotes.forEach((quote: QuoteType) => {
                    if (persons.length < 25) {
                        let unnormalisedPerson = getUser(quote);
                        let person = normalizeStr(unnormalisedPerson);
                        if (!persons.includes(unnormalisedPerson)) {
                            if (checkSimilarity(person, typedPerson) >= 0.60 || person.startsWith(typedPerson) || person.includes(typedPerson))
                                persons.push(unnormalisedPerson);
                        }
                    }
                })


                await interaction.respond(persons.map((person) => {
                    return ({name: person, value: person})
                }));
            }
        }
    }
}