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
        if (!logChannel) {
            console.error("❌ Log channel not found! Check LOG_CHANNEL_ID.");
            return;
        }
        const messages = await logChannel.messages.fetch({ limit: 50 });
        console.log(`📥 Fetched ${messages.size} messages from log channel.`);
        
        for (const msg of messages.values()) {
            await processMessageContent(msg);
        }
        await updateLeaderboard(client);
        console.log("✅ Initial history parsed successfully.");
    } catch (err) {
        console.error("❌ Error parsing history (Check channel permissions/ID):", err);
    }
}

async function processMessageContent(message) {
    let texts = [];
    if (message.content) texts.push(message.content);
    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        if (embed.title) texts.push(embed.title);
        if (embed.description) texts.push(embed.description);
        if (embed.fields && embed.fields.length > 0) {
            embed.fields.forEach(f => {
                if (f.name) texts.push(f.name);
                if (f.value) texts.push(f.value);
            });
        }
    }

    if (texts.length === 0) return;

    for (const text of texts) {
        const lines = text.split('\n');
        for (const line of lines) {
            // Cleanly strip leading emojis, ranking numbers, and symbols like #4, 🥇, etc.
            const cleanLine = line.replace(/^[🥇🥈🥉#\d\s]+/, '').trim();

            const arrowMatch = cleanLine.match(/^([a-zA-Z\s]+?):\s*[\d,.]+\s*(?:->|→)\s*([\d,.]+)\s*Dials/i);
            const standardMatch = cleanLine.match(/^([a-zA-Z\s]+?):\s*([\d,.]+)\s*Dials/i);

            let agentName = "";
            let dials = 0;

            if (arrowMatch) {
                agentName = arrowMatch[1].trim();
                dials = parseFloat(arrowMatch[2].replace(/,/g, ''));
            } else if (standardMatch) {
                agentName = standardMatch[1].trim();
                dials = parseFloat(standardMatch[2].replace(/,/g, ''));
            }

            if (agentName && !isNaN(dials)) {
                console.log(`✅ Matched -> Agent: ${agentName}, Dials: ${dials}`);
                await Agent.findOneAndUpdate({ name: agentName }, { dials: dials }, { upsert: true });
            }
        }
    }
}

client.on('messageCreate', async (message) => {
    if (message.channelId !== LOG_CHANNEL_ID) return;
    await processMessageContent(message);
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
        console.error("❌ Error updating leaderboard:", err);
    }
}

client.login(process.env.DISCORD_TOKEN);
