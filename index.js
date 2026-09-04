require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot running'));
app.listen(process.env.PORT || 3000);

mongoose.connect(process.env.MONGO_URI);
const Agent = mongoose.model('Agent', new mongoose.Schema({ name: String, dials: Number }));

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID; 
const LEADERBOARD_CHANNEL_ID = process.env.LEADERBOARD_CHANNEL_ID; 
let masterMessageId = null; 

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await parseLogChannelHistory();
});

async function parseLogChannelHistory() {
    try {
        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (!logChannel) return;
        const messages = await logChannel.messages.fetch({ limit: 100 });
        
        for (const msg of messages.values()) {
            processMessageContent(msg);
        }
        await updateLeaderboard(client);
        console.log("Initial history parsed successfully.");
    } catch (err) {
        console.error("Error parsing history:", err);
    }
}

function processMessageContent(message) {
    const text = message.embeds[0]?.description || message.embeds[0]?.title || message.content;
    if (!text) return;

    const lines = text.split('\n');
    for (const line of lines) {
        let agentName = "";
        let dials = 0;

        // Strip leading emojis and symbols (like 🥇, 🥈, 🥉, 📈, etc.)
        const cleanLine = line.replace(/^[^\w#]+/, '').trim();

        const arrowMatch = cleanLine.match(/(?:#\d+\s*)?([a-zA-Z\s]+?):\s*[\d,.]+\s*(?:->|→)\s*([\d,.]+)\s*Dials/i);
        if (arrowMatch) {
            agentName = arrowMatch[1].trim();
            dials = parseFloat(arrowMatch[2].replace(/,/g, ''));
        } else {
            const standardMatch = cleanLine.match(/(?:#\d+\s*)?([a-zA-Z\s]+?):\s*([\d,.]+)\s*Dials/i);
            if (standardMatch) {
                agentName = standardMatch[1].trim();
                dials = parseFloat(standardMatch[2].replace(/,/g, ''));
            }
        }

        if (agentName && !isNaN(dials)) {
            Agent.findOneAndUpdate({ name: agentName }, { dials: dials }, { upsert: true }).exec();
        }
    }
}

client.on('messageCreate', async (message) => {
    if (message.channelId !== LOG_CHANNEL_ID) return;
    processMessageContent(message);
    await updateLeaderboard(message.client);
});

async function updateLeaderboard(clientInstance) {
    try {
        const channel = await clientInstance.channels.fetch(LEADERBOARD_CHANNEL_ID);
        const agents = await Agent.find().sort({ dials: -1 });

        let boardText = "";
        agents.forEach((a, i) => {
            let rank = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
            boardText += `${rank} **${a.name}**: ${a.dials} Dials\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle('🏆 Master Live Leaderboard')
            .setDescription(boardText || "No data yet.")
            .setColor(0xFEE75C)
            .setTimestamp();

        if (masterMessageId) {
            try {
                const msg = await channel.messages.fetch(masterMessageId);
                return await msg.edit({ embeds: [embed] });
            } catch (e) { masterMessageId = null; }
        }
        
        const newMsg = await channel.send({ embeds: [embed] });
        masterMessageId = newMsg.id;
    } catch (err) {
        console.error("Error updating leaderboard:", err);
    }
}

client.login(process.env.DISCORD_TOKEN);
